"""
MergeSpeakers Lambda Function

複数チャンクの話者分離結果を統合する。
- S3 から各チャンクの詳細結果を読み込み
- 埋め込みベクトルのクラスタリングで話者を統一
- オーバーラップ区間を解決

Version: 1.0 - チャンク並列処理対応
"""

import json
import logging
import os
from typing import Any

import boto3
import numpy as np
from sklearn.cluster import AgglomerativeClustering
from sklearn.metrics.pairwise import cosine_similarity

from progress import update_progress

# ロガー設定
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# S3 クライアント
s3 = boto3.client("s3")

# 環境変数
OUTPUT_BUCKET = os.environ.get("OUTPUT_BUCKET", "")

# クラスタリングパラメータ（環境変数で上書き可能）
SIMILARITY_THRESHOLD = float(os.environ.get("SIMILARITY_THRESHOLD", "0.75"))


def load_chunk_results(bucket: str, result_keys: list[str]) -> list[dict]:
    """
    S3 から各チャンクの詳細結果を読み込み

    Args:
        bucket: S3 バケット名
        result_keys: 結果ファイルのキーリスト

    Returns:
        チャンク結果のリスト
    """
    results = []
    for key in result_keys:
        response = s3.get_object(Bucket=bucket, Key=key)
        data = json.loads(response["Body"].read().decode("utf-8"))
        results.append(data)
    return results


def cluster_speakers(
    chunk_results: list[dict],
) -> tuple[dict[str, str], int]:
    """
    全チャンクの話者埋め込みをクラスタリングして統一ラベルを生成

    Args:
        chunk_results: チャンク結果のリスト

    Returns:
        speaker_mapping: {chunk_idx_local_speaker: global_speaker}
        global_speaker_count: グローバル話者数
    """
    # 全埋め込みを収集
    all_embeddings = []
    embedding_ids = []  # (chunk_index, local_speaker)
    embedding_weights = []  # 重み（話者の総発話時間）

    for result in chunk_results:
        chunk_idx = result["chunk_index"]
        for local_speaker, speaker_data in result.get("speakers", {}).items():
            embedding = np.array(speaker_data["embedding"])
            all_embeddings.append(embedding)
            embedding_ids.append(f"chunk_{chunk_idx}_{local_speaker}")
            embedding_weights.append(speaker_data.get("total_duration", 1.0))

    if len(all_embeddings) == 0:
        logger.warning("No embeddings found")
        return {}, 0

    if len(all_embeddings) == 1:
        return {embedding_ids[0]: "SPEAKER_A"}, 1

    all_embeddings = np.array(all_embeddings)
    logger.info(f"Clustering {len(all_embeddings)} speaker embeddings")
    logger.info(f"Using similarity threshold: {SIMILARITY_THRESHOLD}")

    # コサイン類似度行列を計算
    similarity_matrix = cosine_similarity(all_embeddings)

    # 距離行列に変換 (1 - similarity)
    distance_matrix = 1 - similarity_matrix

    # Agglomerative Clustering
    clustering = AgglomerativeClustering(
        n_clusters=None,
        distance_threshold=1 - SIMILARITY_THRESHOLD,
        metric="precomputed",
        linkage="average",
    )
    labels = clustering.fit_predict(distance_matrix)

    # クラスタラベルを SPEAKER_A, SPEAKER_B, ... に変換
    unique_labels = sorted(set(labels))
    label_to_speaker = {
        label: f"SPEAKER_{chr(65 + i)}"  # A, B, C, ...
        for i, label in enumerate(unique_labels)
    }

    # マッピングを作成
    speaker_mapping = {
        emb_id: label_to_speaker[label]
        for emb_id, label in zip(embedding_ids, labels)
    }

    logger.info(f"Clustered into {len(unique_labels)} global speakers")
    for emb_id, global_speaker in speaker_mapping.items():
        logger.info(f"  {emb_id} -> {global_speaker}")

    return speaker_mapping, len(unique_labels)


def resolve_overlaps(
    all_segments: list[dict],
) -> list[dict]:
    """
    オーバーラップ区間の重複を解決

    戦略: effective_start/end の範囲内のセグメントのみを採用

    Args:
        all_segments: 全セグメント（effective_start/end 情報付き）

    Returns:
        解決済みセグメントのリスト
    """
    resolved = []

    for seg in all_segments:
        seg_start = seg["global_start"]
        seg_end = seg["global_end"]
        effective_start = seg["effective_start"]
        effective_end = seg["effective_end"]

        # セグメントが有効範囲と重なる部分を計算
        actual_start = max(seg_start, effective_start)
        actual_end = min(seg_end, effective_end)

        if actual_start < actual_end:
            resolved.append({
                "start": actual_start,
                "end": actual_end,
                "speaker": seg["speaker"],
            })

    # 時刻順にソート
    resolved.sort(key=lambda x: x["start"])

    # 連続する同一話者セグメントを結合
    merged = []
    for seg in resolved:
        if merged and merged[-1]["speaker"] == seg["speaker"]:
            # 前のセグメントと近接している場合は結合（0.5秒以内）
            if seg["start"] - merged[-1]["end"] < 0.5:
                merged[-1]["end"] = seg["end"]
                continue
        merged.append(seg.copy())

    return merged


def lambda_handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    """
    Lambda ハンドラー

    Args:
        event: Lambda イベント
            - bucket: S3 バケット名
            - audio_key: 元の音声ファイルのキー
            - chunk_results: 各チャンクの軽量結果配列（result_key を含む）
            - chunk_config: チャンク設定
        context: Lambda コンテキスト

    Returns:
        統合された話者分離結果
            - bucket: 出力バケット名
            - audio_key: 元の音声ファイルのキー
            - segments_key: セグメント情報の S3 キー
            - segments: セグメントリスト
            - speaker_mapping: 話者マッピング
            - global_speaker_count: グローバル話者数
    """
    logger.info(f"Event keys: {event.keys()}")

    # 進捗更新
    interview_id = event.get("interview_id")
    if interview_id:
        update_progress(interview_id, "merging_speakers")

    bucket = event["bucket"]
    audio_key = event["audio_key"]
    chunk_results_meta = event["chunk_results"]
    chunk_config = event.get("chunk_config", {})

    logger.info(f"Processing {len(chunk_results_meta)} chunk results")

    # S3 から詳細結果を読み込み
    result_keys = [r["result_key"] for r in chunk_results_meta]
    chunk_results = load_chunk_results(bucket, result_keys)

    # 空のチャンク（セグメントなし）をフィルタリング
    non_empty_chunks = [r for r in chunk_results if r.get("segments")]
    if not non_empty_chunks:
        logger.warning("All chunks are empty (no segments)")
        # Step Functionsにはメタデータのみ返す（ペイロード削減）
        result = {
            "bucket": bucket,
            "audio_key": audio_key,
            "segments_key": None,
            "global_speaker_count": 0,
        }
        if interview_id:
            result["interview_id"] = interview_id
        return result

    # 話者クラスタリング
    logger.info("Clustering speakers across chunks...")
    speaker_mapping, global_speaker_count = cluster_speakers(non_empty_chunks)

    # グローバルセグメントを構築
    all_segments = []

    for result in chunk_results:
        chunk_idx = result["chunk_index"]
        offset = result["offset"]
        effective_start = result["effective_start"]
        effective_end = result["effective_end"]

        for seg in result.get("segments", []):
            local_speaker = seg["local_speaker"]
            mapping_key = f"chunk_{chunk_idx}_{local_speaker}"
            global_speaker = speaker_mapping.get(mapping_key, f"UNKNOWN_{local_speaker}")

            all_segments.append({
                "global_start": seg["local_start"] + offset,
                "global_end": seg["local_end"] + offset,
                "speaker": global_speaker,
                "effective_start": effective_start,
                "effective_end": effective_end,
            })

    # オーバーラップ解決
    logger.info("Resolving overlaps...")
    final_segments = resolve_overlaps(all_segments)
    logger.info(f"Final segment count: {len(final_segments)}")

    # 出力バケットを決定
    output_bucket = OUTPUT_BUCKET if OUTPUT_BUCKET else bucket

    # セグメント情報を S3 に保存
    base_key = audio_key.rsplit(".", 1)[0] if "." in audio_key else audio_key
    segments_key = f"{base_key}_segments.json"

    s3.put_object(
        Bucket=output_bucket,
        Key=segments_key,
        Body=json.dumps(final_segments, ensure_ascii=False),
        ContentType="application/json",
    )

    # Step Functionsにはメタデータのみ返す（ペイロード削減）
    # segmentsとspeaker_mappingはS3に保存済み（States.DataLimitExceeded対策）
    result = {
        "bucket": output_bucket,
        "audio_key": audio_key,
        "segments_key": segments_key,
        "global_speaker_count": global_speaker_count,
    }
    # interview_id を次のステップに渡す
    if interview_id:
        result["interview_id"] = interview_id
    return result
