"""
Event Handler Lambda

Google Workspace Events (Pub/Sub) からの Webhook を処理し、
会議イベントに応じて適切なアクションを実行する。

Version: 1.0
"""

import base64
import json
import logging
import os

import boto3

# ロガー設定
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# AWS クライアント
dynamodb = boto3.resource("dynamodb")
lambda_client = boto3.client("lambda")

# 環境変数
MEETINGS_TABLE = os.environ.get("MEETINGS_TABLE", "")
DOWNLOAD_LAMBDA_NAME = os.environ.get("DOWNLOAD_LAMBDA_NAME", "")

# 重複メッセージ検出用（メモリキャッシュ、Lambda実行間はリセット）
processed_messages: dict = {}


def parse_pubsub_message(event: dict) -> tuple[dict, str]:
    """
    Pub/Sub メッセージをパース

    Args:
        event: Lambda イベント

    Returns:
        (メッセージデータ, メッセージID)

    Raises:
        ValueError: パース失敗時
    """
    body = event.get("body")
    if not body:
        raise ValueError("Missing body")

    try:
        payload = json.loads(body)
    except json.JSONDecodeError as e:
        raise ValueError(f"Invalid JSON: {e}")

    message = payload.get("message")
    if not message:
        raise ValueError("Missing message in payload")

    message_id = message.get("messageId", "")
    data_encoded = message.get("data", "")

    if not data_encoded:
        raise ValueError("Missing data in message")

    try:
        data_decoded = base64.b64decode(data_encoded).decode("utf-8")
        message_data = json.loads(data_decoded)
    except Exception as e:
        raise ValueError(f"Failed to decode message data: {e}")

    return message_data, message_id


def is_duplicate_message(message_id: str) -> bool:
    """
    重複メッセージかどうかを確認

    Args:
        message_id: Pub/Sub メッセージID

    Returns:
        True if duplicate
    """
    if message_id in processed_messages:
        logger.info(f"Duplicate message detected: {message_id}")
        return True
    return False


def mark_message_processed(message_id: str):
    """
    メッセージを処理済みとしてマーク

    Args:
        message_id: Pub/Sub メッセージID
    """
    processed_messages[message_id] = True


def extract_conference_record_id(resource_name: str) -> str:
    """
    リソース名から conferenceRecordId を抽出

    Args:
        resource_name: e.g., "conferenceRecords/conf123/recordings/rec456"

    Returns:
        conference record ID (e.g., "conf123")
    """
    parts = resource_name.split("/")
    if len(parts) >= 2 and parts[0] == "conferenceRecords":
        return parts[1]
    return ""


def find_meeting_by_conference_record(conference_record_id: str) -> dict | None:
    """
    conference record ID から meeting を検索

    Args:
        conference_record_id: Google Meet conference record ID

    Returns:
        Meeting item or None
    """
    table = dynamodb.Table(MEETINGS_TABLE)

    # GSI で検索（conference_record_id を使用）
    # Note: 実際の実装では meet_space_id との関連付けが必要
    response = table.query(
        IndexName="meet_space_id-index",
        KeyConditionExpression="meet_space_id = :crid",
        ExpressionAttributeValues={":crid": f"spaces/{conference_record_id}"},
    )

    items = response.get("Items", [])
    if items:
        return items[0]

    # conferenceRecords/xxx 形式でも検索
    response = table.query(
        IndexName="meet_space_id-index",
        KeyConditionExpression="meet_space_id = :crid",
        ExpressionAttributeValues={":crid": conference_record_id},
    )

    items = response.get("Items", [])
    return items[0] if items else None


def handle_recording_file_generated(data: dict):
    """
    録画ファイル生成完了イベントを処理

    Args:
        data: イベントデータ
    """
    recording = data.get("recording", {})
    recording_name = recording.get("name", "")

    logger.info(f"Recording file generated: {recording_name}")

    # conference record ID を抽出
    conference_record_id = extract_conference_record_id(recording_name)
    if not conference_record_id:
        logger.warning(f"Could not extract conference record ID from: {recording_name}")
        return

    # Meeting を検索
    meeting = find_meeting_by_conference_record(conference_record_id)
    if not meeting:
        logger.warning(f"No meeting found for conference record: {conference_record_id}")
        return

    meeting_id = meeting.get("meeting_id")
    user_id = meeting.get("user_id")

    # ステータスを DOWNLOADING に更新
    table = dynamodb.Table(MEETINGS_TABLE)
    table.update_item(
        Key={"meeting_id": meeting_id},
        UpdateExpression="SET recording_status = :status, recording_name = :rname",
        ExpressionAttributeValues={
            ":status": "DOWNLOADING",
            ":rname": recording_name,
        },
    )

    # Download Lambda を非同期で起動
    lambda_client.invoke(
        FunctionName=DOWNLOAD_LAMBDA_NAME,
        InvocationType="Event",  # 非同期
        Payload=json.dumps({
            "action": "download_recording",
            "user_id": user_id,
            "meeting_id": meeting_id,
            "recording_name": recording_name,
        }),
    )

    logger.info(f"Triggered download for meeting: {meeting_id}")


def handle_conference_started(data: dict):
    """
    会議開始イベントを処理

    Args:
        data: イベントデータ
    """
    conference = data.get("conference", {})
    conference_name = conference.get("name", "")

    logger.info(f"Conference started: {conference_name}")

    conference_record_id = extract_conference_record_id(conference_name)
    if not conference_record_id:
        return

    meeting = find_meeting_by_conference_record(conference_record_id)
    if not meeting:
        logger.info(f"No meeting found for conference: {conference_record_id}")
        return

    # ステータスを RECORDING に更新
    table = dynamodb.Table(MEETINGS_TABLE)
    table.update_item(
        Key={"meeting_id": meeting.get("meeting_id")},
        UpdateExpression="SET recording_status = :status",
        ExpressionAttributeValues={":status": "RECORDING"},
    )

    logger.info(f"Updated meeting status to RECORDING: {meeting.get('meeting_id')}")


def handle_conference_ended(data: dict):
    """
    会議終了イベントを処理

    Args:
        data: イベントデータ
    """
    conference = data.get("conference", {})
    conference_name = conference.get("name", "")

    logger.info(f"Conference ended: {conference_name}")

    conference_record_id = extract_conference_record_id(conference_name)
    if not conference_record_id:
        return

    meeting = find_meeting_by_conference_record(conference_record_id)
    if not meeting:
        logger.info(f"No meeting found for conference: {conference_record_id}")
        return

    # ステータスを PROCESSING に更新（録画処理待ち）
    table = dynamodb.Table(MEETINGS_TABLE)
    table.update_item(
        Key={"meeting_id": meeting.get("meeting_id")},
        UpdateExpression="SET recording_status = :status",
        ExpressionAttributeValues={":status": "PROCESSING"},
    )

    logger.info(f"Updated meeting status to PROCESSING: {meeting.get('meeting_id')}")


def lambda_handler(event: dict, context) -> dict:
    """
    Lambda ハンドラー

    Google Workspace Events (Pub/Sub) からの Webhook を処理
    """
    logger.info(f"Received event: {json.dumps(event)[:500]}")

    try:
        # Pub/Sub メッセージをパース
        message_data, message_id = parse_pubsub_message(event)
    except ValueError as e:
        logger.error(f"Failed to parse message: {e}")
        return {
            "statusCode": 400,
            "body": json.dumps({"error": str(e)}),
        }

    # 重複チェック
    if is_duplicate_message(message_id):
        return {
            "statusCode": 200,
            "body": json.dumps({"message": "Duplicate message, acknowledged"}),
        }

    # 処理済みとしてマーク
    mark_message_processed(message_id)

    # イベントタイプに応じて処理
    event_type = message_data.get("eventType", "")
    data = message_data.get("data", {})

    logger.info(f"Processing event type: {event_type}")

    try:
        if event_type == "google.workspace.meet.recording.v2.fileGenerated":
            handle_recording_file_generated(data)

        elif event_type == "google.workspace.meet.conference.v2.started":
            handle_conference_started(data)

        elif event_type == "google.workspace.meet.conference.v2.ended":
            handle_conference_ended(data)

        else:
            logger.info(f"Unknown or unhandled event type: {event_type}")

    except Exception as e:
        logger.error(f"Error handling event {event_type}: {e}", exc_info=True)
        # Pub/Sub にはエラーでも 200 を返す（リトライを防ぐ）
        # 重要なエラーは別途アラートで通知

    return {
        "statusCode": 200,
        "body": json.dumps({"message": "Event processed"}),
    }
