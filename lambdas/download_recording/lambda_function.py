"""
Download Recording Lambda

Google Drive から Meet 録画・文字起こしファイルをダウンロードして
S3 に保存する。

Version: 1.0
"""

import json
import logging
import os
import sys
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


def get_recording_info(user_id: str, recording_name: str) -> dict:
    """
    Meet API から録画情報を取得

    Args:
        user_id: ユーザー ID
        recording_name: 録画リソース名 (e.g., conferenceRecords/xxx/recordings/yyy)

    Returns:
        録画情報
    """
    credentials = get_valid_credentials(user_id)
    service = build("meet", "v2", credentials=credentials)

    recording = service.conferenceRecords().recordings().get(name=recording_name).execute()

    return recording


def get_transcript_info(user_id: str, transcript_name: str) -> dict:
    """
    Meet API から文字起こし情報を取得

    Args:
        user_id: ユーザー ID
        transcript_name: 文字起こしリソース名

    Returns:
        文字起こし情報
    """
    credentials = get_valid_credentials(user_id)
    service = build("meet", "v2", credentials=credentials)

    transcript = (
        service.conferenceRecords().transcripts().get(name=transcript_name).execute()
    )

    return transcript


def download_file_from_drive(user_id: str, file_id: str) -> tuple[bytes, dict]:
    """
    Google Drive からファイルをダウンロード

    Args:
        user_id: ユーザー ID
        file_id: Drive ファイル ID

    Returns:
        (ファイル内容, ファイルメタデータ)
    """
    credentials = get_valid_credentials(user_id)
    service = build("drive", "v3", credentials=credentials)

    # ファイルメタデータ取得
    metadata = service.files().get(fileId=file_id, fields="id,name,mimeType,size").execute()

    logger.info(f"Downloading file: {metadata.get('name')} ({metadata.get('size')} bytes)")

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


def export_google_doc(user_id: str, document_id: str, mime_type: str = "text/plain") -> bytes:
    """
    Google Docs をエクスポート

    Args:
        user_id: ユーザー ID
        document_id: ドキュメント ID
        mime_type: エクスポート形式

    Returns:
        エクスポートされた内容
    """
    credentials = get_valid_credentials(user_id)
    service = build("drive", "v3", credentials=credentials)

    content = service.files().export(fileId=document_id, mimeType=mime_type).execute()

    return content


def upload_to_s3(
    content: bytes, bucket: str, key: str, content_type: str = "application/octet-stream"
):
    """
    S3 にファイルをアップロード

    Args:
        content: ファイル内容
        bucket: S3 バケット名
        key: S3 キー
        content_type: コンテンツタイプ
    """
    logger.info(f"Uploading to S3: s3://{bucket}/{key}")

    file_buffer = BytesIO(content)
    s3_client.upload_fileobj(
        file_buffer,
        bucket,
        key,
        ExtraArgs={"ContentType": content_type},
    )


def update_meeting_status(meeting_id: str, status: str, extra_data: dict = None):
    """
    Meeting のステータスを更新

    Args:
        meeting_id: ミーティング ID
        status: 新しいステータス
        extra_data: 追加で更新するデータ
    """
    table = dynamodb.Table(MEETINGS_TABLE)

    update_expr = "SET recording_status = :status"
    expr_values = {":status": status}

    if extra_data:
        for key, value in extra_data.items():
            update_expr += f", {key} = :{key}"
            expr_values[f":{key}"] = value

    table.update_item(
        Key={"meeting_id": meeting_id},
        UpdateExpression=update_expr,
        ExpressionAttributeValues=expr_values,
    )


def download_recording(user_id: str, meeting_id: str, recording_name: str) -> dict:
    """
    録画ファイルをダウンロードして S3 に保存

    Args:
        user_id: ユーザー ID
        meeting_id: ミーティング ID
        recording_name: 録画リソース名

    Returns:
        結果
    """
    logger.info(f"Downloading recording: {recording_name}")

    # 録画情報取得
    recording = get_recording_info(user_id, recording_name)

    state = recording.get("state", "")
    if state != "FILE_GENERATED":
        logger.info(f"Recording not ready yet. State: {state}")
        return {
            "success": False,
            "message": f"Recording not ready. Current state: {state}. Please retry later.",
        }

    # Drive ファイル情報
    drive_destination = recording.get("driveDestination", {})
    file_ref = drive_destination.get("file", "")

    # file_ref は "files/xxx" 形式
    file_id = file_ref.replace("files/", "") if file_ref.startswith("files/") else file_ref

    if not file_id:
        logger.error("No drive file found in recording")
        update_meeting_status(meeting_id, "FAILED", {"error_message": "No drive file found"})
        return {"success": False, "error": "No drive file found"}

    # ファイルダウンロード
    try:
        content, metadata = download_file_from_drive(user_id, file_id)
    except Exception as e:
        logger.error(f"Failed to download from Drive: {e}")
        update_meeting_status(meeting_id, "FAILED", {"error_message": str(e)})
        return {"success": False, "error": str(e)}

    # S3 にアップロード
    file_name = metadata.get("name", "recording.mp4")
    mime_type = metadata.get("mimeType", "video/mp4")
    s3_key = f"recordings/{user_id}/{meeting_id}/{file_name}"

    upload_to_s3(content, RECORDINGS_BUCKET, s3_key, mime_type)

    # ステータス更新
    update_meeting_status(
        meeting_id,
        "COMPLETED",
        {
            "s3_recording_key": s3_key,
            "recording_file_name": file_name,
            "recording_size": len(content),
        },
    )

    logger.info(f"Recording downloaded successfully: {s3_key}")

    return {
        "success": True,
        "s3_key": s3_key,
        "file_name": file_name,
        "size": len(content),
    }


def download_transcript(user_id: str, meeting_id: str, transcript_name: str) -> dict:
    """
    文字起こしファイルをダウンロードして S3 に保存

    Args:
        user_id: ユーザー ID
        meeting_id: ミーティング ID
        transcript_name: 文字起こしリソース名

    Returns:
        結果
    """
    logger.info(f"Downloading transcript: {transcript_name}")

    # 文字起こし情報取得
    transcript = get_transcript_info(user_id, transcript_name)

    state = transcript.get("state", "")
    if state != "ENDED":
        logger.info(f"Transcript not ready yet. State: {state}")
        return {
            "success": False,
            "message": f"Transcript not ready. Current state: {state}",
        }

    # Google Docs 情報
    docs_destination = transcript.get("docsDestination", {})
    document_ref = docs_destination.get("document", "")

    # document_ref は "documents/xxx" 形式
    document_id = (
        document_ref.replace("documents/", "")
        if document_ref.startswith("documents/")
        else document_ref
    )

    if not document_id:
        logger.error("No document found in transcript")
        return {"success": False, "error": "No document found"}

    # Google Docs をテキストとしてエクスポート
    try:
        content = export_google_doc(user_id, document_id, "text/plain")
    except Exception as e:
        logger.error(f"Failed to export document: {e}")
        return {"success": False, "error": str(e)}

    # S3 にアップロード
    s3_key = f"transcripts/{user_id}/{meeting_id}/transcript.txt"
    upload_to_s3(content, RECORDINGS_BUCKET, s3_key, "text/plain")

    # ステータス更新
    table = dynamodb.Table(MEETINGS_TABLE)
    table.update_item(
        Key={"meeting_id": meeting_id},
        UpdateExpression="SET s3_transcript_key = :key",
        ExpressionAttributeValues={":key": s3_key},
    )

    logger.info(f"Transcript downloaded successfully: {s3_key}")

    return {
        "success": True,
        "s3_key": s3_key,
        "size": len(content),
    }


def lambda_handler(event: dict, context) -> dict:
    """
    Lambda ハンドラー

    サポートするアクション:
    - download_recording: 録画ファイルをダウンロード
    - download_transcript: 文字起こしファイルをダウンロード
    """
    action = event.get("action")
    user_id = event.get("user_id")
    meeting_id = event.get("meeting_id")

    logger.info(f"Processing action: {action} for meeting: {meeting_id}")

    # パラメータ検証
    if not action:
        return {"success": False, "error": "Missing action parameter"}

    if not user_id:
        return {"success": False, "error": "Missing user_id parameter"}

    if not meeting_id:
        return {"success": False, "error": "Missing meeting_id parameter"}

    try:
        if action == "download_recording":
            recording_name = event.get("recording_name")
            if not recording_name:
                return {"success": False, "error": "Missing recording_name parameter"}

            return download_recording(user_id, meeting_id, recording_name)

        elif action == "download_transcript":
            transcript_name = event.get("transcript_name")
            if not transcript_name:
                return {"success": False, "error": "Missing transcript_name parameter"}

            return download_transcript(user_id, meeting_id, transcript_name)

        else:
            return {"success": False, "error": f"Unknown action: {action}"}

    except Exception as e:
        logger.error(f"Error processing action {action}: {e}", exc_info=True)

        # エラー時はステータスを FAILED に更新
        try:
            update_meeting_status(meeting_id, "FAILED", {"error_message": str(e)})
        except Exception:
            pass

        return {"success": False, "error": str(e)}
