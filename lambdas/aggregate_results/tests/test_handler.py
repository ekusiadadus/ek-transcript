"""
AggregateResults Lambda のテスト

第5原則: テストファースト

修正: States.DataLimitExceeded対策
- S3から各結果ファイルを読み込んで統合
"""

import importlib.util
import io
import json
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

    def _make_s3_response(self, data: dict) -> dict:
        """S3 get_object レスポンスを生成"""
        body = io.BytesIO(json.dumps(data).encode("utf-8"))
        return {"Body": body}

    def test_lambda_handler_success(self, mock_s3: MagicMock) -> None:
        """正常系: S3から結果を読み込んで統合すること"""
        # S3から読み込む結果データ
        result1 = {"speaker": "SPEAKER_00", "start": 0.0, "end": 5.0, "text": "こんにちは"}
        result2 = {"speaker": "SPEAKER_01", "start": 5.5, "end": 10.0, "text": "はい、こんにちは"}

        mock_s3.get_object.side_effect = [
            self._make_s3_response(result1),
            self._make_s3_response(result2),
        ]

        event = {
            "bucket": "test-bucket",
            "transcription_results": [
                {"result_key": "transcribe_results/test_0000.json", "speaker": "SPEAKER_00", "start": 0.0, "end": 5.0},
                {"result_key": "transcribe_results/test_0001.json", "speaker": "SPEAKER_01", "start": 5.5, "end": 10.0},
            ],
            "audio_key": "processed/test.wav",
        }
        context = MagicMock()

        result = lambda_module.lambda_handler(event, context)

        assert result["bucket"] == "test-bucket"
        assert "transcript_key" in result
        # S3からの読み込みが2回呼ばれること
        assert mock_s3.get_object.call_count == 2

    def test_lambda_handler_sorts_by_time(self, mock_s3: MagicMock) -> None:
        """結果が時系列でソートされること"""
        # 順序がバラバラの結果データ
        result1 = {"speaker": "SPEAKER_01", "start": 5.5, "end": 10.0, "text": "2番目"}
        result2 = {"speaker": "SPEAKER_00", "start": 0.0, "end": 5.0, "text": "1番目"}

        mock_s3.get_object.side_effect = [
            self._make_s3_response(result1),
            self._make_s3_response(result2),
        ]

        event = {
            "bucket": "test-bucket",
            "transcription_results": [
                {"result_key": "transcribe_results/test_0001.json", "speaker": "SPEAKER_01", "start": 5.5, "end": 10.0},
                {"result_key": "transcribe_results/test_0000.json", "speaker": "SPEAKER_00", "start": 0.0, "end": 5.0},
            ],
            "audio_key": "processed/test.wav",
        }
        context = MagicMock()

        lambda_module.lambda_handler(event, context)

        # put_object が呼ばれた時のデータを検証
        call_args = mock_s3.put_object.call_args
        body = json.loads(call_args.kwargs["Body"])

        # 時系列でソートされていること
        assert body[0]["text"] == "1番目"
        assert body[1]["text"] == "2番目"

    def test_lambda_handler_many_segments(self, mock_s3: MagicMock) -> None:
        """多数のセグメント（800+）を処理できること"""
        # 800セグメント分のモックデータ
        num_segments = 800
        results = []
        s3_responses = []

        for i in range(num_segments):
            result = {
                "speaker": f"SPEAKER_{i % 2:02d}",
                "start": float(i),
                "end": float(i + 1),
                "text": f"セグメント{i}のテキスト",
            }
            results.append({
                "result_key": f"transcribe_results/test_{i:04d}.json",
                "speaker": result["speaker"],
                "start": result["start"],
                "end": result["end"],
            })
            s3_responses.append(self._make_s3_response(result))

        mock_s3.get_object.side_effect = s3_responses

        event = {
            "bucket": "test-bucket",
            "transcription_results": results,
            "audio_key": "processed/test.wav",
        }
        context = MagicMock()

        result = lambda_module.lambda_handler(event, context)

        assert result["segment_count"] == num_segments
        assert mock_s3.get_object.call_count == num_segments
