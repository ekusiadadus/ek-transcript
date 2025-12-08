"""
AggregateResults Lambda のテスト

第5原則: テストファースト

修正: States.DataLimitExceeded対策（完全版）
- segment_files_keyからセグメント情報を取得
- 各セグメントに対応するtranscribe_resultsをS3から読み込み
"""

import importlib.util
import io
import json
import sys
from collections.abc import Generator
from pathlib import Path
from types import ModuleType
from unittest.mock import MagicMock, patch

import pytest

# progress モジュールのモック（Lambda 実行環境でのみ存在）
mock_progress = ModuleType("progress")
mock_progress.update_progress = MagicMock()  # type: ignore
sys.modules["progress"] = mock_progress

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

    def _make_s3_response(self, data: dict | list) -> dict:
        """S3 get_object レスポンスを生成"""
        body = io.BytesIO(json.dumps(data).encode("utf-8"))
        return {"Body": body}

    def test_lambda_handler_success(self, mock_s3: MagicMock) -> None:
        """正常系: segment_files_keyからセグメント情報を取得し、結果を統合すること"""
        # segment_filesデータ
        segment_files = [
            {"key": "segments/test_0000_SPEAKER_00.wav", "speaker": "SPEAKER_00", "start": 0.0, "end": 5.0},
            {"key": "segments/test_0001_SPEAKER_01.wav", "speaker": "SPEAKER_01", "start": 5.5, "end": 10.0},
        ]
        # transcribe_resultsデータ
        result1 = {"speaker": "SPEAKER_00", "start": 0.0, "end": 5.0, "text": "こんにちは"}
        result2 = {"speaker": "SPEAKER_01", "start": 5.5, "end": 10.0, "text": "はい、こんにちは"}

        mock_s3.get_object.side_effect = [
            self._make_s3_response(segment_files),  # segment_files_key
            self._make_s3_response(result1),  # transcribe_results/test_0000_SPEAKER_00.json
            self._make_s3_response(result2),  # transcribe_results/test_0001_SPEAKER_01.json
        ]

        event = {
            "bucket": "test-bucket",
            "segment_files_key": "metadata/test_segment_files.json",
            "audio_key": "processed/test.wav",
        }
        context = MagicMock()

        result = lambda_module.lambda_handler(event, context)

        assert result["bucket"] == "test-bucket"
        assert "transcript_key" in result
        # S3からの読み込み: segment_files(1) + transcribe_results(2) = 3
        assert mock_s3.get_object.call_count == 3

    def test_lambda_handler_sorts_by_time(self, mock_s3: MagicMock) -> None:
        """結果が時系列でソートされること"""
        # segment_filesデータ（順序がバラバラ）
        segment_files = [
            {"key": "segments/test_0001_SPEAKER_01.wav", "speaker": "SPEAKER_01", "start": 5.5, "end": 10.0},
            {"key": "segments/test_0000_SPEAKER_00.wav", "speaker": "SPEAKER_00", "start": 0.0, "end": 5.0},
        ]
        # transcribe_resultsデータ
        result1 = {"speaker": "SPEAKER_01", "start": 5.5, "end": 10.0, "text": "2番目"}
        result2 = {"speaker": "SPEAKER_00", "start": 0.0, "end": 5.0, "text": "1番目"}

        mock_s3.get_object.side_effect = [
            self._make_s3_response(segment_files),
            self._make_s3_response(result1),
            self._make_s3_response(result2),
        ]

        event = {
            "bucket": "test-bucket",
            "segment_files_key": "metadata/test_segment_files.json",
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
        num_segments = 800
        segment_files = []
        s3_responses = []

        for i in range(num_segments):
            segment_files.append({
                "key": f"segments/test_{i:04d}_SPEAKER_{i % 2:02d}.wav",
                "speaker": f"SPEAKER_{i % 2:02d}",
                "start": float(i),
                "end": float(i + 1),
            })

        # segment_filesのレスポンス
        s3_responses.append(self._make_s3_response(segment_files))

        # 各transcribe_resultのレスポンス
        for i in range(num_segments):
            result = {
                "speaker": f"SPEAKER_{i % 2:02d}",
                "start": float(i),
                "end": float(i + 1),
                "text": f"セグメント{i}のテキスト",
            }
            s3_responses.append(self._make_s3_response(result))

        mock_s3.get_object.side_effect = s3_responses

        event = {
            "bucket": "test-bucket",
            "segment_files_key": "metadata/test_segment_files.json",
            "audio_key": "processed/test.wav",
        }
        context = MagicMock()

        result = lambda_module.lambda_handler(event, context)

        assert result["segment_count"] == num_segments
        # segment_files(1) + transcribe_results(800) = 801
        assert mock_s3.get_object.call_count == num_segments + 1
