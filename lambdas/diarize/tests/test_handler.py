"""
Diarize Lambda のテスト

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
    "diarize_lambda", LAMBDA_DIR / "lambda_function.py"
)
if spec and spec.loader:
    lambda_module = importlib.util.module_from_spec(spec)
    sys.modules["diarize_lambda"] = lambda_module
    spec.loader.exec_module(lambda_module)


class TestDiarize:
    """話者分離機能のテスト"""

    @pytest.fixture
    def mock_pipeline(self) -> Generator[MagicMock, None, None]:
        """pyannote Pipeline のモック"""
        with patch.object(lambda_module, "get_pipeline") as mock:
            pipeline = MagicMock()
            # ダミーの話者分離結果
            mock_track = MagicMock()
            mock_track.start = 0.0
            mock_track.end = 5.0
            pipeline.return_value.itertracks.return_value = [
                (mock_track, None, "SPEAKER_00"),
                (MagicMock(start=5.5, end=10.0), None, "SPEAKER_01"),
            ]
            mock.return_value = pipeline
            yield mock

    @pytest.fixture
    def mock_s3(self) -> Generator[MagicMock, None, None]:
        """S3 クライアントのモック"""
        with patch.object(lambda_module, "s3") as mock:
            yield mock

    def test_lambda_handler_success(
        self, mock_s3: MagicMock, mock_pipeline: MagicMock
    ) -> None:
        """正常系: 話者分離が成功すること"""
        event = {
            "bucket": "test-bucket",
            "audio_key": "processed/test.wav",
        }
        context = MagicMock()

        result = lambda_module.lambda_handler(event, context)

        assert result["bucket"] == "test-bucket"
        assert "segments_key" in result
        assert result["segments_key"].endswith("_segments.json")

    def test_lambda_handler_returns_speaker_count(
        self, mock_s3: MagicMock, mock_pipeline: MagicMock
    ) -> None:
        """話者数が返されること"""
        event = {
            "bucket": "test-bucket",
            "audio_key": "processed/test.wav",
        }
        context = MagicMock()

        result = lambda_module.lambda_handler(event, context)

        assert "speaker_count" in result
        assert result["speaker_count"] >= 1
