"""
ExtractAudio Lambda のテスト

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
    "extract_audio_lambda", LAMBDA_DIR / "lambda_function.py"
)
if spec and spec.loader:
    lambda_module = importlib.util.module_from_spec(spec)
    sys.modules["extract_audio_lambda"] = lambda_module
    spec.loader.exec_module(lambda_module)


class TestExtractAudio:
    """音声抽出機能のテスト"""

    def test_extract_audio_creates_wav_file(self, tmp_path: Path) -> None:
        """MP4からWAVファイルが正しく作成されること"""
        # Given: テスト用の入力パス
        input_path = str(tmp_path / "input.mp4")
        # output_path = str(tmp_path / "output.wav")  # 実装後に有効化

        # ダミーファイルを作成（実際のテストではテスト用動画を使用）
        Path(input_path).touch()

        # When: extract_audio を実行
        # Note: 実際のテストでは ffmpeg が必要
        # lambda_module.extract_audio(input_path, output_path)

        # Then: WAV ファイルが作成される（実装後に有効化）
        # assert Path(output_path).exists()
        pass  # 実装後にテストを有効化

    def test_extract_audio_output_is_16khz_mono(self, tmp_path: Path) -> None:
        """出力音声が16kHz、モノラルであること"""
        # このテストは実際の音声ファイルで検証
        # 実装後に有効化
        pass

    def test_extract_audio_handles_invalid_input(self, tmp_path: Path) -> None:
        """存在しないファイルでエラーが発生すること"""
        input_path = str(tmp_path / "nonexistent.mp4")
        output_path = str(tmp_path / "output.wav")

        with pytest.raises(Exception):
            lambda_module.extract_audio(input_path, output_path)


class TestLambdaHandler:
    """Lambda ハンドラーのテスト"""

    @pytest.fixture
    def mock_s3(self) -> Generator[MagicMock, None, None]:
        """S3 クライアントのモック"""
        with patch.object(lambda_module, "s3") as mock:
            yield mock

    @pytest.fixture
    def mock_subprocess(self) -> Generator[MagicMock, None, None]:
        """subprocess.run のモック"""
        with patch.object(lambda_module.subprocess, "run") as mock:
            # 成功を返すモック
            mock.return_value = MagicMock(returncode=0, stderr="")
            yield mock

    @pytest.fixture
    def mock_os_exists(self) -> Generator[None, None, None]:
        """os.path.exists と os.remove のモック"""
        with patch.object(lambda_module.os.path, "exists", return_value=True):
            with patch.object(lambda_module.os, "remove"):
                yield None

    def test_lambda_handler_success(
        self, mock_s3: MagicMock, mock_subprocess: MagicMock, mock_os_exists: None
    ) -> None:
        """正常系: S3からダウンロード→処理→S3アップロードが成功すること"""
        # Given
        event = {
            "bucket": "test-bucket",
            "key": "videos/test.mp4",
        }
        context = MagicMock()

        # When
        result = lambda_module.lambda_handler(event, context)

        # Then
        assert result["bucket"] == "test-bucket"
        assert "audio_key" in result
        assert result["audio_key"].endswith(".wav")
        mock_s3.download_file.assert_called_once()
        mock_s3.upload_file.assert_called_once()

    def test_lambda_handler_missing_bucket(self) -> None:
        """bucket が指定されていない場合にエラー"""
        event = {"key": "videos/test.mp4"}
        context = MagicMock()

        with pytest.raises(KeyError):
            lambda_module.lambda_handler(event, context)

    def test_lambda_handler_missing_key(self) -> None:
        """key が指定されていない場合にエラー"""
        event = {"bucket": "test-bucket"}
        context = MagicMock()

        with pytest.raises(KeyError):
            lambda_module.lambda_handler(event, context)

    def test_lambda_handler_returns_correct_output_key(
        self, mock_s3: MagicMock, mock_subprocess: MagicMock, mock_os_exists: None
    ) -> None:
        """出力キーが正しい形式であること"""
        event = {
            "bucket": "test-bucket",
            "key": "videos/meeting_2024.mp4",
        }
        context = MagicMock()

        result = lambda_module.lambda_handler(event, context)

        # processed/ プレフィックスが付き、拡張子が .wav に変わる
        assert result["audio_key"] == "processed/videos/meeting_2024.wav"

    def test_extract_audio_calls_ffmpeg_correctly(
        self, mock_subprocess: MagicMock, tmp_path: Path
    ) -> None:
        """ffmpeg が正しいオプションで呼び出されること"""
        input_path = str(tmp_path / "input.mp4")
        output_path = str(tmp_path / "output.wav")
        Path(input_path).touch()

        lambda_module.extract_audio(input_path, output_path)

        # subprocess.run が呼び出されたことを確認
        mock_subprocess.assert_called_once()
        call_args = mock_subprocess.call_args[0][0]

        # ffmpeg コマンドの確認
        assert call_args[0] == "ffmpeg"
        assert "-i" in call_args
        assert input_path in call_args
        assert output_path in call_args
        assert "-ac" in call_args
        assert "1" in call_args  # モノラル
        assert "-ar" in call_args
        assert "16000" in call_args  # 16kHz


class TestIntegration:
    """統合テスト（実際のffmpegが必要）"""

    @pytest.mark.integration
    def test_extract_real_audio(self, tmp_path: Path) -> None:
        """実際の動画ファイルから音声を抽出"""
        # 統合テストは別途実行
        pytest.skip("Integration test - requires test video file")
