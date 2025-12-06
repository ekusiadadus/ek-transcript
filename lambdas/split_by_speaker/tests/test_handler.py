"""
SplitBySpeaker Lambda のテスト

第5原則: テストファースト
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
        """正常系: 音声分割が成功すること"""
        event = {
            "bucket": "test-bucket",
            "audio_key": "processed/test.wav",
            "segments_key": "processed/test_segments.json",
        }
        context = MagicMock()

        result = lambda_module.lambda_handler(event, context)

        assert result["bucket"] == "test-bucket"
        assert "segment_files" in result
        assert len(result["segment_files"]) == 2

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

        assert result["segment_files"] == []

    def test_lambda_handler_segment_files_have_correct_format(
        self, mock_s3: MagicMock, mock_subprocess: MagicMock, mock_os: None
    ) -> None:
        """セグメントファイルが正しい形式で返されること"""
        event = {
            "bucket": "test-bucket",
            "audio_key": "processed/meeting.wav",
            "segments_key": "processed/meeting_segments.json",
        }
        context = MagicMock()

        result = lambda_module.lambda_handler(event, context)

        # 最初のセグメントを検証
        seg = result["segment_files"][0]
        assert seg["key"].startswith("segments/")
        assert seg["key"].endswith(".wav")
        assert "SPEAKER_00" in seg["key"]
        assert seg["speaker"] == "SPEAKER_00"
        assert seg["start"] == 0.0
        assert seg["end"] == 5.0

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
