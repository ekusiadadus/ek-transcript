"""
Calendar Sync Lambda

Google Calendar イベントの取得・同期・作成を担当。
Meet リンク付きイベントを管理する。

Version: 1.0
"""

import json
import logging
import os
import sys
import uuid
from datetime import datetime, timedelta, timezone

import boto3
from googleapiclient.discovery import build

# 共有モジュールのパスを追加
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "shared"))
from google_token_manager import get_valid_credentials  # noqa: E402

# ロガー設定
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# AWS クライアント
dynamodb = boto3.resource("dynamodb")

# 環境変数
MEETINGS_TABLE = os.environ.get("MEETINGS_TABLE", "")


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


def sync_events(user_id: str, days_ahead: int = 30) -> dict:
    """
    Google Calendar と Meetings テーブルを同期

    Args:
        user_id: ユーザー ID
        days_ahead: 何日先までを同期するか

    Returns:
        同期結果
    """
    logger.info(f"Syncing events for user: {user_id}")

    # Calendar からイベント取得
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
    existing_meetings = {m["calendar_event_id"]: m for m in existing_response.get("Items", [])}

    created_count = 0
    updated_count = 0

    for event in meet_events:
        event_id = event["id"]
        conference_data = event.get("conferenceData", {})

        # Meet URI を取得
        meet_uri = None
        for entry in conference_data.get("entryPoints", []):
            if entry.get("entryPointType") == "video":
                meet_uri = entry.get("uri")
                break

        meeting_data = {
            "user_id": user_id,
            "calendar_event_id": event_id,
            "meet_space_id": conference_data.get("conferenceId"),
            "meet_uri": meet_uri,
            "title": event.get("summary", "Untitled"),
            "description": event.get("description"),
            "start_time": event["start"].get("dateTime", event["start"].get("date")),
            "end_time": event["end"].get("dateTime", event["end"].get("date")),
            "attendees": event.get("attendees", []),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }

        if event_id not in existing_meetings:
            # 新規作成
            meeting_data["meeting_id"] = str(uuid.uuid4())
            meeting_data["created_at"] = datetime.now(timezone.utc).isoformat()
            meeting_data["recording_status"] = "PENDING"
            meeting_data["auto_recording_enabled"] = True
            meeting_data["auto_transcription_enabled"] = True

            table.put_item(Item=meeting_data)
            created_count += 1
            logger.info(f"Created meeting for event: {event_id}")
        else:
            # 更新
            existing = existing_meetings[event_id]
            table.update_item(
                Key={"meeting_id": existing["meeting_id"]},
                UpdateExpression="""
                    SET title = :title,
                        description = :desc,
                        start_time = :start,
                        end_time = :end,
                        attendees = :att,
                        updated_at = :upd
                """,
                ExpressionAttributeValues={
                    ":title": meeting_data["title"],
                    ":desc": meeting_data.get("description"),
                    ":start": meeting_data["start_time"],
                    ":end": meeting_data["end_time"],
                    ":att": meeting_data["attendees"],
                    ":upd": meeting_data["updated_at"],
                },
            )
            updated_count += 1
            logger.info(f"Updated meeting for event: {event_id}")

    return {
        "synced_count": len(meet_events),
        "created_count": created_count,
        "updated_count": updated_count,
    }


def lambda_handler(event: dict, context) -> dict:
    """
    Lambda ハンドラー

    サポートするアクション:
    - list_events: カレンダーイベント一覧
    - get_event: イベント詳細取得
    - create_event: Meet リンク付きイベント作成
    - sync_events: Meetings テーブルと同期
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
            result = sync_events(user_id, days_ahead)

            return {
                "success": True,
                "synced_count": result["synced_count"],
                "created_count": result["created_count"],
                "updated_count": result["updated_count"],
            }

        else:
            return {"error": f"Unknown action: {action}"}

    except Exception as e:
        logger.error(f"Error processing action {action}: {e}", exc_info=True)
        return {"error": str(e)}
