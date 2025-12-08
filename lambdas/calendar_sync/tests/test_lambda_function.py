"""
Calendar Sync Lambda テスト

Google Calendar イベントの取得・同期・作成のテスト
"""

import os
import sys
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import pytest

# Lambda関数のパスを追加
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


class TestListEvents:
    """list_events アクションのテスト"""

    @patch.dict(
        os.environ,
        {
            "MEETINGS_TABLE": "test-meetings-table",
            "TOKENS_TABLE": "test-tokens-table",
            "KMS_KEY_ID": "test-key-id",
            "GOOGLE_CLIENT_ID": "test-client-id",
            "GOOGLE_CLIENT_SECRET": "test-secret",
        },
    )
    @patch("lambda_function.get_valid_credentials")
    @patch("lambda_function.build")
    def test_list_events_returns_meet_events(self, mock_build, mock_get_credentials):
        """Meet リンク付きイベントのみを返す"""
        import lambda_function

        mock_credentials = MagicMock()
        mock_get_credentials.return_value = mock_credentials

        mock_service = MagicMock()
        mock_events = MagicMock()
        mock_list = MagicMock()
        mock_list.execute.return_value = {
            "items": [
                {
                    "id": "event1",
                    "summary": "Meeting with Meet",
                    "start": {"dateTime": "2025-12-15T14:00:00+09:00"},
                    "end": {"dateTime": "2025-12-15T15:00:00+09:00"},
                    "conferenceData": {
                        "conferenceId": "abc-defg-hij",
                        "conferenceSolution": {"key": {"type": "hangoutsMeet"}},
                        "entryPoints": [
                            {
                                "entryPointType": "video",
                                "uri": "https://meet.google.com/abc-defg-hij",
                            }
                        ],
                    },
                },
                {
                    "id": "event2",
                    "summary": "Meeting without Meet",
                    "start": {"dateTime": "2025-12-16T10:00:00+09:00"},
                    "end": {"dateTime": "2025-12-16T11:00:00+09:00"},
                },
            ]
        }
        mock_events.list.return_value = mock_list
        mock_service.events.return_value = mock_events
        mock_build.return_value = mock_service

        event = {
            "action": "list_events",
            "user_id": "user-123",
            "time_min": "2025-12-01T00:00:00Z",
            "time_max": "2025-12-31T23:59:59Z",
        }

        result = lambda_function.lambda_handler(event, None)

        assert result["success"] is True
        assert "events" in result
        # Meet リンク付きイベントのみフィルタリング
        meet_events = [e for e in result["events"] if e.get("conferenceData")]
        assert len(meet_events) >= 1

    @patch.dict(
        os.environ,
        {
            "MEETINGS_TABLE": "test-meetings-table",
            "TOKENS_TABLE": "test-tokens-table",
            "KMS_KEY_ID": "test-key-id",
            "GOOGLE_CLIENT_ID": "test-client-id",
            "GOOGLE_CLIENT_SECRET": "test-secret",
        },
    )
    @patch("lambda_function.get_valid_credentials")
    @patch("lambda_function.build")
    def test_list_events_with_pagination(self, mock_build, mock_get_credentials):
        """ページネーションが正しく処理される"""
        import lambda_function

        mock_credentials = MagicMock()
        mock_get_credentials.return_value = mock_credentials

        mock_service = MagicMock()
        mock_events = MagicMock()
        mock_list = MagicMock()
        mock_list.execute.return_value = {
            "items": [{"id": "event1", "summary": "Event 1"}],
            "nextPageToken": "token123",
        }
        mock_events.list.return_value = mock_list
        mock_service.events.return_value = mock_events
        mock_build.return_value = mock_service

        event = {
            "action": "list_events",
            "user_id": "user-123",
        }

        result = lambda_function.lambda_handler(event, None)

        assert result["success"] is True
        assert result.get("nextPageToken") == "token123"


class TestCreateEvent:
    """create_event アクションのテスト"""

    @patch.dict(
        os.environ,
        {
            "MEETINGS_TABLE": "test-meetings-table",
            "TOKENS_TABLE": "test-tokens-table",
            "KMS_KEY_ID": "test-key-id",
            "GOOGLE_CLIENT_ID": "test-client-id",
            "GOOGLE_CLIENT_SECRET": "test-secret",
        },
    )
    @patch("lambda_function.get_valid_credentials")
    @patch("lambda_function.build")
    def test_create_event_with_meet_link(self, mock_build, mock_get_credentials):
        """Meet リンク付きイベントを作成"""
        import lambda_function

        mock_credentials = MagicMock()
        mock_get_credentials.return_value = mock_credentials

        mock_service = MagicMock()
        mock_events = MagicMock()
        mock_insert = MagicMock()
        mock_insert.execute.return_value = {
            "id": "new-event-123",
            "summary": "HEMS Interview #8",
            "start": {"dateTime": "2025-12-20T14:00:00+09:00"},
            "end": {"dateTime": "2025-12-20T15:00:00+09:00"},
            "conferenceData": {
                "conferenceId": "xyz-uvw-rst",
                "conferenceSolution": {"key": {"type": "hangoutsMeet"}},
                "entryPoints": [
                    {
                        "entryPointType": "video",
                        "uri": "https://meet.google.com/xyz-uvw-rst",
                    }
                ],
            },
        }
        mock_events.insert.return_value = mock_insert
        mock_service.events.return_value = mock_events
        mock_build.return_value = mock_service

        event = {
            "action": "create_event",
            "user_id": "user-123",
            "title": "HEMS Interview #8",
            "start_time": "2025-12-20T14:00:00+09:00",
            "end_time": "2025-12-20T15:00:00+09:00",
            "attendees": [{"email": "participant@example.com"}],
        }

        result = lambda_function.lambda_handler(event, None)

        assert result["success"] is True
        assert "event" in result
        assert result["event"]["id"] == "new-event-123"

        # conferenceDataVersion=1 が設定されていることを確認
        insert_call = mock_events.insert.call_args
        assert insert_call[1].get("conferenceDataVersion") == 1

    @patch.dict(
        os.environ,
        {
            "MEETINGS_TABLE": "test-meetings-table",
            "TOKENS_TABLE": "test-tokens-table",
            "KMS_KEY_ID": "test-key-id",
            "GOOGLE_CLIENT_ID": "test-client-id",
            "GOOGLE_CLIENT_SECRET": "test-secret",
        },
    )
    @patch("lambda_function.get_valid_credentials")
    @patch("lambda_function.build")
    def test_create_event_generates_request_id(self, mock_build, mock_get_credentials):
        """Meet リンク作成用の requestId が生成される"""
        import lambda_function

        mock_credentials = MagicMock()
        mock_get_credentials.return_value = mock_credentials

        mock_service = MagicMock()
        mock_events = MagicMock()
        mock_insert = MagicMock()
        mock_insert.execute.return_value = {
            "id": "event-id",
            "conferenceData": {"conferenceId": "abc-123"},
        }
        mock_events.insert.return_value = mock_insert
        mock_service.events.return_value = mock_events
        mock_build.return_value = mock_service

        event = {
            "action": "create_event",
            "user_id": "user-123",
            "title": "Test Meeting",
            "start_time": "2025-12-20T14:00:00Z",
            "end_time": "2025-12-20T15:00:00Z",
        }

        lambda_function.lambda_handler(event, None)

        # insert 呼び出しの body を確認
        insert_call = mock_events.insert.call_args
        body = insert_call[1]["body"]
        assert "conferenceData" in body
        assert "createRequest" in body["conferenceData"]
        assert "requestId" in body["conferenceData"]["createRequest"]


class TestSyncEvents:
    """sync_events アクションのテスト"""

    @patch.dict(
        os.environ,
        {
            "MEETINGS_TABLE": "test-meetings-table",
            "TOKENS_TABLE": "test-tokens-table",
            "KMS_KEY_ID": "test-key-id",
            "GOOGLE_CLIENT_ID": "test-client-id",
            "GOOGLE_CLIENT_SECRET": "test-secret",
        },
    )
    @patch("lambda_function.dynamodb")
    @patch("lambda_function.get_valid_credentials")
    @patch("lambda_function.build")
    def test_sync_events_creates_new_meetings(
        self, mock_build, mock_get_credentials, mock_dynamodb
    ):
        """新規イベントを Meetings テーブルに作成"""
        import lambda_function

        mock_credentials = MagicMock()
        mock_get_credentials.return_value = mock_credentials

        # Calendar API モック
        mock_service = MagicMock()
        mock_events = MagicMock()
        mock_list = MagicMock()
        mock_list.execute.return_value = {
            "items": [
                {
                    "id": "cal-event-1",
                    "summary": "New Meeting",
                    "start": {"dateTime": "2025-12-20T14:00:00+09:00"},
                    "end": {"dateTime": "2025-12-20T15:00:00+09:00"},
                    "conferenceData": {
                        "conferenceId": "abc-123",
                        "entryPoints": [
                            {"entryPointType": "video", "uri": "https://meet.google.com/abc-123"}
                        ],
                    },
                }
            ]
        }
        mock_events.list.return_value = mock_list
        mock_service.events.return_value = mock_events
        mock_build.return_value = mock_service

        # DynamoDB モック
        mock_table = MagicMock()
        mock_table.query.return_value = {"Items": []}  # 既存データなし
        mock_dynamodb.Table.return_value = mock_table

        event = {
            "action": "sync_events",
            "user_id": "user-123",
        }

        result = lambda_function.lambda_handler(event, None)

        assert result["success"] is True
        assert result["created_count"] >= 1


class TestGetEvent:
    """get_event アクションのテスト"""

    @patch.dict(
        os.environ,
        {
            "MEETINGS_TABLE": "test-meetings-table",
            "TOKENS_TABLE": "test-tokens-table",
            "KMS_KEY_ID": "test-key-id",
            "GOOGLE_CLIENT_ID": "test-client-id",
            "GOOGLE_CLIENT_SECRET": "test-secret",
        },
    )
    @patch("lambda_function.get_valid_credentials")
    @patch("lambda_function.build")
    def test_get_event(self, mock_build, mock_get_credentials):
        """イベント詳細を取得"""
        import lambda_function

        mock_credentials = MagicMock()
        mock_get_credentials.return_value = mock_credentials

        mock_service = MagicMock()
        mock_events = MagicMock()
        mock_get = MagicMock()
        mock_get.execute.return_value = {
            "id": "event-123",
            "summary": "Test Event",
            "start": {"dateTime": "2025-12-20T14:00:00+09:00"},
            "end": {"dateTime": "2025-12-20T15:00:00+09:00"},
        }
        mock_events.get.return_value = mock_get
        mock_service.events.return_value = mock_events
        mock_build.return_value = mock_service

        event = {
            "action": "get_event",
            "user_id": "user-123",
            "event_id": "event-123",
        }

        result = lambda_function.lambda_handler(event, None)

        assert result["success"] is True
        assert result["event"]["id"] == "event-123"


class TestUnknownAction:
    """不明なアクションのテスト"""

    @patch.dict(
        os.environ,
        {
            "MEETINGS_TABLE": "test-meetings-table",
            "TOKENS_TABLE": "test-tokens-table",
            "KMS_KEY_ID": "test-key-id",
            "GOOGLE_CLIENT_ID": "test-client-id",
            "GOOGLE_CLIENT_SECRET": "test-secret",
        },
    )
    def test_unknown_action_returns_error(self):
        """不明なアクションでエラーを返す"""
        import lambda_function

        event = {
            "action": "unknown",
            "user_id": "user-123",
        }

        result = lambda_function.lambda_handler(event, None)

        assert "error" in result
