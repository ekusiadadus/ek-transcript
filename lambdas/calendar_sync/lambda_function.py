"""
Calendar Sync Lambda

Google Calendar イベントの取得・同期・作成を担当。
Meet リンク付きイベントを管理する。
Google Meet REST API v2 で録画を取得する。

Version: 1.2 - Added Google Meet REST API v2 for recordings
"""

import json
import logging
import os
import sys
import uuid
from datetime import datetime, timedelta, timezone
from io import BytesIO

import boto3
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload

# 共有モジュールのパスを追加
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "shared"))
from google_token_manager import get_valid_credentials  # noqa: E402

# ロガー設定
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# AWS クライアント
dynamodb = boto3.resource("dynamodb")
s3_client = boto3.client("s3")

# 環境変数
MEETINGS_TABLE = os.environ.get("MEETINGS_TABLE", "")
RECORDINGS_BUCKET = os.environ.get("RECORDINGS_BUCKET", "")


def list_events(
    user_id: str,
    time_min: str = None,
    time_max: str = None,
    page_token: str = None,
    max_results: int = 50,
) -> dict:
    """
    Google Calendar イベントを取得

    Args:
        user_id: ユーザー ID
        time_min: 開始日時（RFC3339形式）
        time_max: 終了日時（RFC3339形式）
        page_token: ページネーショントークン
        max_results: 最大取得件数

    Returns:
        イベントリストとページネーション情報
    """
    logger.info(f"Listing calendar events for user: {user_id}")

    credentials = get_valid_credentials(user_id)
    service = build("calendar", "v3", credentials=credentials)

    # デフォルトは今日から30日間
    if not time_min:
        time_min = datetime.now(timezone.utc).isoformat()
    if not time_max:
        time_max = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()

    request_params = {
        "calendarId": "primary",
        "timeMin": time_min,
        "timeMax": time_max,
        "singleEvents": True,
        "orderBy": "startTime",
        "maxResults": max_results,
    }

    if page_token:
        request_params["pageToken"] = page_token

    response = service.events().list(**request_params).execute()

    events = response.get("items", [])
    next_page_token = response.get("nextPageToken")

    logger.info(f"Found {len(events)} events")

    return {
        "events": events,
        "nextPageToken": next_page_token,
    }


def get_event(user_id: str, event_id: str) -> dict:
    """
    特定のカレンダーイベントを取得

    Args:
        user_id: ユーザー ID
        event_id: イベント ID

    Returns:
        イベント情報
    """
    logger.info(f"Getting event {event_id} for user: {user_id}")

    credentials = get_valid_credentials(user_id)
    service = build("calendar", "v3", credentials=credentials)

    event = service.events().get(calendarId="primary", eventId=event_id).execute()

    return event


def create_event(
    user_id: str,
    title: str,
    start_time: str,
    end_time: str,
    description: str = None,
    attendees: list = None,
    timezone_str: str = "Asia/Tokyo",
) -> dict:
    """
    Meet リンク付きカレンダーイベントを作成

    Args:
        user_id: ユーザー ID
        title: イベントタイトル
        start_time: 開始日時（ISO 8601形式）
        end_time: 終了日時（ISO 8601形式）
        description: 説明
        attendees: 参加者リスト [{"email": "..."}]
        timezone_str: タイムゾーン

    Returns:
        作成されたイベント
    """
    logger.info(f"Creating event '{title}' for user: {user_id}")

    credentials = get_valid_credentials(user_id)
    service = build("calendar", "v3", credentials=credentials)

    # Meet リンク作成用の一意な requestId を生成
    request_id = str(uuid.uuid4())

    event_body = {
        "summary": title,
        "start": {
            "dateTime": start_time,
            "timeZone": timezone_str,
        },
        "end": {
            "dateTime": end_time,
            "timeZone": timezone_str,
        },
        "conferenceData": {
            "createRequest": {
                "requestId": request_id,
                "conferenceSolutionKey": {"type": "hangoutsMeet"},
            }
        },
    }

    if description:
        event_body["description"] = description

    if attendees:
        event_body["attendees"] = attendees

    # conferenceDataVersion=1 で Meet リンクを自動作成
    event = (
        service.events()
        .insert(calendarId="primary", body=event_body, conferenceDataVersion=1)
        .execute()
    )

    logger.info(f"Created event: {event.get('id')}")

    return event


def search_drive_recordings(user_id: str, days_back: int = 30) -> list:
    """
    Google Drive から Meet 録画ファイルを検索

    Args:
        user_id: ユーザー ID
        days_back: 何日前まで検索するか

    Returns:
        録画ファイルのリスト
    """
    logger.info(f"Searching Drive recordings for user: {user_id}, days_back: {days_back}")

    credentials = get_valid_credentials(user_id)
    service = build("drive", "v3", credentials=credentials)

    # 検索期間
    date_after = (datetime.now(timezone.utc) - timedelta(days=days_back)).isoformat()

    # Meet 録画ファイルを検索（動画ファイルで "Meet" または "Recording" を含む）
    query = f"(mimeType contains 'video/' or name contains 'Recording') and modifiedTime > '{date_after}'"

    recordings = []
    page_token = None

    while True:
        response = service.files().list(
            q=query,
            spaces="drive",
            fields="nextPageToken, files(id, name, mimeType, size, createdTime, modifiedTime, webViewLink)",
            pageToken=page_token,
            pageSize=100,
        ).execute()

        files = response.get("files", [])
        recordings.extend(files)

        page_token = response.get("nextPageToken")
        if not page_token:
            break

    logger.info(f"Found {len(recordings)} recording files in Drive")
    return recordings


def download_recording_from_drive(user_id: str, file_id: str) -> tuple[bytes, dict]:
    """
    Google Drive から録画ファイルをダウンロード

    Args:
        user_id: ユーザー ID
        file_id: Drive ファイル ID

    Returns:
        (ファイル内容, メタデータ)
    """
    logger.info(f"Downloading recording from Drive: {file_id}")

    credentials = get_valid_credentials(user_id)
    service = build("drive", "v3", credentials=credentials)

    # メタデータ取得
    metadata = service.files().get(
        fileId=file_id,
        fields="id, name, mimeType, size, createdTime"
    ).execute()

    logger.info(f"Downloading: {metadata.get('name')} ({metadata.get('size')} bytes)")

    # ファイルダウンロード
    request = service.files().get_media(fileId=file_id)
    file_buffer = BytesIO()
    downloader = MediaIoBaseDownload(file_buffer, request)

    done = False
    while not done:
        status, done = downloader.next_chunk()
        if status:
            logger.info(f"Download progress: {int(status.progress() * 100)}%")

    file_buffer.seek(0)
    return file_buffer.read(), metadata


def upload_recording_to_s3(
    content: bytes,
    user_id: str,
    meeting_id: str,
    file_name: str,
    content_type: str = "video/mp4"
) -> str:
    """
    録画ファイルを S3 にアップロード

    Args:
        content: ファイル内容
        user_id: ユーザー ID
        meeting_id: ミーティング ID
        file_name: ファイル名
        content_type: コンテンツタイプ

    Returns:
        S3 キー
    """
    s3_key = f"recordings/{user_id}/{meeting_id}/{file_name}"
    logger.info(f"Uploading to S3: s3://{RECORDINGS_BUCKET}/{s3_key}")

    file_buffer = BytesIO(content)
    s3_client.upload_fileobj(
        file_buffer,
        RECORDINGS_BUCKET,
        s3_key,
        ExtraArgs={"ContentType": content_type},
    )

    return s3_key


def list_conference_records(
    user_id: str,
    start_time: str = None,
    end_time: str = None,
    page_size: int = 100,
) -> list:
    """
    Google Meet REST API v2 で会議記録を取得

    Args:
        user_id: ユーザー ID
        start_time: 開始日時（RFC3339形式）
        end_time: 終了日時（RFC3339形式）
        page_size: 1ページあたりの最大件数

    Returns:
        会議記録のリスト
    """
    logger.info(f"Listing conference records for user: {user_id}")

    credentials = get_valid_credentials(user_id)
    service = build("meet", "v2", credentials=credentials)

    all_records = []
    page_token = None

    # フィルター構築
    filter_parts = []
    if start_time:
        filter_parts.append(f'start_time>="{start_time}"')
    if end_time:
        filter_parts.append(f'end_time<="{end_time}"')
    filter_str = " AND ".join(filter_parts) if filter_parts else None

    while True:
        request_params = {"pageSize": page_size}
        if filter_str:
            request_params["filter"] = filter_str
        if page_token:
            request_params["pageToken"] = page_token

        response = service.conferenceRecords().list(**request_params).execute()

        records = response.get("conferenceRecords", [])
        all_records.extend(records)

        page_token = response.get("nextPageToken")
        if not page_token:
            break

    logger.info(f"Found {len(all_records)} conference records")
    return all_records


def list_conference_recordings(user_id: str, conference_record_name: str) -> list:
    """
    特定の会議の録画一覧を取得

    Args:
        user_id: ユーザー ID
        conference_record_name: 会議記録名（例: conferenceRecords/xxx）

    Returns:
        録画のリスト
    """
    logger.info(f"Listing recordings for conference: {conference_record_name}")

    credentials = get_valid_credentials(user_id)
    service = build("meet", "v2", credentials=credentials)

    all_recordings = []
    page_token = None

    while True:
        request_params = {"parent": conference_record_name, "pageSize": 100}
        if page_token:
            request_params["pageToken"] = page_token

        response = service.conferenceRecords().recordings().list(**request_params).execute()

        recordings = response.get("recordings", [])
        all_recordings.extend(recordings)

        page_token = response.get("nextPageToken")
        if not page_token:
            break

    logger.info(f"Found {len(all_recordings)} recordings for conference")
    return all_recordings


def sync_meet_recordings(user_id: str, days_back: int = 30) -> dict:
    """
    Google Meet REST API v2 を使用して録画を同期

    Args:
        user_id: ユーザー ID
        days_back: 何日前まで検索するか

    Returns:
        同期結果
    """
    logger.info(f"Syncing Meet recordings for user: {user_id}, days_back: {days_back}")

    # 検索期間
    start_time = (datetime.now(timezone.utc) - timedelta(days=days_back)).isoformat()

    # 会議記録を取得
    conference_records = list_conference_records(user_id, start_time=start_time)

    recordings_found = []
    recordings_downloaded = []

    for record in conference_records:
        record_name = record.get("name")
        space_name = record.get("space")  # spaces/xxx 形式

        # この会議の録画を取得
        recordings = list_conference_recordings(user_id, record_name)

        for recording in recordings:
            recording_state = recording.get("state")

            # FILE_GENERATED 状態の録画のみ処理
            if recording_state != "FILE_GENERATED":
                logger.info(f"Skipping recording {recording.get('name')} - state: {recording_state}")
                continue

            drive_dest = recording.get("driveDestination", {})
            file_id = drive_dest.get("file")
            export_uri = drive_dest.get("exportUri")

            if not file_id:
                logger.warning(f"No file ID for recording: {recording.get('name')}")
                continue

            recordings_found.append({
                "recording_name": recording.get("name"),
                "conference_record": record_name,
                "space": space_name,
                "start_time": recording.get("startTime"),
                "end_time": recording.get("endTime"),
                "drive_file_id": file_id,
                "export_uri": export_uri,
            })

    logger.info(f"Found {len(recordings_found)} recordings with files")

    return {
        "conference_records_count": len(conference_records),
        "recordings_found": recordings_found,
        "recordings_downloaded": recordings_downloaded,
    }


def sync_events(user_id: str, days_ahead: int = 30, days_back: int = 0) -> dict:
    """
    Google Calendar と Meetings テーブルを同期

    Args:
        user_id: ユーザー ID
        days_ahead: 何日先までを同期するか
        days_back: 何日前まで同期するか (0 の場合は今日から)

    Returns:
        同期結果（GraphQL CalendarSyncResult 形式）
    """
    logger.info(f"Syncing events for user: {user_id}, days_ahead: {days_ahead}, days_back: {days_back}")

    # Calendar からイベント取得
    if days_back > 0:
        time_min = (datetime.now(timezone.utc) - timedelta(days=days_back)).isoformat()
    else:
        time_min = datetime.now(timezone.utc).isoformat()
    time_max = (datetime.now(timezone.utc) + timedelta(days=days_ahead)).isoformat()

    result = list_events(user_id, time_min, time_max)
    calendar_events = result["events"]

    # Meet リンク付きイベントのみフィルタ
    meet_events = [e for e in calendar_events if e.get("conferenceData")]

    logger.info(f"Found {len(meet_events)} Meet events to sync")

    # DynamoDB から既存の meetings を取得
    table = dynamodb.Table(MEETINGS_TABLE)
    existing_response = table.query(
        IndexName="user_id-start_time-index",
        KeyConditionExpression="user_id = :uid",
        ExpressionAttributeValues={":uid": user_id},
    )
    existing_meetings = {m.get("google_calendar_event_id"): m for m in existing_response.get("Items", []) if m.get("google_calendar_event_id")}

    new_meetings = []
    updated_meetings = []

    for event in meet_events:
        event_id = event["id"]
        conference_data = event.get("conferenceData", {})

        # Meet URI を取得
        meet_uri = None
        for entry in conference_data.get("entryPoints", []):
            if entry.get("entryPointType") == "video":
                meet_uri = entry.get("uri")
                break

        now_iso = datetime.now(timezone.utc).isoformat()

        meeting_data = {
            "user_id": user_id,
            "google_calendar_event_id": event_id,
            "google_meet_space_id": conference_data.get("conferenceId"),
            "google_meet_uri": meet_uri,
            "title": event.get("summary", "Untitled"),
            "description": event.get("description"),
            "start_time": event["start"].get("dateTime", event["start"].get("date")),
            "end_time": event["end"].get("dateTime", event["end"].get("date")),
            "status": "SCHEDULED",
            "updated_at": now_iso,
        }

        if event_id not in existing_meetings:
            # 新規作成
            meeting_id = str(uuid.uuid4())
            meeting_data["meeting_id"] = meeting_id
            meeting_data["created_at"] = now_iso
            meeting_data["auto_recording"] = True
            meeting_data["auto_transcription"] = True

            table.put_item(Item=meeting_data)
            new_meetings.append(meeting_data)
            logger.info(f"Created meeting for event: {event_id}")
        else:
            # 更新
            existing = existing_meetings[event_id]
            meeting_data["meeting_id"] = existing["meeting_id"]
            meeting_data["created_at"] = existing.get("created_at", now_iso)
            meeting_data["auto_recording"] = existing.get("auto_recording", True)
            meeting_data["auto_transcription"] = existing.get("auto_transcription", True)
            meeting_data["status"] = existing.get("status", "SCHEDULED")

            table.update_item(
                Key={"meeting_id": existing["meeting_id"]},
                UpdateExpression="""
                    SET title = :title,
                        description = :desc,
                        start_time = :start,
                        end_time = :end,
                        google_meet_uri = :uri,
                        google_meet_space_id = :space,
                        updated_at = :upd
                """,
                ExpressionAttributeValues={
                    ":title": meeting_data["title"],
                    ":desc": meeting_data.get("description"),
                    ":start": meeting_data["start_time"],
                    ":end": meeting_data["end_time"],
                    ":uri": meeting_data.get("google_meet_uri"),
                    ":space": meeting_data.get("google_meet_space_id"),
                    ":upd": meeting_data["updated_at"],
                },
            )
            updated_meetings.append(meeting_data)
            logger.info(f"Updated meeting for event: {event_id}")

    return {
        "synced_count": len(meet_events),
        "new_meetings": new_meetings,
        "updated_meetings": updated_meetings,
    }


def lambda_handler(event: dict, context) -> dict:
    """
    Lambda ハンドラー

    サポートするアクション:
    - list_events: カレンダーイベント一覧
    - get_event: イベント詳細取得
    - create_event: Meet リンク付きイベント作成
    - sync_events: Meetings テーブルと同期
    - sync_meet_recordings: Meet REST API v2 で録画を同期
    - list_conference_records: 会議記録一覧を取得
    """
    action = event.get("action")
    user_id = event.get("user_id")

    logger.info(f"Processing action: {action} for user: {user_id}")

    try:
        if action == "list_events":
            time_min = event.get("time_min")
            time_max = event.get("time_max")
            page_token = event.get("page_token")

            result = list_events(user_id, time_min, time_max, page_token)

            return {
                "success": True,
                "events": result["events"],
                "nextPageToken": result.get("nextPageToken"),
            }

        elif action == "get_event":
            event_id = event.get("event_id")
            calendar_event = get_event(user_id, event_id)

            return {"success": True, "event": calendar_event}

        elif action == "create_event":
            title = event.get("title")
            start_time = event.get("start_time")
            end_time = event.get("end_time")
            description = event.get("description")
            attendees = event.get("attendees")
            timezone_str = event.get("timezone", "Asia/Tokyo")

            calendar_event = create_event(
                user_id, title, start_time, end_time, description, attendees, timezone_str
            )

            return {"success": True, "event": calendar_event}

        elif action == "sync_events":
            days_ahead = event.get("days_ahead", 30)
            days_back = event.get("days_back", 0)
            result = sync_events(user_id, days_ahead, days_back)

            return {
                "success": True,
                "synced_count": result["synced_count"],
                "new_meetings": result["new_meetings"],
                "updated_meetings": result["updated_meetings"],
                "error_message": None,
            }

        elif action == "sync_meet_recordings":
            days_back = event.get("days_back", 30)
            result = sync_meet_recordings(user_id, days_back)

            return {
                "success": True,
                "conference_records_count": result["conference_records_count"],
                "recordings_found": result["recordings_found"],
                "recordings_downloaded": result["recordings_downloaded"],
            }

        elif action == "list_conference_records":
            start_time = event.get("start_time")
            end_time = event.get("end_time")
            records = list_conference_records(user_id, start_time, end_time)

            return {
                "success": True,
                "conference_records": records,
            }

        else:
            return {"error": f"Unknown action: {action}"}

    except Exception as e:
        logger.error(f"Error processing action {action}: {e}", exc_info=True)
        return {"error": str(e)}
