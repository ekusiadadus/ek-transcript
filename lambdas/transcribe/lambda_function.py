"""
Transcribe Lambda Function

faster-whisper を使用して音声セグメントを文字起こしする。

Version: 2.0 - Python 3.12 compatible
"""

import logging
import os
from typing import Any

import boto3

# ロガー設定
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# S3 クライアント
s3 = boto3.client("s3")

# 環境変数
WHISPER_MODEL = os.environ.get("WHISPER_MODEL", "medium")
WHISPER_MODEL_DIR = os.environ.get("WHISPER_MODEL_DIR", "/opt/whisper-models")

# グローバル変数（コールドスタート対策）
_model = None


def get_model() -> Any:
    """Whisper モデルを取得（シングルトン）- プリダウンロード済みモデル使用"""
    global _model

    if _model is None:
        from faster_whisper import WhisperModel

        logger.info(f"Loading Whisper model: {WHISPER_MODEL} from {WHISPER_MODEL_DIR}")
        _model = WhisperModel(
            WHISPER_MODEL,
            device="cpu",
            compute_type="int8",
            download_root=WHISPER_MODEL_DIR,
        )
        logger.info("Model loaded from pre-downloaded cache")

    return _model


def lambda_handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    """
    Lambda ハンドラー

    Args:
        event: Lambda イベント
            - bucket: S3 バケット名
            - segment_file: セグメントファイル情報
                - key: S3 キー
                - speaker: 話者ID
                - start: 開始時刻
                - end: 終了時刻
        context: Lambda コンテキスト

    Returns:
        処理結果
            - speaker: 話者ID
            - start: 開始時刻
            - end: 終了時刻
            - text: 文字起こしテキスト
    """
    logger.info(f"Event: {event}")

    bucket = event["bucket"]
    segment_file = event["segment_file"]

    segment_key = segment_file["key"]
    speaker = segment_file["speaker"]
    start = segment_file["start"]
    end = segment_file["end"]

    local_path = "/tmp/segment.wav"

    try:
        # S3 から音声セグメントをダウンロード
        logger.info(f"Downloading s3://{bucket}/{segment_key}")
        s3.download_file(bucket, segment_key, local_path)

        # 文字起こし実行
        logger.info("Transcribing audio...")
        model = get_model()
        segments, info = model.transcribe(
            local_path,
            beam_size=5,
            language="ja",
        )

        # テキストを結合
        text = "".join([seg.text for seg in segments])
        logger.info(f"Transcription: {text[:100]}...")

        return {
            "speaker": speaker,
            "start": start,
            "end": end,
            "text": text,
        }

    finally:
        # 一時ファイルをクリーンアップ
        if os.path.exists(local_path):
            os.remove(local_path)
