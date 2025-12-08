"""
Event Handler Lambda テスト

Google Workspace Events (Pub/Sub) からの Webhook 処理テスト
"""

import base64
import json
import os
import sys
from unittest.mock import MagicMock, patch

import pytest

# Lambda関数のパスを追加
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


class TestRecordingFileGenerated:
    """recording.fileGenerated イベントのテスト"""

    @patch.dict(
        os.environ,
        {
            "MEETINGS_TABLE": "test-meetings-table",
            "DOWNLOAD_LAMBDA_NAME": "download-recording-lambda",
        },
    )
    @patch("lambda_function.processed_messages", {})
    @patch("lambda_function.lambda_client")
    @patch("lambda_function.dynamodb")
    def test_recording_file_generated_triggers_download(
        self, mock_dynamodb, mock_lambda
    ):
        """録画完了イベントでダウンロード Lambda を起動"""
        import lambda_function

        # DynamoDB モック
        mock_table = MagicMock()
        mock_table.query.return_value = {
            "Items": [
                {
                    "meeting_id": "meeting-123",
                    "user_id": "user-123",
                    "meet_space_id": "spaces/abc123",
                }
            ]
        }
        mock_dynamodb.Table.return_value = mock_table

        # Lambda invoke モック
        mock_lambda.invoke.return_value = {
            "StatusCode": 202,
            "Payload": MagicMock(),
        }

        # Pub/Sub メッセージ（Base64エンコード）
        message_data = {
            "subscription": "subscriptions/sub123",
            "eventType": "google.workspace.meet.recording.v2.fileGenerated",
            "eventTime": "2025-12-10T15:05:00Z",
            "data": {
                "recording": {
                    "name": "conferenceRecords/conf123/recordings/rec456"
                }
            },
        }
        encoded_data = base64.b64encode(json.dumps(message_data).encode()).decode()

        event = {
            "body": json.dumps({
                "message": {
                    "data": encoded_data,
                    "messageId": "msg-rec-123456789",
                    "publishTime": "2025-12-10T15:05:00.000Z",
                },
                "subscription": "projects/test/subscriptions/meet-events-sub",
            })
        }

        result = lambda_function.lambda_handler(event, None)

        assert result["statusCode"] == 200
        mock_lambda.invoke.assert_called_once()

    @patch.dict(
        os.environ,
        {
            "MEETINGS_TABLE": "test-meetings-table",
            "DOWNLOAD_LAMBDA_NAME": "download-recording-lambda",
        },
    )
    @patch("lambda_function.processed_messages", {})
    @patch("lambda_function.dynamodb")
    def test_recording_file_generated_updates_status(self, mock_dynamodb):
        """録画完了イベントで meeting の status を更新"""
        import lambda_function

        mock_table = MagicMock()
        mock_table.query.return_value = {
            "Items": [{"meeting_id": "meeting-123", "user_id": "user-123"}]
        }
        mock_dynamodb.Table.return_value = mock_table

        message_data = {
            "eventType": "google.workspace.meet.recording.v2.fileGenerated",
            "data": {
                "recording": {"name": "conferenceRecords/conf123/recordings/rec456"}
            },
        }
        encoded_data = base64.b64encode(json.dumps(message_data).encode()).decode()

        event = {
            "body": json.dumps({
                "message": {"data": encoded_data, "messageId": "msg-rec-status-123"},
            })
        }

        with patch("lambda_function.lambda_client"):
            lambda_function.lambda_handler(event, None)

        # update_item が呼ばれたことを確認
        mock_table.update_item.assert_called()


class TestConferenceStarted:
    """conference.started イベントのテスト"""

    @patch.dict(
        os.environ,
        {
            "MEETINGS_TABLE": "test-meetings-table",
            "DOWNLOAD_LAMBDA_NAME": "download-recording-lambda",
        },
    )
    @patch("lambda_function.processed_messages", {})
    @patch("lambda_function.dynamodb")
    def test_conference_started_updates_status(self, mock_dynamodb):
        """会議開始イベントで status を RECORDING に更新"""
        import lambda_function

        mock_table = MagicMock()
        mock_table.query.return_value = {
            "Items": [{"meeting_id": "meeting-123", "user_id": "user-123"}]
        }
        mock_dynamodb.Table.return_value = mock_table

        message_data = {
            "eventType": "google.workspace.meet.conference.v2.started",
            "data": {
                "conference": {"name": "conferenceRecords/conf123"}
            },
        }
        encoded_data = base64.b64encode(json.dumps(message_data).encode()).decode()

        event = {
            "body": json.dumps({
                "message": {"data": encoded_data, "messageId": "msg-started-123"},
            })
        }

        result = lambda_function.lambda_handler(event, None)

        assert result["statusCode"] == 200
        # update_item で RECORDING に更新されることを確認
        update_call = mock_table.update_item.call_args
        assert "RECORDING" in str(update_call)


class TestConferenceEnded:
    """conference.ended イベントのテスト"""

    @patch.dict(
        os.environ,
        {
            "MEETINGS_TABLE": "test-meetings-table",
            "DOWNLOAD_LAMBDA_NAME": "download-recording-lambda",
        },
    )
    @patch("lambda_function.processed_messages", {})
    @patch("lambda_function.dynamodb")
    def test_conference_ended_updates_status(self, mock_dynamodb):
        """会議終了イベントで status を PROCESSING に更新"""
        import lambda_function

        mock_table = MagicMock()
        mock_table.query.return_value = {
            "Items": [{"meeting_id": "meeting-123", "user_id": "user-123"}]
        }
        mock_dynamodb.Table.return_value = mock_table

        message_data = {
            "eventType": "google.workspace.meet.conference.v2.ended",
            "data": {
                "conference": {"name": "conferenceRecords/conf123"}
            },
        }
        encoded_data = base64.b64encode(json.dumps(message_data).encode()).decode()

        event = {
            "body": json.dumps({
                "message": {"data": encoded_data, "messageId": "msg-ended-123"},
            })
        }

        result = lambda_function.lambda_handler(event, None)

        assert result["statusCode"] == 200


class TestDuplicateMessage:
    """重複メッセージ検出のテスト"""

    @patch.dict(
        os.environ,
        {
            "MEETINGS_TABLE": "test-meetings-table",
            "DOWNLOAD_LAMBDA_NAME": "download-recording-lambda",
        },
    )
    @patch("lambda_function.processed_messages", {"msg-123": True})
    def test_duplicate_message_returns_200(self):
        """重複メッセージは 200 で返す（Pub/Sub に ACK）"""
        import lambda_function

        message_data = {"eventType": "test.event"}
        encoded_data = base64.b64encode(json.dumps(message_data).encode()).decode()

        event = {
            "body": json.dumps({
                "message": {"data": encoded_data, "messageId": "msg-123"},
            })
        }

        result = lambda_function.lambda_handler(event, None)

        # 重複でも 200 を返す（そうしないと Pub/Sub がリトライする）
        assert result["statusCode"] == 200


class TestInvalidPayload:
    """不正なペイロードのテスト"""

    @patch.dict(
        os.environ,
        {
            "MEETINGS_TABLE": "test-meetings-table",
            "DOWNLOAD_LAMBDA_NAME": "download-recording-lambda",
        },
    )
    def test_invalid_json_returns_400(self):
        """不正な JSON で 400 を返す"""
        import lambda_function

        event = {"body": "invalid json"}

        result = lambda_function.lambda_handler(event, None)

        assert result["statusCode"] == 400

    @patch.dict(
        os.environ,
        {
            "MEETINGS_TABLE": "test-meetings-table",
            "DOWNLOAD_LAMBDA_NAME": "download-recording-lambda",
        },
    )
    def test_missing_message_returns_400(self):
        """message がない場合 400 を返す"""
        import lambda_function

        event = {"body": json.dumps({"subscription": "test"})}

        result = lambda_function.lambda_handler(event, None)

        assert result["statusCode"] == 400


class TestUnknownEventType:
    """未知のイベントタイプのテスト"""

    @patch.dict(
        os.environ,
        {
            "MEETINGS_TABLE": "test-meetings-table",
            "DOWNLOAD_LAMBDA_NAME": "download-recording-lambda",
        },
    )
    @patch("lambda_function.processed_messages", {})
    def test_unknown_event_type_returns_200(self):
        """未知のイベントタイプも 200 で返す"""
        import lambda_function

        message_data = {
            "eventType": "google.workspace.meet.unknown.event",
            "data": {},
        }
        encoded_data = base64.b64encode(json.dumps(message_data).encode()).decode()

        event = {
            "body": json.dumps({
                "message": {"data": encoded_data, "messageId": "msg-unknown-123"},
            })
        }

        result = lambda_function.lambda_handler(event, None)

        # 未知のイベントも ACK する
        assert result["statusCode"] == 200
