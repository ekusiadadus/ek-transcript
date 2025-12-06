"""
DiarizeChunk Lambda のテスト

第5原則: テストファースト
チャンク並列処理対応版
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
    "diarize_lambda", LAMBDA_DIR / "lambda_function.py"
)
if spec and spec.loader:
    lambda_module = importlib.util.module_from_spec(spec)
    sys.modules["diarize_lambda"] = lambda_module
    spec.loader.exec_module(lambda_module)


class TestDiarizeChunk:
    """チャンク話者分離機能のテスト"""

    @pytest.fixture
    def mock_pipeline(self) -> Generator[MagicMock, None, None]:
        """pyannote Pipeline のモック"""
        with patch.object(lambda_module, "get_pipeline") as mock:
            pipeline = MagicMock()
            # ダミーの話者分離結果
            mock_track1 = MagicMock()
            mock_track1.start = 0.0
            mock_track1.end = 5.0
            mock_track2 = MagicMock()
            mock_track2.start = 5.5
            mock_track2.end = 10.0
            pipeline.return_value.itertracks.return_value = [
                (mock_track1, None, "SPEAKER_00"),
                (mock_track2, None, "SPEAKER_01"),
            ]
            mock.return_value = pipeline
            yield mock

    @pytest.fixture
    def mock_extract_embeddings(self) -> Generator[MagicMock, None, None]:
        """extract_speaker_embeddings のモック"""
        with patch.object(lambda_module, "extract_speaker_embeddings") as mock:
            mock.return_value = {
                "SPEAKER_00": {
                    "embedding": [0.1] * 512,
                    "total_duration": 5.0,
                    "segment_count": 1,
                },
                "SPEAKER_01": {
                    "embedding": [0.2] * 512,
                    "total_duration": 4.5,
                    "segment_count": 1,
                },
            }
            yield mock

    @pytest.fixture
    def mock_s3(self) -> Generator[MagicMock, None, None]:
        """S3 クライアントのモック"""
        with patch.object(lambda_module, "s3") as mock:
            yield mock

    @pytest.fixture
    def mock_soundfile(self) -> Generator[MagicMock, None, None]:
        """soundfile のモック"""
        with patch.object(lambda_module.sf, "read") as mock:
            import numpy as np
            mock.return_value = (np.zeros(16000 * 10), 16000)  # 10秒の音声
            yield mock

    @pytest.fixture
    def mock_os(self) -> Generator[None, None, None]:
        """os のモック"""
        with patch.object(lambda_module.os.path, "exists", return_value=True):
            with patch.object(lambda_module.os, "remove"):
                yield None

    def test_lambda_handler_chunk_input(
        self,
        mock_s3: MagicMock,
        mock_pipeline: MagicMock,
        mock_extract_embeddings: MagicMock,
        mock_soundfile: MagicMock,
        mock_os: None,
    ) -> None:
        """チャンク入力形式を正しく処理"""
        event = {
            "bucket": "test-bucket",
            "chunk": {
                "chunk_index": 0,
                "chunk_key": "chunks/test_chunk_00.wav",
                "offset": 0.0,
                "duration": 510.0,
                "effective_start": 0.0,
                "effective_end": 480.0,
            },
        }
        context = MagicMock()

        result = lambda_module.lambda_handler(event, context)

        assert result["chunk_index"] == 0
        assert "result_key" in result
        assert "speaker_count" in result

    def test_lambda_handler_saves_to_s3(
        self,
        mock_s3: MagicMock,
        mock_pipeline: MagicMock,
        mock_extract_embeddings: MagicMock,
        mock_soundfile: MagicMock,
        mock_os: None,
    ) -> None:
        """詳細結果をS3に保存"""
        event = {
            "bucket": "test-bucket",
            "chunk": {
                "chunk_index": 1,
                "chunk_key": "chunks/test_chunk_01.wav",
                "offset": 450.0,
                "duration": 510.0,
                "effective_start": 450.0,
                "effective_end": 930.0,
            },
        }
        context = MagicMock()

        lambda_module.lambda_handler(event, context)

        mock_s3.put_object.assert_called_once()
        call_kwargs = mock_s3.put_object.call_args.kwargs
        assert "diarization/" in call_kwargs["Key"]
        assert call_kwargs["ContentType"] == "application/json"

    def test_lambda_handler_returns_lightweight_response(
        self,
        mock_s3: MagicMock,
        mock_pipeline: MagicMock,
        mock_extract_embeddings: MagicMock,
        mock_soundfile: MagicMock,
        mock_os: None,
    ) -> None:
        """Step Functions には軽量なレスポンスを返す"""
        event = {
            "bucket": "test-bucket",
            "chunk": {
                "chunk_index": 0,
                "chunk_key": "chunks/test_chunk_00.wav",
                "offset": 0.0,
                "duration": 510.0,
                "effective_start": 0.0,
                "effective_end": 480.0,
            },
        }
        context = MagicMock()

        result = lambda_module.lambda_handler(event, context)

        # レスポンスは軽量（埋め込みベクトルを含まない）
        assert "chunk_index" in result
        assert "result_key" in result
        assert "speaker_count" in result
        # 埋め込みベクトルはレスポンスに含まれない
        assert "speakers" not in result
        assert "embedding" not in result

    def test_lambda_handler_missing_bucket(self) -> None:
        """bucket が指定されていない場合にエラー"""
        event = {
            "chunk": {
                "chunk_index": 0,
                "chunk_key": "chunks/test_chunk_00.wav",
            },
        }
        context = MagicMock()

        with pytest.raises(KeyError):
            lambda_module.lambda_handler(event, context)

    def test_lambda_handler_missing_chunk(self) -> None:
        """chunk が指定されていない場合にエラー"""
        event = {"bucket": "test-bucket"}
        context = MagicMock()

        with pytest.raises(KeyError):
            lambda_module.lambda_handler(event, context)


class TestExtractSpeakerEmbeddings:
    """話者埋め込み抽出のテスト"""

    @pytest.fixture
    def mock_embedding_model(self) -> Generator[MagicMock, None, None]:
        """埋め込みモデルのモック"""
        with patch.object(lambda_module, "get_embedding_model") as mock:
            embedding_model = MagicMock()
            import numpy as np
            embedding_model.crop.return_value = np.random.randn(512)
            mock.return_value = embedding_model
            yield mock

    def test_extracts_embeddings_for_each_speaker(
        self, mock_embedding_model: MagicMock, tmp_path: Path
    ) -> None:
        """各話者の埋め込みを抽出"""
        segments = [
            {"local_start": 0.0, "local_end": 5.0, "local_speaker": "SPEAKER_00"},
            {"local_start": 5.5, "local_end": 10.0, "local_speaker": "SPEAKER_01"},
            {"local_start": 10.5, "local_end": 15.0, "local_speaker": "SPEAKER_00"},
        ]

        result = lambda_module.extract_speaker_embeddings(
            str(tmp_path / "audio.wav"), segments
        )

        assert "SPEAKER_00" in result
        assert "SPEAKER_01" in result
        assert "embedding" in result["SPEAKER_00"]
        assert "total_duration" in result["SPEAKER_00"]

    def test_weighted_average_embedding(
        self, mock_embedding_model: MagicMock, tmp_path: Path
    ) -> None:
        """重み付き平均埋め込みが計算される"""
        import numpy as np
        # 異なる埋め込みを返すようにモック
        mock_embedding_model.return_value.crop.side_effect = [
            np.ones(512) * 1.0,  # 5秒
            np.ones(512) * 2.0,  # 10秒
        ]

        segments = [
            {"local_start": 0.0, "local_end": 5.0, "local_speaker": "SPEAKER_00"},
            {"local_start": 5.5, "local_end": 15.5, "local_speaker": "SPEAKER_00"},
        ]

        result = lambda_module.extract_speaker_embeddings(
            str(tmp_path / "audio.wav"), segments
        )

        # 重み: 5/(5+10)=0.333, 10/(5+10)=0.667
        # 加重平均: 1*0.333 + 2*0.667 = 1.667
        embedding = result["SPEAKER_00"]["embedding"]
        assert 1.5 < embedding[0] < 1.8  # 近似値チェック

    def test_skips_short_segments(
        self, mock_embedding_model: MagicMock, tmp_path: Path
    ) -> None:
        """短いセグメント（0.5秒未満）はスキップ"""
        segments = [
            {"local_start": 0.0, "local_end": 0.3, "local_speaker": "SPEAKER_00"},
            {"local_start": 0.5, "local_end": 5.0, "local_speaker": "SPEAKER_00"},
        ]

        result = lambda_module.extract_speaker_embeddings(
            str(tmp_path / "audio.wav"), segments
        )

        # 0.3秒のセグメントはスキップされるので、crop は1回だけ呼ばれる
        assert mock_embedding_model.return_value.crop.call_count == 1


class TestS3ResultFormat:
    """S3に保存される結果フォーマットのテスト"""

    @pytest.fixture
    def mock_pipeline(self) -> Generator[MagicMock, None, None]:
        """pyannote Pipeline のモック"""
        with patch.object(lambda_module, "get_pipeline") as mock:
            pipeline = MagicMock()
            mock_track1 = MagicMock()
            mock_track1.start = 1.2
            mock_track1.end = 5.8
            mock_track2 = MagicMock()
            mock_track2.start = 6.1
            mock_track2.end = 12.4
            pipeline.return_value.itertracks.return_value = [
                (mock_track1, None, "SPEAKER_00"),
                (mock_track2, None, "SPEAKER_01"),
            ]
            mock.return_value = pipeline
            yield mock

    @pytest.fixture
    def mock_extract_embeddings(self) -> Generator[MagicMock, None, None]:
        """extract_speaker_embeddings のモック"""
        with patch.object(lambda_module, "extract_speaker_embeddings") as mock:
            mock.return_value = {
                "SPEAKER_00": {
                    "embedding": [0.1] * 512,
                    "total_duration": 4.6,
                    "segment_count": 1,
                },
                "SPEAKER_01": {
                    "embedding": [0.2] * 512,
                    "total_duration": 6.3,
                    "segment_count": 1,
                },
            }
            yield mock

    @pytest.fixture
    def mock_s3(self) -> Generator[MagicMock, None, None]:
        """S3 クライアントのモック"""
        with patch.object(lambda_module, "s3") as mock:
            yield mock

    @pytest.fixture
    def mock_soundfile(self) -> Generator[MagicMock, None, None]:
        """soundfile のモック"""
        with patch.object(lambda_module.sf, "read") as mock:
            import numpy as np
            mock.return_value = (np.zeros(16000 * 15), 16000)
            yield mock

    @pytest.fixture
    def mock_os(self) -> Generator[None, None, None]:
        """os のモック"""
        with patch.object(lambda_module.os.path, "exists", return_value=True):
            with patch.object(lambda_module.os, "remove"):
                yield None

    def test_s3_result_contains_required_fields(
        self,
        mock_s3: MagicMock,
        mock_pipeline: MagicMock,
        mock_extract_embeddings: MagicMock,
        mock_soundfile: MagicMock,
        mock_os: None,
    ) -> None:
        """S3に保存される結果に必須フィールドが含まれる"""
        event = {
            "bucket": "test-bucket",
            "chunk": {
                "chunk_index": 0,
                "chunk_key": "chunks/test_chunk_00.wav",
                "offset": 0.0,
                "duration": 510.0,
                "effective_start": 0.0,
                "effective_end": 480.0,
            },
        }
        context = MagicMock()

        lambda_module.lambda_handler(event, context)

        # S3に保存されたデータを取得
        call_kwargs = mock_s3.put_object.call_args.kwargs
        saved_data = json.loads(call_kwargs["Body"])

        # 必須フィールドの確認
        assert "chunk_index" in saved_data
        assert "offset" in saved_data
        assert "effective_start" in saved_data
        assert "effective_end" in saved_data
        assert "segments" in saved_data
        assert "speakers" in saved_data
        assert "speaker_count" in saved_data

    def test_s3_segments_have_local_timestamps(
        self,
        mock_s3: MagicMock,
        mock_pipeline: MagicMock,
        mock_extract_embeddings: MagicMock,
        mock_soundfile: MagicMock,
        mock_os: None,
    ) -> None:
        """セグメントにローカルタイムスタンプが含まれる"""
        event = {
            "bucket": "test-bucket",
            "chunk": {
                "chunk_index": 0,
                "chunk_key": "chunks/test_chunk_00.wav",
                "offset": 0.0,
                "duration": 510.0,
                "effective_start": 0.0,
                "effective_end": 480.0,
            },
        }
        context = MagicMock()

        lambda_module.lambda_handler(event, context)

        call_kwargs = mock_s3.put_object.call_args.kwargs
        saved_data = json.loads(call_kwargs["Body"])

        for segment in saved_data["segments"]:
            assert "local_start" in segment
            assert "local_end" in segment
            assert "local_speaker" in segment


class TestLegacySupport:
    """後方互換性のテスト（旧形式の入力）"""

    @pytest.fixture
    def mock_pipeline(self) -> Generator[MagicMock, None, None]:
        """pyannote Pipeline のモック"""
        with patch.object(lambda_module, "get_pipeline") as mock:
            pipeline = MagicMock()
            mock_track = MagicMock()
            mock_track.start = 0.0
            mock_track.end = 5.0
            pipeline.return_value.itertracks.return_value = [
                (mock_track, None, "SPEAKER_00"),
            ]
            mock.return_value = pipeline
            yield mock

    @pytest.fixture
    def mock_s3(self) -> Generator[MagicMock, None, None]:
        """S3 クライアントのモック"""
        with patch.object(lambda_module, "s3") as mock:
            yield mock

    @pytest.fixture
    def mock_soundfile(self) -> Generator[MagicMock, None, None]:
        """soundfile のモック"""
        with patch.object(lambda_module.sf, "read") as mock:
            import numpy as np
            mock.return_value = (np.zeros(16000 * 10), 16000)
            yield mock

    @pytest.fixture
    def mock_os(self) -> Generator[None, None, None]:
        """os のモック"""
        with patch.object(lambda_module.os.path, "exists", return_value=True):
            with patch.object(lambda_module.os, "remove"):
                yield None

    def test_legacy_audio_key_format(
        self,
        mock_s3: MagicMock,
        mock_pipeline: MagicMock,
        mock_soundfile: MagicMock,
        mock_os: None,
    ) -> None:
        """旧形式（audio_key）入力も受け付ける"""
        event = {
            "bucket": "test-bucket",
            "audio_key": "processed/test.wav",
        }
        context = MagicMock()

        result = lambda_module.lambda_handler(event, context)

        # 旧形式のレスポンス
        assert "segments_key" in result
        assert result["bucket"] == "test-bucket"
