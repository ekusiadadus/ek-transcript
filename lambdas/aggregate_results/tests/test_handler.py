"""
AggregateResults Lambda のテスト

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
    "aggregate_results_lambda", LAMBDA_DIR / "lambda_function.py"
)
if spec and spec.loader:
    lambda_module = importlib.util.module_from_spec(spec)
    sys.modules["aggregate_results_lambda"] = lambda_module
    spec.loader.exec_module(lambda_module)


class TestAggregateResults:
    """結果統合機能のテスト"""

    @pytest.fixture
    def mock_s3(self) -> Generator[MagicMock, None, None]:
        """S3 クライアントのモック"""
        with patch.object(lambda_module, "s3") as mock:
            yield mock

    def test_lambda_handler_success(self, mock_s3: MagicMock) -> None:
        """正常系: 結果が正しく統合されること"""
        event = {
            "bucket": "test-bucket",
            "transcription_results": [
                {"speaker": "SPEAKER_00", "start": 0.0, "end": 5.0, "text": "こんにちは"},
                {"speaker": "SPEAKER_01", "start": 5.5, "end": 10.0, "text": "はい、こんにちは"},
            ],
            "audio_key": "processed/test.wav",
        }
        context = MagicMock()

        result = lambda_module.lambda_handler(event, context)

        assert result["bucket"] == "test-bucket"
        assert "transcript_key" in result

    def test_lambda_handler_sorts_by_time(self, mock_s3: MagicMock) -> None:
        """結果が時系列でソートされること"""
        import json

        event = {
            "bucket": "test-bucket",
            "transcription_results": [
                {"speaker": "SPEAKER_01", "start": 5.5, "end": 10.0, "text": "2番目"},
                {"speaker": "SPEAKER_00", "start": 0.0, "end": 5.0, "text": "1番目"},
            ],
            "audio_key": "processed/test.wav",
        }
        context = MagicMock()

        lambda_module.lambda_handler(event, context)

        # put_object が呼ばれた時のデータを検証
        call_args = mock_s3.put_object.call_args

        body = json.loads(call_args.kwargs["Body"])
        assert body[0]["text"] == "1番目"
        assert body[1]["text"] == "2番目"
