"""
SplitBySpeaker Lambda Function

話者分離結果に基づいて音声ファイルをセグメントに分割する。
subprocess で ffmpeg を直接呼び出し（外部ライブラリ依存なし）
"""

import json
import logging
import os
import subprocess
from typing import Any

import boto3

# ロガー設定
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# S3 クライアント
s3 = boto3.client("s3")

# 環境変数
OUTPUT_BUCKET = os.environ.get("OUTPUT_BUCKET", "")


def split_audio(
    input_path: str, output_path: str, start_sec: float, duration_sec: float
) -> None:
    """
    音声ファイルから指定区間を切り出す

    Args:
        input_path: 入力音声ファイルのパス
        output_path: 出力音声ファイルのパス
        start_sec: 開始時間（秒）
        duration_sec: 長さ（秒）

    Raises:
        FileNotFoundError: 入力ファイルが存在しない場合
        RuntimeError: ffmpeg 処理でエラーが発生した場合
    """
    if not os.path.exists(input_path):
        raise FileNotFoundError(f"Input file not found: {input_path}")

    cmd = [
        "ffmpeg",
        "-ss", str(start_sec),
        "-t", str(duration_sec),
        "-i", input_path,
        "-acodec", "pcm_s16le",
        "-ar", "16000",
        "-ac", "1",
        "-y",
        output_path,
    ]

    result = subprocess.run(cmd, capture_output=True, text=True)

    if result.returncode != 0:
        logger.error(f"ffmpeg error: {result.stderr}")
        raise RuntimeError(f"ffmpeg error: {result.stderr}")


def lambda_handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    """
    Lambda ハンドラー

    Args:
        event: Lambda イベント
            - bucket: S3 バケット名
            - audio_key: 音声ファイルのキー
            - segments_key: セグメント情報のキー
        context: Lambda コンテキスト

    Returns:
        処理結果
            - bucket: 出力バケット名
            - segment_files: セグメントファイルのリスト
    """
    logger.info(f"Event: {event}")

    bucket = event["bucket"]
    audio_key = event["audio_key"]
    segments_key = event["segments_key"]

    local_audio = "/tmp/audio.wav"
    local_segment_prefix = "/tmp/seg_"

    try:
        # S3 から音声をダウンロード
        logger.info(f"Downloading s3://{bucket}/{audio_key}")
        s3.download_file(bucket, audio_key, local_audio)

        # セグメント情報を取得
        logger.info(f"Getting segments from s3://{bucket}/{segments_key}")
        response = s3.get_object(Bucket=bucket, Key=segments_key)
        segments = json.loads(response["Body"].read().decode("utf-8"))

        logger.info(f"Processing {len(segments)} segments")

        # 出力バケットを決定
        output_bucket = OUTPUT_BUCKET if OUTPUT_BUCKET else bucket

        # ベースキーを取得
        base_key = audio_key.rsplit("/", 1)[-1].rsplit(".", 1)[0]

        segment_files = []
        for i, seg in enumerate(segments):
            start_sec = seg["start"]
            end_sec = seg["end"]
            duration_sec = end_sec - start_sec
            speaker = seg["speaker"]

            # ローカルパスを生成
            local_path = f"{local_segment_prefix}{i:04d}.wav"

            # セグメントを切り出し
            split_audio(local_audio, local_path, start_sec, duration_sec)

            # S3 にアップロード
            segment_key = f"segments/{base_key}_{i:04d}_{speaker}.wav"
            s3.upload_file(local_path, output_bucket, segment_key)

            segment_files.append(
                {
                    "key": segment_key,
                    "speaker": speaker,
                    "start": seg["start"],
                    "end": seg["end"],
                }
            )

            # ローカルファイルを削除
            if os.path.exists(local_path):
                os.remove(local_path)

        logger.info(f"Created {len(segment_files)} segment files")

        return {
            "bucket": output_bucket,
            "segment_files": segment_files,
        }

    finally:
        # 一時ファイルをクリーンアップ
        if os.path.exists(local_audio):
            os.remove(local_audio)
