"""
DiarizeChunk Lambda Function

pyannote.audio を使用してチャンク音声の話者分離を実行する。
話者ごとの埋め込みベクトルも抽出して S3 に保存。
Step Functions には軽量なレスポンスのみ返す（256KB 制限対策）。

チャンク入力形式と旧形式（audio_key）の両方をサポート。

Version: 2.0 - チャンク並列処理対応
"""

import json
import logging
import os
from typing import Any

import boto3
import numpy as np
import soundfile as sf
import torch

# ロガー設定
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# S3 クライアント
s3 = boto3.client("s3")
secrets_client = boto3.client("secretsmanager")

# 環境変数
OUTPUT_BUCKET = os.environ.get("OUTPUT_BUCKET", "")
HF_TOKEN_SECRET_ARN = os.environ.get("HF_TOKEN_SECRET_ARN", "")

# HF キャッシュは /tmp に配置（ephemeralStorage を活用）
os.environ["HF_HOME"] = "/tmp/huggingface"
os.environ["TRANSFORMERS_CACHE"] = "/tmp/huggingface"

# グローバル変数（コールドスタート対策）
_pipeline = None
_embedding_model = None


def get_hf_token() -> str:
    """HuggingFace トークンを Secrets Manager から取得"""
    if not HF_TOKEN_SECRET_ARN:
        raise ValueError("HF_TOKEN_SECRET_ARN environment variable not set")

    secret = secrets_client.get_secret_value(SecretId=HF_TOKEN_SECRET_ARN)
    secret_data: dict[str, str] = json.loads(secret["SecretString"])
    return secret_data.get("token", secret_data.get("HF_TOKEN", ""))


def get_pipeline() -> Any:
    """pyannote パイプラインを取得（シングルトン）- プリダウンロード済みモデル使用"""
    global _pipeline

    if _pipeline is None:
        from pyannote.audio import Pipeline
        from pyannote.audio.core.model import Introspection
        from pyannote.audio.core.task import Problem, Resolution, Specifications

        # PyTorch 2.6+ requires explicit safe_globals for pyannote models
        torch.serialization.add_safe_globals(
            [Specifications, Problem, Resolution, Introspection]
        )

        logger.info("Initializing pyannote pipeline from pre-downloaded model...")
        hf_token = get_hf_token()
        # モデルは /opt/huggingface にプリダウンロード済み
        _pipeline = Pipeline.from_pretrained(
            "pyannote/speaker-diarization-3.1",
            token=hf_token,
        )
        logger.info("Pipeline initialized")

    return _pipeline


def get_embedding_model() -> Any:
    """pyannote 埋め込みモデルを取得（シングルトン）"""
    global _embedding_model

    if _embedding_model is None:
        from pyannote.audio import Inference

        logger.info("Initializing embedding model...")
        hf_token = get_hf_token()
        _embedding_model = Inference(
            "pyannote/embedding",
            token=hf_token,
            window="whole",
        )
        logger.info("Embedding model initialized")

    return _embedding_model


def extract_speaker_embeddings(
    audio_path: str,
    segments: list[dict],
) -> dict[str, dict]:
    """
    各話者の代表埋め込みベクトルを抽出
    セグメント長で重み付けした加重平均を使用

    Args:
        audio_path: 音声ファイルのパス
        segments: セグメント情報のリスト

    Returns:
        話者ごとの埋め込み情報
    """
    from pyannote.core import Segment

    embedding_model = get_embedding_model()

    # 話者ごとにセグメントをグループ化
    speaker_segments: dict[str, list] = {}
    for seg in segments:
        speaker = seg["local_speaker"]
        if speaker not in speaker_segments:
            speaker_segments[speaker] = []
        speaker_segments[speaker].append(seg)

    speaker_embeddings = {}

    for speaker, segs in speaker_segments.items():
        embeddings = []
        durations = []

        for seg in segs:
            seg_duration = seg["local_end"] - seg["local_start"]
            # 短すぎるセグメントはスキップ（ノイズになりやすい）
            if seg_duration < 0.5:
                continue

            try:
                segment = Segment(seg["local_start"], seg["local_end"])
                embedding = embedding_model.crop(audio_path, segment)

                if embedding is not None and len(embedding) > 0:
                    embeddings.append(embedding.flatten())
                    durations.append(seg_duration)
            except Exception as e:
                logger.warning(f"Failed to extract embedding for segment: {e}")
                continue

        if embeddings:
            # セグメント長で重み付けした加重平均
            embeddings_array = np.array(embeddings)
            weights = np.array(durations)
            weights /= weights.sum()  # 正規化

            weighted_embedding = np.average(embeddings_array, axis=0, weights=weights)

            speaker_embeddings[speaker] = {
                "embedding": weighted_embedding.tolist(),
                "total_duration": sum(durations),
                "segment_count": len(segs),
            }

    return speaker_embeddings


def handle_chunk_input(event: dict[str, Any]) -> dict[str, Any]:
    """
    チャンク入力形式を処理

    Args:
        event: Lambda イベント（chunk 形式）

    Returns:
        処理結果
    """
    bucket = event["bucket"]
    chunk = event["chunk"]

    chunk_index = chunk["chunk_index"]
    chunk_key = chunk["chunk_key"]
    offset = chunk["offset"]
    effective_start = chunk["effective_start"]
    effective_end = chunk["effective_end"]

    local_audio = "/tmp/chunk.wav"

    try:
        # S3 からチャンクをダウンロード
        logger.info(f"Downloading s3://{bucket}/{chunk_key}")
        s3.download_file(bucket, chunk_key, local_audio)

        # soundfile で音声を読み込み
        logger.info("Loading audio with soundfile...")
        waveform, sample_rate = sf.read(local_audio, dtype="float32")

        if waveform.ndim == 1:
            waveform = waveform.reshape(1, -1)
        else:
            waveform = waveform.mean(axis=1).reshape(1, -1)

        audio_tensor = torch.from_numpy(waveform)

        # 話者分離を実行
        logger.info("Running speaker diarization...")
        pipeline = get_pipeline()
        diarization = pipeline({"waveform": audio_tensor, "sample_rate": sample_rate})

        # セグメントを抽出
        segments = []
        speakers = set()

        for turn, _, speaker in diarization.itertracks(yield_label=True):
            segments.append({
                "local_start": turn.start,
                "local_end": turn.end,
                "local_speaker": speaker,
            })
            speakers.add(speaker)

        logger.info(f"Found {len(speakers)} speakers, {len(segments)} segments")

        # 話者埋め込みを抽出（セグメントがある場合のみ）
        speaker_embeddings = {}
        if segments:
            logger.info("Extracting speaker embeddings...")
            speaker_embeddings = extract_speaker_embeddings(local_audio, segments)

        # 詳細結果を S3 に保存（256KB 制限対策）
        output_bucket = OUTPUT_BUCKET if OUTPUT_BUCKET else bucket
        base_name = os.path.splitext(os.path.basename(chunk_key))[0]
        result_key = f"diarization/{base_name}_result.json"

        detailed_result = {
            "chunk_index": chunk_index,
            "offset": offset,
            "effective_start": effective_start,
            "effective_end": effective_end,
            "segments": segments,
            "speakers": speaker_embeddings,
            "speaker_count": len(speakers),
        }

        s3.put_object(
            Bucket=output_bucket,
            Key=result_key,
            Body=json.dumps(detailed_result, ensure_ascii=False),
            ContentType="application/json",
        )
        logger.info(f"Saved detailed result to s3://{output_bucket}/{result_key}")

        # Step Functions には軽量なレスポンスのみ返す
        return {
            "chunk_index": chunk_index,
            "result_key": result_key,
            "speaker_count": len(speakers),
        }

    finally:
        if os.path.exists(local_audio):
            os.remove(local_audio)


def handle_legacy_input(event: dict[str, Any]) -> dict[str, Any]:
    """
    旧形式（audio_key）入力を処理

    Args:
        event: Lambda イベント（旧形式）

    Returns:
        処理結果
    """
    bucket = event["bucket"]
    audio_key = event["audio_key"]

    local_audio = "/tmp/audio.wav"

    try:
        # S3 から音声をダウンロード
        logger.info(f"Downloading s3://{bucket}/{audio_key}")
        s3.download_file(bucket, audio_key, local_audio)

        # soundfile で音声を読み込み（torchcodec をバイパス）
        logger.info("Loading audio with soundfile...")
        waveform, sample_rate = sf.read(local_audio, dtype="float32")
        # (samples,) -> (1, samples) の形式に変換
        if waveform.ndim == 1:
            waveform = waveform.reshape(1, -1)
        else:
            # ステレオの場合はモノラルに変換
            waveform = waveform.mean(axis=1).reshape(1, -1)
        audio_tensor = torch.from_numpy(waveform)

        # 話者分離を実行（waveform 辞書形式で渡す）
        logger.info("Running speaker diarization...")
        pipeline = get_pipeline()
        diarization = pipeline({"waveform": audio_tensor, "sample_rate": sample_rate})

        # セグメントを抽出
        segments = []
        speakers = set()
        for turn, _, speaker in diarization.itertracks(yield_label=True):
            segments.append(
                {
                    "start": turn.start,
                    "end": turn.end,
                    "speaker": speaker,
                }
            )
            speakers.add(speaker)

        logger.info(f"Found {len(speakers)} speakers, {len(segments)} segments")

        # 出力キーを生成
        base_key = audio_key.rsplit(".", 1)[0] if "." in audio_key else audio_key
        segments_key = f"{base_key}_segments.json"

        # 出力バケットを決定
        output_bucket = OUTPUT_BUCKET if OUTPUT_BUCKET else bucket

        # JSON としてアップロード
        logger.info(f"Uploading segments to s3://{output_bucket}/{segments_key}")
        s3.put_object(
            Bucket=output_bucket,
            Key=segments_key,
            Body=json.dumps(segments, ensure_ascii=False),
            ContentType="application/json",
        )

        return {
            "bucket": output_bucket,
            "audio_key": audio_key,
            "segments_key": segments_key,
            "speaker_count": len(speakers),
        }

    finally:
        # 一時ファイルをクリーンアップ
        if os.path.exists(local_audio):
            os.remove(local_audio)


def lambda_handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    """
    Lambda ハンドラー

    チャンク入力形式と旧形式（audio_key）の両方をサポート。

    Args:
        event: Lambda イベント
            チャンク形式:
            - bucket: S3 バケット名
            - chunk: チャンク情報
            旧形式:
            - bucket: S3 バケット名
            - audio_key: 音声ファイルのキー
        context: Lambda コンテキスト

    Returns:
        チャンク形式: 軽量なレスポンス（詳細は S3 に保存）
        旧形式: セグメント情報
    """
    logger.info(f"Event: {event}")

    # 入力形式を判定
    if "chunk" in event:
        return handle_chunk_input(event)
    elif "audio_key" in event:
        return handle_legacy_input(event)
    else:
        raise KeyError("Either 'chunk' or 'audio_key' must be provided")
