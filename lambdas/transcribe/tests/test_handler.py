"""
Transcribe Lambda のテスト

第5原則: テストファースト

修正: States.DataLimitExceeded対策
- 結果をS3に保存し、キーのみ返す
"""

import importlib.util
import json
import sys
from collections.abc import Generator
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

# このLambdaのlambda_function.pyを動的にインポート
LAMBDA_DIR = Path(__file__).parent.parent
spec = importlib.util.spec_from_file_location(
    "transcribe_lambda", LAMBDA_DIR / "lambda_function.py"
)
if spec and spec.loader:
    lambda_module = importlib.util.module_from_spec(spec)
    sys.modules["transcribe_lambda"] = lambda_module
    spec.loader.exec_module(lambda_module)


class TestTranscribe:
    """文字起こし機能のテスト"""

    @pytest.fixture
    def mock_s3(self) -> Generator[MagicMock, None, None]:
        """S3 クライアントのモック"""
        with patch.object(lambda_module, "s3") as mock:
            yield mock

    @pytest.fixture
    def mock_whisper(self) -> Generator[MagicMock, None, None]:
        """WhisperModel のモック"""
        with patch.object(lambda_module, "get_model") as mock:
            model = MagicMock()
            # トランスクリプション結果のモック
            segment = MagicMock()
            segment.text = "これはテストの文字起こしです。"
            model.transcribe.return_value = ([segment], MagicMock())
            mock.return_value = model
            yield mock

    def test_lambda_handler_success(
        self, mock_s3: MagicMock, mock_whisper: MagicMock
    ) -> None:
        """正常系: 文字起こしが成功し、結果がS3に保存されること"""
        event = {
            "bucket": "test-bucket",
            "segment_file": {
                "key": "segments/test_0000_SPEAKER_00.wav",
                "speaker": "SPEAKER_00",
                "start": 0.0,
                "end": 5.0,
            },
        }
        context = MagicMock()

        result = lambda_module.lambda_handler(event, context)

        # S3に結果が保存されること
        mock_s3.put_object.assert_called_once()
        call_args = mock_s3.put_object.call_args
        assert call_args.kwargs["Bucket"] == "test-bucket"
        assert "transcribe_results/" in call_args.kwargs["Key"]

        # 保存されたJSONの内容を検証
        saved_data = json.loads(call_args.kwargs["Body"])
        assert saved_data["speaker"] == "SPEAKER_00"
        assert saved_data["text"] == "これはテストの文字起こしです。"

        # 返却値はキーのみ（ペイロード削減）
        assert "result_key" in result
        assert result["bucket"] == "test-bucket"
        # textは返却値に含まれない（S3に保存）
        assert "text" not in result

    def test_lambda_handler_returns_metadata_only(
        self, mock_s3: MagicMock, mock_whisper: MagicMock
    ) -> None:
        """返却値にはメタデータとキーのみ含まれること（ペイロード削減）"""
        event = {
            "bucket": "test-bucket",
            "segment_file": {
                "key": "segments/test_0000_SPEAKER_00.wav",
                "speaker": "SPEAKER_00",
                "start": 10.5,
                "end": 15.0,
            },
        }
        context = MagicMock()

        result = lambda_module.lambda_handler(event, context)

        # 必要最小限の情報のみ返す
        assert result["start"] == 10.5
        assert result["end"] == 15.0
        assert result["speaker"] == "SPEAKER_00"
        assert "result_key" in result
        # textはS3に保存されるため、返却値には含まれない
        assert "text" not in result

    def test_result_key_format(
        self, mock_s3: MagicMock, mock_whisper: MagicMock
    ) -> None:
        """結果キーのフォーマットが正しいこと"""
        event = {
            "bucket": "test-bucket",
            "segment_file": {
                "key": "segments/audio_0042_SPEAKER_01.wav",
                "speaker": "SPEAKER_01",
                "start": 100.0,
                "end": 105.0,
            },
        }
        context = MagicMock()

        result = lambda_module.lambda_handler(event, context)

        # result_keyはセグメントキーから生成される
        assert result["result_key"].startswith("transcribe_results/")
        assert result["result_key"].endswith(".json")
