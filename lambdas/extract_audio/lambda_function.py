"""
ExtractAudio Lambda Function

動画ファイルから音声を抽出し、16kHz モノラル WAV に変換する。

Version: 2.0 - Python 3.12 compatible
"""

import logging
import os
import subprocess
from typing import Any

import boto3

from progress import update_progress

# ロガー設定
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# S3 クライアント
s3 = boto3.client("s3")

# 環境変数
OUTPUT_BUCKET = os.environ.get("OUTPUT_BUCKET", "")
SAMPLE_RATE = 16000
CHANNELS = 1


def extract_audio(input_path: str, output_path: str) -> None:
    """
    動画ファイルから音声を抽出

    Args:
        input_path: 入力動画ファイルのパス
        output_path: 出力音声ファイルのパス

    Raises:
        FileNotFoundError: 入力ファイルが存在しない場合
        RuntimeError: ffmpeg 処理でエラーが発生した場合
    """
    if not os.path.exists(input_path):
        raise FileNotFoundError(f"Input file not found: {input_path}")

    logger.info(f"Extracting audio from {input_path} to {output_path}")

    cmd = [
        "ffmpeg",
        "-i", input_path,
        "-ac", str(CHANNELS),       # モノラル
        "-ar", str(SAMPLE_RATE),    # 16kHz
        "-acodec", "pcm_s16le",     # 16-bit PCM
        "-y",                        # 上書き
        output_path,
    ]

    result = subprocess.run(cmd, capture_output=True, text=True)

    if result.returncode != 0:
        logger.error(f"ffmpeg error: {result.stderr}")
        raise RuntimeError(f"ffmpeg error: {result.stderr}")

    logger.info(f"Audio extraction completed: {output_path}")


def lambda_handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    """
    Lambda ハンドラー

    Args:
        event: Lambda イベント
            - bucket: S3 バケット名
            - key or video_key: S3 オブジェクトキー（動画ファイル）
            - interview_id: インタビューID（進捗追跡用）
        context: Lambda コンテキスト

    Returns:
        処理結果
            - bucket: 出力バケット名
            - audio_key: 出力音声ファイルのキー
            - original_key: 元の動画ファイルのキー
    """
    logger.info(f"Event: {event}")

    # 進捗更新
    interview_id = event.get("interview_id")
    if interview_id:
        update_progress(interview_id, "extracting_audio")

    # イベントからパラメータを取得
    bucket = event["bucket"]
    key = event.get("key") or event.get("video_key")
    if not key:
        raise ValueError("Either 'key' or 'video_key' is required")

    # ローカルパス
    local_video = "/tmp/input.mp4"
    local_audio = "/tmp/audio.wav"

    try:
        # S3 から動画をダウンロード
        logger.info(f"Downloading s3://{bucket}/{key}")
        s3.download_file(bucket, key, local_video)

        # 音声抽出
        extract_audio(local_video, local_audio)

        # 出力キーを生成（拡張子を .wav に変更）
        base_key = key.rsplit(".", 1)[0] if "." in key else key
        audio_key = f"processed/{base_key}.wav"

        # 出力バケットを決定
        output_bucket = OUTPUT_BUCKET if OUTPUT_BUCKET else bucket

        # S3 にアップロード
        logger.info(f"Uploading to s3://{output_bucket}/{audio_key}")
        s3.upload_file(local_audio, output_bucket, audio_key)

        result = {
            "bucket": output_bucket,
            "audio_key": audio_key,
            "original_key": key,
        }
        # interview_id を次のステップに渡す
        if interview_id:
            result["interview_id"] = interview_id
        return result

    finally:
        # 一時ファイルをクリーンアップ
        for path in [local_video, local_audio]:
            if os.path.exists(path):
                os.remove(path)
