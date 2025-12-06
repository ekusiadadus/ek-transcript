"""
MergeSpeakers Lambda のテスト

第5原則: テストファースト
チャンク並列処理対応版
"""

import importlib.util
import json
import sys
from collections.abc import Generator
from pathlib import Path
from unittest.mock import MagicMock, patch

import numpy as np
import pytest

# このLambdaのlambda_function.pyを動的にインポート
LAMBDA_DIR = Path(__file__).parent.parent
spec = importlib.util.spec_from_file_location(
    "merge_speakers_lambda", LAMBDA_DIR / "lambda_function.py"
)
if spec and spec.loader:
    lambda_module = importlib.util.module_from_spec(spec)
    sys.modules["merge_speakers_lambda"] = lambda_module
    spec.loader.exec_module(lambda_module)


class TestClusterSpeakers:
    """話者クラスタリングのテスト"""

    def test_single_speaker_across_chunks(self) -> None:
        """同一話者が複数チャンクに存在する場合、1つにクラスタリング"""
        # 非常に似た埋め込み（同一人物）
        base_embedding = np.random.randn(512).tolist()
        chunk_results = [
            {
                "chunk_index": 0,
                "speakers": {
                    "SPEAKER_00": {
                        "embedding": base_embedding,
                        "total_duration": 30.0,
                    },
                },
            },
            {
                "chunk_index": 1,
                "speakers": {
                    "SPEAKER_00": {
                        # 同じ埋め込みに少しノイズを加える
                        "embedding": [x + np.random.normal(0, 0.01) for x in base_embedding],
                        "total_duration": 25.0,
                    },
                },
            },
        ]

        mapping, count = lambda_module.cluster_speakers(chunk_results)

        # 2つのチャンクの SPEAKER_00 が同一人物としてクラスタリングされる
        assert count == 1
        assert mapping["chunk_0_SPEAKER_00"] == mapping["chunk_1_SPEAKER_00"]

    def test_two_different_speakers(self) -> None:
        """異なる話者が正しく分離される"""
        # 全く異なる埋め込み（異なる人物）
        embedding1 = np.random.randn(512).tolist()
        embedding2 = [-x for x in embedding1]  # 逆向きベクトル

        chunk_results = [
            {
                "chunk_index": 0,
                "speakers": {
                    "SPEAKER_00": {
                        "embedding": embedding1,
                        "total_duration": 30.0,
                    },
                    "SPEAKER_01": {
                        "embedding": embedding2,
                        "total_duration": 25.0,
                    },
                },
            },
        ]

        mapping, count = lambda_module.cluster_speakers(chunk_results)

        assert count == 2
        assert mapping["chunk_0_SPEAKER_00"] != mapping["chunk_0_SPEAKER_01"]

    def test_empty_chunk_results(self) -> None:
        """空のチャンク結果を処理"""
        mapping, count = lambda_module.cluster_speakers([])

        assert count == 0
        assert mapping == {}

    def test_single_embedding(self) -> None:
        """単一の埋め込みは1話者"""
        chunk_results = [
            {
                "chunk_index": 0,
                "speakers": {
                    "SPEAKER_00": {
                        "embedding": np.random.randn(512).tolist(),
                        "total_duration": 30.0,
                    },
                },
            },
        ]

        mapping, count = lambda_module.cluster_speakers(chunk_results)

        assert count == 1
        assert mapping["chunk_0_SPEAKER_00"] == "SPEAKER_A"


class TestResolveOverlaps:
    """オーバーラップ解決のテスト"""

    def test_segment_within_effective_range(self) -> None:
        """有効範囲内のセグメントはそのまま"""
        segments = [
            {
                "global_start": 10.0,
                "global_end": 20.0,
                "speaker": "SPEAKER_A",
                "effective_start": 0.0,
                "effective_end": 480.0,
            },
        ]

        result = lambda_module.resolve_overlaps(segments)

        assert len(result) == 1
        assert result[0]["start"] == 10.0
        assert result[0]["end"] == 20.0

    def test_segment_partially_in_effective_range(self) -> None:
        """セグメントが有効範囲に部分的にのみ含まれる場合"""
        segments = [
            {
                "global_start": 470.0,
                "global_end": 490.0,
                "speaker": "SPEAKER_A",
                "effective_start": 0.0,
                "effective_end": 480.0,
            },
        ]

        result = lambda_module.resolve_overlaps(segments)

        assert len(result) == 1
        assert result[0]["start"] == 470.0
        assert result[0]["end"] == 480.0  # 有効範囲の終端でクリップ

    def test_segment_outside_effective_range(self) -> None:
        """有効範囲外のセグメントは除外"""
        segments = [
            {
                "global_start": 500.0,
                "global_end": 510.0,
                "speaker": "SPEAKER_A",
                "effective_start": 0.0,
                "effective_end": 480.0,
            },
        ]

        result = lambda_module.resolve_overlaps(segments)

        assert len(result) == 0

    def test_merge_consecutive_same_speaker(self) -> None:
        """連続する同一話者セグメントを結合"""
        segments = [
            {
                "global_start": 10.0,
                "global_end": 15.0,
                "speaker": "SPEAKER_A",
                "effective_start": 0.0,
                "effective_end": 480.0,
            },
            {
                "global_start": 15.2,  # 0.2秒後（0.5秒以内）
                "global_end": 20.0,
                "speaker": "SPEAKER_A",
                "effective_start": 0.0,
                "effective_end": 480.0,
            },
        ]

        result = lambda_module.resolve_overlaps(segments)

        assert len(result) == 1
        assert result[0]["start"] == 10.0
        assert result[0]["end"] == 20.0

    def test_do_not_merge_different_speakers(self) -> None:
        """異なる話者のセグメントは結合しない"""
        segments = [
            {
                "global_start": 10.0,
                "global_end": 15.0,
                "speaker": "SPEAKER_A",
                "effective_start": 0.0,
                "effective_end": 480.0,
            },
            {
                "global_start": 15.2,
                "global_end": 20.0,
                "speaker": "SPEAKER_B",
                "effective_start": 0.0,
                "effective_end": 480.0,
            },
        ]

        result = lambda_module.resolve_overlaps(segments)

        assert len(result) == 2

    def test_segments_sorted_by_time(self) -> None:
        """セグメントは時刻順にソートされる"""
        segments = [
            {
                "global_start": 100.0,
                "global_end": 110.0,
                "speaker": "SPEAKER_A",
                "effective_start": 0.0,
                "effective_end": 480.0,
            },
            {
                "global_start": 10.0,
                "global_end": 20.0,
                "speaker": "SPEAKER_B",
                "effective_start": 0.0,
                "effective_end": 480.0,
            },
        ]

        result = lambda_module.resolve_overlaps(segments)

        assert result[0]["start"] == 10.0
        assert result[1]["start"] == 100.0


class TestLambdaHandler:
    """Lambda ハンドラーのテスト"""

    @pytest.fixture
    def mock_s3(self) -> Generator[MagicMock, None, None]:
        """S3 クライアントのモック"""
        with patch.object(lambda_module, "s3") as mock:
            yield mock

    @pytest.fixture
    def mock_load_chunk_results(self) -> Generator[MagicMock, None, None]:
        """load_chunk_results のモック"""
        with patch.object(lambda_module, "load_chunk_results") as mock:
            # 2チャンク、2話者のデータ
            mock.return_value = [
                {
                    "chunk_index": 0,
                    "offset": 0.0,
                    "effective_start": 0.0,
                    "effective_end": 480.0,
                    "segments": [
                        {"local_start": 1.0, "local_end": 10.0, "local_speaker": "SPEAKER_00"},
                        {"local_start": 11.0, "local_end": 20.0, "local_speaker": "SPEAKER_01"},
                    ],
                    "speakers": {
                        "SPEAKER_00": {
                            "embedding": [0.1] * 512,
                            "total_duration": 9.0,
                        },
                        "SPEAKER_01": {
                            "embedding": [0.2] * 512,
                            "total_duration": 9.0,
                        },
                    },
                },
                {
                    "chunk_index": 1,
                    "offset": 450.0,
                    "effective_start": 480.0,
                    "effective_end": 960.0,
                    "segments": [
                        {"local_start": 35.0, "local_end": 45.0, "local_speaker": "SPEAKER_00"},
                    ],
                    "speakers": {
                        "SPEAKER_00": {
                            "embedding": [0.1] * 512,  # chunk_0 の SPEAKER_00 と同じ
                            "total_duration": 10.0,
                        },
                    },
                },
            ]
            yield mock

    def test_lambda_handler_success(
        self,
        mock_s3: MagicMock,
        mock_load_chunk_results: MagicMock,
    ) -> None:
        """正常系: 話者統合が成功"""
        event = {
            "bucket": "test-bucket",
            "audio_key": "processed/test.wav",
            "chunk_results": [
                {"chunk_index": 0, "result_key": "diarization/chunk_00.json"},
                {"chunk_index": 1, "result_key": "diarization/chunk_01.json"},
            ],
            "chunk_config": {
                "chunk_duration": 480,
                "overlap_duration": 30,
            },
        }
        context = MagicMock()

        result = lambda_module.lambda_handler(event, context)

        assert result["bucket"] == "test-bucket"
        assert "segments_key" in result
        assert "segments" in result
        assert "speaker_mapping" in result
        assert "global_speaker_count" in result

    def test_lambda_handler_saves_segments(
        self,
        mock_s3: MagicMock,
        mock_load_chunk_results: MagicMock,
    ) -> None:
        """セグメント情報を S3 に保存"""
        event = {
            "bucket": "test-bucket",
            "audio_key": "processed/interview.wav",
            "chunk_results": [
                {"chunk_index": 0, "result_key": "diarization/chunk_00.json"},
            ],
        }
        context = MagicMock()

        lambda_module.lambda_handler(event, context)

        mock_s3.put_object.assert_called_once()
        call_kwargs = mock_s3.put_object.call_args.kwargs
        assert "segments" in call_kwargs["Key"]
        assert call_kwargs["ContentType"] == "application/json"

    def test_lambda_handler_missing_bucket(self) -> None:
        """bucket が指定されていない場合にエラー"""
        event = {
            "audio_key": "processed/test.wav",
            "chunk_results": [],
        }
        context = MagicMock()

        with pytest.raises(KeyError):
            lambda_module.lambda_handler(event, context)

    def test_lambda_handler_empty_chunks(
        self,
        mock_s3: MagicMock,
    ) -> None:
        """空のチャンク結果を処理"""
        with patch.object(lambda_module, "load_chunk_results") as mock:
            mock.return_value = [
                {"chunk_index": 0, "segments": [], "speakers": {}},
            ]

            event = {
                "bucket": "test-bucket",
                "audio_key": "processed/test.wav",
                "chunk_results": [
                    {"chunk_index": 0, "result_key": "diarization/chunk_00.json"},
                ],
            }
            context = MagicMock()

            result = lambda_module.lambda_handler(event, context)

            assert result["global_speaker_count"] == 0
            assert result["segments"] == []


class TestGlobalTimestampConversion:
    """グローバルタイムスタンプ変換のテスト"""

    @pytest.fixture
    def mock_s3(self) -> Generator[MagicMock, None, None]:
        """S3 クライアントのモック"""
        with patch.object(lambda_module, "s3") as mock:
            yield mock

    def test_offset_applied_to_timestamps(
        self,
        mock_s3: MagicMock,
    ) -> None:
        """オフセットがタイムスタンプに適用される"""
        with patch.object(lambda_module, "load_chunk_results") as mock:
            mock.return_value = [
                {
                    "chunk_index": 1,
                    "offset": 450.0,  # 450秒のオフセット
                    "effective_start": 450.0,
                    "effective_end": 930.0,
                    "segments": [
                        {"local_start": 35.0, "local_end": 45.0, "local_speaker": "SPEAKER_00"},
                    ],
                    "speakers": {
                        "SPEAKER_00": {
                            "embedding": [0.1] * 512,
                            "total_duration": 10.0,
                        },
                    },
                },
            ]

            event = {
                "bucket": "test-bucket",
                "audio_key": "processed/test.wav",
                "chunk_results": [
                    {"chunk_index": 1, "result_key": "diarization/chunk_01.json"},
                ],
            }
            context = MagicMock()

            result = lambda_module.lambda_handler(event, context)

            # ローカルタイムスタンプ 35.0〜45.0 + オフセット 450.0 = 485.0〜495.0
            assert result["segments"][0]["start"] == 485.0
            assert result["segments"][0]["end"] == 495.0


class TestIntegration:
    """統合テスト"""

    @pytest.mark.integration
    def test_real_s3_load(self) -> None:
        """実際の S3 からデータを読み込み"""
        pytest.skip("Integration test - requires AWS credentials")
