"""
SplitBySpeaker Lambda のテスト

第5原則: テストファースト

修正: States.DataLimitExceeded対策
- segment_filesをS3に保存（AggregateResults用）
- segment_filesも返す（TranscribeSegments Map state用、約100バイト/セグメントで256KB未満）
"""

import importlib.util
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
    "split_by_speaker_lambda", LAMBDA_DIR / "lambda_function.py"
)
if spec and spec.loader:
    lambda_module = importlib.util.module_from_spec(spec)
    sys.modules["split_by_speaker_lambda"] = lambda_module
    spec.loader.exec_module(lambda_module)


class TestSplitBySpeaker:
    """音声分割機能のテスト"""

    @pytest.fixture
    def mock_s3(self) -> Generator[MagicMock, None, None]:
        """S3 クライアントのモック"""
        with patch.object(lambda_module, "s3") as mock:
            # segments.json のモックデータ
            mock.get_object.return_value = {
                "Body": MagicMock(
                    read=lambda: json.dumps(
                        [
                            {"start": 0.0, "end": 5.0, "speaker": "SPEAKER_00"},
                            {"start": 5.5, "end": 10.0, "speaker": "SPEAKER_01"},
                        ]
                    ).encode()
                )
            }
            yield mock

    @pytest.fixture
    def mock_subprocess(self) -> Generator[MagicMock, None, None]:
        """subprocess.run のモック"""
        with patch.object(lambda_module.subprocess, "run") as mock:
            # 成功を返すモック
            mock.return_value = MagicMock(returncode=0, stderr="")
            yield mock

    @pytest.fixture
    def mock_os(self) -> Generator[None, None, None]:
        """os.path.exists と os.remove のモック"""
        with patch.object(lambda_module.os.path, "exists", return_value=True):
            with patch.object(lambda_module.os, "remove"):
                yield None

    def test_lambda_handler_success(
        self, mock_s3: MagicMock, mock_subprocess: MagicMock, mock_os: None
    ) -> None:
        """正常系: 音声分割が成功し、segment_filesがS3に保存されること"""
        event = {
            "bucket": "test-bucket",
            "audio_key": "processed/test.wav",
            "segments_key": "processed/test_segments.json",
        }
        context = MagicMock()

        result = lambda_module.lambda_handler(event, context)

        assert result["bucket"] == "test-bucket"
        # segment_filesはS3に保存され、キーが返される
        assert "segment_files_key" in result
        assert result["segment_files_key"].endswith("_segment_files.json")
        assert result["segment_count"] == 2
        # segment_filesも返される（Map state用）
        assert "segment_files" in result
        assert len(result["segment_files"]) == 2

    def test_lambda_handler_saves_segment_files_to_s3(
        self, mock_s3: MagicMock, mock_subprocess: MagicMock, mock_os: None
    ) -> None:
        """segment_filesがS3に正しく保存されること"""
        event = {
            "bucket": "test-bucket",
            "audio_key": "processed/test.wav",
            "segments_key": "processed/test_segments.json",
        }
        context = MagicMock()

        lambda_module.lambda_handler(event, context)

        # put_objectが呼ばれたことを確認（segment_files.jsonの保存）
        put_calls = [c for c in mock_s3.put_object.call_args_list]
        assert len(put_calls) >= 1

        # 保存されたJSONの内容を検証
        last_call = put_calls[-1]
        saved_data = json.loads(last_call.kwargs["Body"])
        assert len(saved_data) == 2
        assert saved_data[0]["speaker"] == "SPEAKER_00"

    def test_lambda_handler_empty_segments(
        self, mock_s3: MagicMock, mock_subprocess: MagicMock, mock_os: None
    ) -> None:
        """空のセグメントリストでも正常に動作すること"""
        mock_s3.get_object.return_value = {
            "Body": MagicMock(read=lambda: json.dumps([]).encode())
        }

        event = {
            "bucket": "test-bucket",
            "audio_key": "processed/test.wav",
            "segments_key": "processed/test_segments.json",
        }
        context = MagicMock()

        result = lambda_module.lambda_handler(event, context)

        assert result["segment_count"] == 0

    def test_lambda_handler_many_segments(
        self, mock_s3: MagicMock, mock_subprocess: MagicMock, mock_os: None
    ) -> None:
        """多数のセグメント（900+）でもペイロードが256KB未満であること"""
        # 900セグメント分のモックデータ
        segments = [
            {"start": float(i), "end": float(i + 1), "speaker": f"SPEAKER_{i % 2:02d}"}
            for i in range(900)
        ]
        mock_s3.get_object.return_value = {
            "Body": MagicMock(read=lambda: json.dumps(segments).encode())
        }

        event = {
            "bucket": "test-bucket",
            "audio_key": "processed/test.wav",
            "segments_key": "processed/test_segments.json",
        }
        context = MagicMock()

        result = lambda_module.lambda_handler(event, context)

        # segment_filesが返される（Map state用）
        assert result["segment_count"] == 900
        assert "segment_files" in result
        assert len(result["segment_files"]) == 900
        # 返却値のサイズが256KB未満であることを確認（約100バイト/セグメント）
        result_json = json.dumps(result)
        assert len(result_json) < 256 * 1024  # 256KB未満

    def test_split_audio_calls_ffmpeg_correctly(
        self, mock_subprocess: MagicMock, tmp_path: Path
    ) -> None:
        """split_audio が ffmpeg を正しく呼び出すこと"""
        input_path = str(tmp_path / "input.wav")
        output_path = str(tmp_path / "output.wav")
        Path(input_path).touch()

        lambda_module.split_audio(input_path, output_path, 5.0, 10.0)

        # subprocess.run が呼び出されたことを確認
        mock_subprocess.assert_called_once()
        call_args = mock_subprocess.call_args[0][0]

        # ffmpeg コマンドの確認
        assert call_args[0] == "ffmpeg"
        assert "-ss" in call_args
        assert "5.0" in call_args
        assert "-t" in call_args
        assert "10.0" in call_args
        assert "-i" in call_args
        assert input_path in call_args
        assert output_path in call_args
