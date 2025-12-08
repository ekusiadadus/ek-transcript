"""
AggregateResults Lambda Function

文字起こし結果を統合して1つのJSONファイルにまとめる。

Version: 4.0 - States.DataLimitExceeded対策（完全版）
- segment_files_keyからセグメント情報を取得
- 各セグメントに対応するtranscribe_resultsをS3から読み込み
- Map stateの結果は使用しない（256KB制限対策）
"""

import json
import logging
import os
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


def lambda_handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    """
    Lambda ハンドラー

    Args:
        event: Lambda イベント
            - bucket: S3 バケット名
            - segment_files_key: セグメントファイル情報のS3キー
            - audio_key: 元の音声ファイルのキー
        context: Lambda コンテキスト

    Returns:
        処理結果
            - bucket: 出力バケット名
            - transcript_key: 統合された文字起こしファイルのキー
            - segment_count: 処理したセグメント数
    """
    logger.info(f"Event keys: {list(event.keys())}")

    # 進捗更新
    interview_id = event.get("interview_id")
    if interview_id:
        update_progress(interview_id, "aggregating_results")

    bucket = event["bucket"]
    segment_files_key = event["segment_files_key"]
    audio_key = event.get("audio_key", "unknown")

    # S3からsegment_filesを読み込み
    logger.info(f"Loading segment_files from s3://{bucket}/{segment_files_key}")
    response = s3.get_object(Bucket=bucket, Key=segment_files_key)
    segment_files = json.loads(response["Body"].read().decode("utf-8"))

    logger.info(f"Loading {len(segment_files)} transcription results from S3")

    # 各セグメントに対応するtranscribe_resultsを読み込み
    full_results = []
    for i, segment_file in enumerate(segment_files):
        # セグメントキーからtranscribe_resultキーを生成
        # segments/xxx_0000_SPEAKER_00.wav -> transcribe_results/xxx_0000_SPEAKER_00.json
        segment_key = segment_file["key"]
        segment_name = segment_key.rsplit("/", 1)[-1].rsplit(".", 1)[0]
        result_key = f"transcribe_results/{segment_name}.json"

        try:
            response = s3.get_object(Bucket=bucket, Key=result_key)
            result_data = json.loads(response["Body"].read().decode("utf-8"))
            full_results.append(result_data)

            if i % 100 == 0:
                logger.info(f"Loaded {i + 1}/{len(segment_files)} results")

        except Exception as e:
            logger.error(f"Failed to load {result_key}: {e}")
            # segment_fileから最低限の情報を復元
            full_results.append({
                "speaker": segment_file.get("speaker", "UNKNOWN"),
                "start": segment_file.get("start", 0),
                "end": segment_file.get("end", 0),
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

    result = {
        "bucket": output_bucket,
        "transcript_key": transcript_key,
        "segment_count": len(sorted_results),
    }
    # interview_id を次のステップに渡す
    if interview_id:
        result["interview_id"] = interview_id
    return result
