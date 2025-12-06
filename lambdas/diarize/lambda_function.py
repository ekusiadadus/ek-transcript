"""
Diarize Lambda Function

pyannote.audio を使用して話者分離を実行する。

Version: 2.0 - Python 3.12 compatible
"""

import json
import logging
import os
from typing import Any

import boto3
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

# グローバル変数（コールドスタート対策）
_pipeline = None


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
        from pyannote.audio.core.task import Specifications, Problem, Resolution
        from pyannote.audio.core.model import Introspection
        from pyannote.audio import Pipeline

        # PyTorch 2.6+ requires explicit safe_globals for pyannote models
        torch.serialization.add_safe_globals([Specifications, Problem, Resolution, Introspection])

        logger.info("Initializing pyannote pipeline from pre-downloaded model...")
        hf_token = get_hf_token()
        # モデルは /opt/huggingface にプリダウンロード済み
        _pipeline = Pipeline.from_pretrained(
            "pyannote/speaker-diarization-community-1",
            token=hf_token,
        )
        logger.info("Pipeline initialized")

    return _pipeline


def lambda_handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    """
    Lambda ハンドラー

    Args:
        event: Lambda イベント
            - bucket: S3 バケット名
            - audio_key: 音声ファイルのキー
        context: Lambda コンテキスト

    Returns:
        処理結果
            - bucket: 出力バケット名
            - audio_key: 音声ファイルのキー
            - segments_key: セグメント情報のキー
            - speaker_count: 検出された話者数
    """
    logger.info(f"Event: {event}")

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
