"""
AggregateResults Lambda Function

文字起こし結果を統合して1つのJSONファイルにまとめる。

Version: 3.0 - States.DataLimitExceeded対策
- S3から各結果ファイルを読み込んで統合
"""

import json
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
OUTPUT_BUCKET = os.environ.get("OUTPUT_BUCKET", "")


def lambda_handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    """
    Lambda ハンドラー

    Args:
        event: Lambda イベント
            - bucket: S3 バケット名
            - transcription_results: 文字起こし結果のメタデータリスト
                各要素: {result_key, speaker, start, end}
            - audio_key: 元の音声ファイルのキー
        context: Lambda コンテキスト

    Returns:
        処理結果
            - bucket: 出力バケット名
            - transcript_key: 統合された文字起こしファイルのキー
            - segment_count: 処理したセグメント数
    """
    logger.info(f"Event keys: {list(event.keys())}")

    bucket = event["bucket"]
    transcription_results = event["transcription_results"]
    audio_key = event.get("audio_key", "unknown")

    logger.info(f"Loading {len(transcription_results)} transcription results from S3")

    # S3から各結果ファイルを読み込み（States.DataLimitExceeded対策）
    full_results = []
    for i, result_meta in enumerate(transcription_results):
        result_key = result_meta["result_key"]
        result_bucket = result_meta.get("bucket", bucket)

        try:
            response = s3.get_object(Bucket=result_bucket, Key=result_key)
            result_data = json.loads(response["Body"].read().decode("utf-8"))
            full_results.append(result_data)

            if i % 100 == 0:
                logger.info(f"Loaded {i + 1}/{len(transcription_results)} results")

        except Exception as e:
            logger.error(f"Failed to load {result_key}: {e}")
            # メタデータから最低限の情報を復元
            full_results.append({
                "speaker": result_meta.get("speaker", "UNKNOWN"),
                "start": result_meta.get("start", 0),
                "end": result_meta.get("end", 0),
                "text": "[読み込みエラー]",
            })

    logger.info(f"Loaded all {len(full_results)} results")

    # 時系列でソート
    sorted_results = sorted(full_results, key=lambda x: x["start"])

    logger.info(f"Aggregating {len(sorted_results)} transcription results")

    # 出力キーを生成
    base_key = audio_key.rsplit("/", 1)[-1].rsplit(".", 1)[0]
    transcript_key = f"transcripts/{base_key}_transcript.json"

    # 出力バケットを決定
    output_bucket = OUTPUT_BUCKET if OUTPUT_BUCKET else bucket

    # JSON としてアップロード
    logger.info(f"Uploading to s3://{output_bucket}/{transcript_key}")
    s3.put_object(
        Bucket=output_bucket,
        Key=transcript_key,
        Body=json.dumps(sorted_results, ensure_ascii=False, indent=2),
        ContentType="application/json",
    )

    return {
        "bucket": output_bucket,
        "transcript_key": transcript_key,
        "segment_count": len(sorted_results),
    }
