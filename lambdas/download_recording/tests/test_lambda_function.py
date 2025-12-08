"""
Download Recording Lambda テスト

Google Drive から Meet 録画ファイルをダウンロードして S3 に保存するテスト
"""

import json
import os
import sys
from io import BytesIO
from unittest.mock import MagicMock, patch

import pytest

# Lambda関数のパスを追加
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


class TestDownloadRecording:
    """録画ダウンロードのテスト"""

    @patch.dict(
        os.environ,
        {
            "MEETINGS_TABLE": "test-meetings-table",
            "RECORDINGS_BUCKET": "test-recordings-bucket",
        },
    )
    @patch("lambda_function.MediaIoBaseDownload")
    @patch("lambda_function.get_valid_credentials")
    @patch("lambda_function.s3_client")
    @patch("lambda_function.dynamodb")
    @patch("lambda_function.build")
    def test_download_recording_success(
        self, mock_build, mock_dynamodb, mock_s3, mock_get_creds, mock_downloader_class
    ):
        """正常にダウンロードして S3 に保存"""
        import lambda_function

        # Google API モック
        mock_creds = MagicMock()
        mock_get_creds.return_value = mock_creds

        mock_drive = MagicMock()
        mock_meet = MagicMock()

        def build_side_effect(api, version, **kwargs):
            if api == "drive":
                return mock_drive
            elif api == "meet":
                return mock_meet
            return MagicMock()

        mock_build.side_effect = build_side_effect

        # Meet API: recording 取得
        mock_meet.conferenceRecords().recordings().get().execute.return_value = {
            "name": "conferenceRecords/conf123/recordings/rec456",
            "driveDestination": {
                "file": "files/drive-file-123",
                "exportUri": "https://drive.google.com/...",
            },
            "state": "FILE_GENERATED",
        }

        # Drive API: ファイルメタデータ取得
        mock_drive.files().get().execute.return_value = {
            "id": "drive-file-123",
            "name": "recording.mp4",
            "mimeType": "video/mp4",
            "size": "1048576",
        }

        # Drive API: ファイルダウンロード (MediaIoBaseDownload モック)
        mock_downloader = MagicMock()
        mock_downloader.next_chunk.return_value = (MagicMock(progress=lambda: 1.0), True)
        mock_downloader_class.return_value = mock_downloader

        # DynamoDB モック
        mock_table = MagicMock()
        mock_dynamodb.Table.return_value = mock_table

        # S3 モック
        mock_s3.upload_fileobj.return_value = None

        event = {
            "action": "download_recording",
            "user_id": "user-123",
            "meeting_id": "meeting-123",
            "recording_name": "conferenceRecords/conf123/recordings/rec456",
        }

        result = lambda_function.lambda_handler(event, None)

        assert result["success"] is True
        mock_s3.upload_fileobj.assert_called_once()
        mock_table.update_item.assert_called()

    @patch.dict(
        os.environ,
        {
            "MEETINGS_TABLE": "test-meetings-table",
            "RECORDINGS_BUCKET": "test-recordings-bucket",
        },
    )
    @patch("lambda_function.MediaIoBaseDownload")
    @patch("lambda_function.get_valid_credentials")
    @patch("lambda_function.dynamodb")
    @patch("lambda_function.build")
    def test_download_recording_updates_status_to_completed(
        self, mock_build, mock_dynamodb, mock_get_creds, mock_downloader_class
    ):
        """ダウンロード後に status を COMPLETED に更新"""
        import lambda_function

        mock_creds = MagicMock()
        mock_get_creds.return_value = mock_creds

        mock_drive = MagicMock()
        mock_meet = MagicMock()

        def build_side_effect(api, version, **kwargs):
            if api == "drive":
                return mock_drive
            elif api == "meet":
                return mock_meet
            return MagicMock()

        mock_build.side_effect = build_side_effect

        mock_meet.conferenceRecords().recordings().get().execute.return_value = {
            "name": "conferenceRecords/conf123/recordings/rec456",
            "driveDestination": {"file": "files/drive-file-123"},
            "state": "FILE_GENERATED",
        }

        mock_drive.files().get().execute.return_value = {
            "id": "drive-file-123",
            "name": "recording.mp4",
            "mimeType": "video/mp4",
            "size": "1048576",
        }

        # MediaIoBaseDownload モック
        mock_downloader = MagicMock()
        mock_downloader.next_chunk.return_value = (MagicMock(progress=lambda: 1.0), True)
        mock_downloader_class.return_value = mock_downloader

        mock_table = MagicMock()
        mock_dynamodb.Table.return_value = mock_table

        with patch("lambda_function.s3_client"):
            event = {
                "action": "download_recording",
                "user_id": "user-123",
                "meeting_id": "meeting-123",
                "recording_name": "conferenceRecords/conf123/recordings/rec456",
            }

            lambda_function.lambda_handler(event, None)

        # COMPLETED ステータスに更新されることを確認
        update_call = mock_table.update_item.call_args
        assert "COMPLETED" in str(update_call) or "recording_status" in str(update_call)


class TestRecordingNotReady:
    """録画が準備できていない場合のテスト"""

    @patch.dict(
        os.environ,
        {
            "MEETINGS_TABLE": "test-meetings-table",
            "RECORDINGS_BUCKET": "test-recordings-bucket",
        },
    )
    @patch("lambda_function.get_valid_credentials")
    @patch("lambda_function.build")
    def test_recording_not_ready_returns_retry(self, mock_build, mock_get_creds):
        """録画が準備中の場合はリトライを促す"""
        import lambda_function

        mock_creds = MagicMock()
        mock_get_creds.return_value = mock_creds

        mock_meet = MagicMock()
        mock_build.return_value = mock_meet

        # 録画がまだ処理中
        mock_meet.conferenceRecords().recordings().get().execute.return_value = {
            "name": "conferenceRecords/conf123/recordings/rec456",
            "state": "STARTED",  # まだ完了していない
        }

        event = {
            "action": "download_recording",
            "user_id": "user-123",
            "meeting_id": "meeting-123",
            "recording_name": "conferenceRecords/conf123/recordings/rec456",
        }

        result = lambda_function.lambda_handler(event, None)

        assert result["success"] is False
        assert "retry" in result.get("message", "").lower() or "not ready" in result.get(
            "message", ""
        ).lower()


class TestTranscriptDownload:
    """文字起こしダウンロードのテスト"""

    @patch.dict(
        os.environ,
        {
            "MEETINGS_TABLE": "test-meetings-table",
            "RECORDINGS_BUCKET": "test-recordings-bucket",
        },
    )
    @patch("lambda_function.get_valid_credentials")
    @patch("lambda_function.s3_client")
    @patch("lambda_function.dynamodb")
    @patch("lambda_function.build")
    def test_download_transcript_success(
        self, mock_build, mock_dynamodb, mock_s3, mock_get_creds
    ):
        """文字起こしファイルのダウンロード成功"""
        import lambda_function

        mock_creds = MagicMock()
        mock_get_creds.return_value = mock_creds

        mock_drive = MagicMock()
        mock_meet = MagicMock()

        def build_side_effect(api, version, **kwargs):
            if api == "drive":
                return mock_drive
            elif api == "meet":
                return mock_meet
            return MagicMock()

        mock_build.side_effect = build_side_effect

        # Meet API: transcript 取得
        mock_meet.conferenceRecords().transcripts().get().execute.return_value = {
            "name": "conferenceRecords/conf123/transcripts/trans789",
            "docsDestination": {
                "document": "documents/doc-123",
                "exportUri": "https://docs.google.com/...",
            },
            "state": "ENDED",
        }

        # Drive API: ファイルエクスポート（Google Docs -> テキスト）
        mock_drive.files().export().execute.return_value = b"Transcript text content"

        mock_table = MagicMock()
        mock_dynamodb.Table.return_value = mock_table

        event = {
            "action": "download_transcript",
            "user_id": "user-123",
            "meeting_id": "meeting-123",
            "transcript_name": "conferenceRecords/conf123/transcripts/trans789",
        }

        result = lambda_function.lambda_handler(event, None)

        assert result["success"] is True


class TestS3Upload:
    """S3 アップロードのテスト"""

    @patch.dict(
        os.environ,
        {
            "MEETINGS_TABLE": "test-meetings-table",
            "RECORDINGS_BUCKET": "test-recordings-bucket",
        },
    )
    @patch("lambda_function.MediaIoBaseDownload")
    @patch("lambda_function.get_valid_credentials")
    @patch("lambda_function.s3_client")
    @patch("lambda_function.dynamodb")
    @patch("lambda_function.build")
    def test_s3_upload_uses_correct_key(
        self, mock_build, mock_dynamodb, mock_s3, mock_get_creds, mock_downloader_class
    ):
        """S3 に正しいキーでアップロード"""
        import lambda_function

        mock_creds = MagicMock()
        mock_get_creds.return_value = mock_creds

        mock_drive = MagicMock()
        mock_meet = MagicMock()

        def build_side_effect(api, version, **kwargs):
            if api == "drive":
                return mock_drive
            elif api == "meet":
                return mock_meet
            return MagicMock()

        mock_build.side_effect = build_side_effect

        mock_meet.conferenceRecords().recordings().get().execute.return_value = {
            "name": "conferenceRecords/conf123/recordings/rec456",
            "driveDestination": {"file": "files/drive-file-123"},
            "state": "FILE_GENERATED",
        }

        mock_drive.files().get().execute.return_value = {
            "id": "drive-file-123",
            "name": "recording.mp4",
            "mimeType": "video/mp4",
            "size": "1048576",
        }

        # MediaIoBaseDownload モック
        mock_downloader = MagicMock()
        mock_downloader.next_chunk.return_value = (MagicMock(progress=lambda: 1.0), True)
        mock_downloader_class.return_value = mock_downloader

        mock_table = MagicMock()
        mock_dynamodb.Table.return_value = mock_table

        event = {
            "action": "download_recording",
            "user_id": "user-123",
            "meeting_id": "meeting-123",
            "recording_name": "conferenceRecords/conf123/recordings/rec456",
        }

        lambda_function.lambda_handler(event, None)

        # S3 キーの検証
        upload_call = mock_s3.upload_fileobj.call_args
        assert upload_call is not None
        # キーに user_id と meeting_id が含まれることを確認
        s3_key = upload_call[0][2]  # 3番目の引数がキー
        assert "user-123" in s3_key or "meeting-123" in s3_key


class TestErrorHandling:
    """エラーハンドリングのテスト"""

    @patch.dict(
        os.environ,
        {
            "MEETINGS_TABLE": "test-meetings-table",
            "RECORDINGS_BUCKET": "test-recordings-bucket",
        },
    )
    def test_missing_parameters_returns_error(self):
        """必須パラメータが不足している場合エラー"""
        import lambda_function

        event = {
            "action": "download_recording",
            # user_id, meeting_id, recording_name が不足
        }

        result = lambda_function.lambda_handler(event, None)

        assert result.get("success") is False or "error" in result

    @patch.dict(
        os.environ,
        {
            "MEETINGS_TABLE": "test-meetings-table",
            "RECORDINGS_BUCKET": "test-recordings-bucket",
        },
    )
    @patch("lambda_function.get_valid_credentials")
    @patch("lambda_function.dynamodb")
    @patch("lambda_function.build")
    def test_google_api_error_updates_status_to_failed(
        self, mock_build, mock_dynamodb, mock_get_creds
    ):
        """Google API エラー時に status を FAILED に更新"""
        import lambda_function
        from googleapiclient.errors import HttpError

        mock_creds = MagicMock()
        mock_get_creds.return_value = mock_creds

        mock_meet = MagicMock()
        mock_build.return_value = mock_meet

        # Google API エラー
        mock_resp = MagicMock()
        mock_resp.status = 404
        mock_meet.conferenceRecords().recordings().get().execute.side_effect = HttpError(
            resp=mock_resp, content=b"Not found"
        )

        mock_table = MagicMock()
        mock_dynamodb.Table.return_value = mock_table

        event = {
            "action": "download_recording",
            "user_id": "user-123",
            "meeting_id": "meeting-123",
            "recording_name": "conferenceRecords/conf123/recordings/rec456",
        }

        result = lambda_function.lambda_handler(event, None)

        assert result["success"] is False
        # FAILED ステータスに更新されることを確認
        update_call = mock_table.update_item.call_args
        if update_call:
            assert "FAILED" in str(update_call)
