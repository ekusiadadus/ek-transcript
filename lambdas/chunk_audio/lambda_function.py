"""
ChunkAudio Lambda Function

音声ファイルをオーバーラップ付きチャンクに分割する。

チャンク設計:
- step = chunk_duration - overlap_duration (450秒)
- 各チャンクは chunk_duration + overlap_duration の長さ (510秒)
- effective_start/end は非オーバーラップ区間を示す

Version: 1.0 - チャンク並列処理対応
"""

import json
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

# 設定（環境変数で上書き可能）
CHUNK_DURATION = int(os.environ.get("CHUNK_DURATION", "480"))  # 8分
OVERLAP_DURATION = int(os.environ.get("OVERLAP_DURATION", "30"))  # 30秒
MIN_CHUNK_DURATION = int(os.environ.get("MIN_CHUNK_DURATION", "60"))  # 1分
OUTPUT_BUCKET = os.environ.get("OUTPUT_BUCKET", "")


def get_audio_duration(audio_path: str) -> float:
    """
    ffprobe で音声の長さを取得

    Args:
        audio_path: 音声ファイルのパス

    Returns:
        音声の長さ（秒）
    """
    result = subprocess.run(
        [
            "ffprobe",
            "-v", "quiet",
            "-show_entries", "format=duration",
            "-of", "json",
            audio_path,
        ],
        capture_output=True,
        text=True,
    )
    data = json.loads(result.stdout)
    return float(data["format"]["duration"])


def split_audio_to_chunks(
    audio_path: str,
    output_dir: str,
    base_name: str,
    chunk_duration: int,
    overlap_duration: int,
) -> list[dict[str, Any]]:
    """
    音声をオーバーラップ付きチャンクに分割

    チャンク構成例 (chunk_duration=480, overlap_duration=30):
    - chunk_0: 0〜510秒 (effective: 0〜480)
    - chunk_1: 450〜960秒 (effective: 480〜960)
    - chunk_2: 900〜1410秒 (effective: 960〜1440)

    Args:
        audio_path: 入力音声ファイルのパス
        output_dir: 出力ディレクトリ
        base_name: ファイル名のベース
        chunk_duration: チャンクの基本長（秒）
        overlap_duration: オーバーラップ長（秒）

    Returns:
        チャンク情報のリスト
    """
    total_duration = get_audio_duration(audio_path)
    chunks = []

    # ステップ = chunk_duration - overlap_duration
    # これにより、overlap_duration 分だけ重複する
    step = chunk_duration - overlap_duration

    chunk_index = 0
    current_pos = 0.0

    while current_pos < total_duration:
        # チャンクの開始・終了位置
        chunk_start = current_pos
        chunk_end = min(chunk_start + chunk_duration + overlap_duration, total_duration)
        chunk_actual_duration = chunk_end - chunk_start

        # 最後のチャンクが短すぎる場合の処理
        remaining = total_duration - chunk_start
        if remaining < MIN_CHUNK_DURATION and chunk_index > 0:
            # 前のチャンクの effective_end を延長して終了
            if chunks:
                chunks[-1]["effective_end"] = total_duration
            break

        output_path = os.path.join(output_dir, f"{base_name}_chunk_{chunk_index:02d}.wav")

        # ffmpeg でチャンク抽出
        subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-i", audio_path,
                "-ss", str(chunk_start),
                "-t", str(chunk_actual_duration),
                "-ar", "16000",
                "-ac", "1",
                output_path,
            ],
            capture_output=True,
            check=True,
        )

        # effective_end は次のチャンクの開始位置（または音声の終端）
        effective_end = min(chunk_start + chunk_duration, total_duration)

        chunks.append({
            "chunk_index": chunk_index,
            "local_path": output_path,
            "offset": chunk_start,
            "duration": chunk_actual_duration,
            "effective_start": chunk_start,
            "effective_end": effective_end,
        })

        logger.info(
            f"Chunk {chunk_index}: {chunk_start:.1f}s - {chunk_end:.1f}s "
            f"(effective: {chunk_start:.1f}s - {effective_end:.1f}s)"
        )

        current_pos += step
        chunk_index += 1

    return chunks


def lambda_handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    """
    Lambda ハンドラー

    Args:
        event: Lambda イベント
            - bucket: S3 バケット名
            - audio_key: 音声ファイルのキー
        context: Lambda コンテキスト

    Returns:
        チャンク情報
            - bucket: 出力バケット名
            - audio_key: 元の音声ファイルのキー
            - audio_duration: 音声長（秒）
            - chunks: チャンク情報配列
            - total_chunks: チャンク数
            - chunk_config: チャンク設定
    """
    logger.info(f"Event: {event}")

    # 進捗更新
    interview_id = event.get("interview_id")
    if interview_id:
        update_progress(interview_id, "chunking_audio")

    bucket = event["bucket"]
    audio_key = event["audio_key"]

    local_audio = "/tmp/audio.wav"
    chunk_dir = "/tmp/chunks"
    os.makedirs(chunk_dir, exist_ok=True)

    try:
        # S3 から音声をダウンロード
        logger.info(f"Downloading s3://{bucket}/{audio_key}")
        s3.download_file(bucket, audio_key, local_audio)

        # 音声長を取得
        audio_duration = get_audio_duration(local_audio)
        logger.info(f"Audio duration: {audio_duration:.2f} seconds ({audio_duration/60:.1f} min)")

        # ベース名を抽出
        base_name = os.path.splitext(os.path.basename(audio_key))[0]

        # チャンク分割
        logger.info(f"Splitting with chunk_duration={CHUNK_DURATION}s, overlap={OVERLAP_DURATION}s")
        chunks = split_audio_to_chunks(
            local_audio,
            chunk_dir,
            base_name,
            CHUNK_DURATION,
            OVERLAP_DURATION,
        )
        logger.info(f"Created {len(chunks)} chunks")

        # 出力バケットを決定
        output_bucket = OUTPUT_BUCKET if OUTPUT_BUCKET else bucket

        # 各チャンクを S3 にアップロード
        for chunk in chunks:
            chunk_key = f"chunks/{os.path.basename(chunk['local_path'])}"
            s3.upload_file(chunk["local_path"], output_bucket, chunk_key)
            chunk["chunk_key"] = chunk_key
            del chunk["local_path"]

        result = {
            "bucket": output_bucket,
            "audio_key": audio_key,
            "audio_duration": audio_duration,
            "chunks": chunks,
            "total_chunks": len(chunks),
            "chunk_config": {
                "chunk_duration": CHUNK_DURATION,
                "overlap_duration": OVERLAP_DURATION,
            },
        }
        # interview_id を次のステップに渡す
        if interview_id:
            result["interview_id"] = interview_id
        return result

    finally:
        # クリーンアップ
        if os.path.exists(local_audio):
            os.remove(local_audio)
        for f in os.listdir(chunk_dir):
            os.remove(os.path.join(chunk_dir, f))
