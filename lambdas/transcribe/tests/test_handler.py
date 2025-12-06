"""
Transcribe Lambda のテスト

第5原則: テストファースト
"""

import importlib.util
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
        """正常系: 文字起こしが成功すること"""
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

        assert result["speaker"] == "SPEAKER_00"
        assert "text" in result
        assert result["text"] == "これはテストの文字起こしです。"

    def test_lambda_handler_returns_timestamps(
        self, mock_s3: MagicMock, mock_whisper: MagicMock
    ) -> None:
        """タイムスタンプが返されること"""
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

        assert result["start"] == 10.5
        assert result["end"] == 15.0
