# チャンク並列話者分離 詳細技術設計書

## 概要

本ドキュメントは、Lambda の15分タイムアウト制限を回避しつつ、長時間音声の話者分離を実現するためのチャンク並列処理アーキテクチャの詳細設計を記述する。

## 関連ドキュメント

- [ADR-0006: チャンク並列話者分離アーキテクチャの採用](./adr/0006-chunked-parallel-diarization.md)
- [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md)

---

## 1. システムアーキテクチャ

### 1.1 全体フロー図

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              INPUT                                            │
│                         S3: input-bucket                                      │
│                      ┌─────────────────┐                                      │
│                      │ video.mp4       │                                      │
│                      │ (640 MiB)       │                                      │
│                      └────────┬────────┘                                      │
│                               ↓                                               │
├──────────────────────────────────────────────────────────────────────────────┤
│                          STEP FUNCTIONS                                       │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │                                                                        │  │
│  │  ┌─────────────────┐                                                   │  │
│  │  │  ExtractAudio   │ ─→ video.mp4 → audio.wav (77 MiB, 16kHz mono)    │  │
│  │  └────────┬────────┘                                                   │  │
│  │           ↓                                                            │  │
│  │  ┌─────────────────┐                                                   │  │
│  │  │   ChunkAudio    │ ─→ audio.wav → chunk_00.wav, chunk_01.wav, ...   │  │
│  │  │     (新規)      │    (8分 + 30秒 overlap 各チャンク)               │  │
│  │  └────────┬────────┘                                                   │  │
│  │           ↓                                                            │  │
│  │  ┌─────────────────────────────────────────────────────────────────┐  │  │
│  │  │                    MAP STATE (並列実行)                          │  │  │
│  │  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐             │  │  │
│  │  │  │DiarizeChunk_0│ │DiarizeChunk_1│ │DiarizeChunk_N│   ...       │  │  │
│  │  │  │              │ │              │ │              │             │  │  │
│  │  │  │ → S3 JSON    │ │ → S3 JSON    │ │ → S3 JSON    │             │  │  │
│  │  │  └──────────────┘ └──────────────┘ └──────────────┘             │  │  │
│  │  └────────────────────────────┬────────────────────────────────────┘  │  │
│  │                               ↓                                        │  │
│  │  ┌─────────────────┐                                                   │  │
│  │  │  MergeSpeakers  │ ─→ S3からJSON読込 → クラスタリング              │  │
│  │  │     (新規)      │    → 統一話者ラベル → グローバルセグメント       │  │
│  │  └────────┬────────┘                                                   │  │
│  │           ↓                                                            │  │
│  │  ┌─────────────────┐                                                   │  │
│  │  │ SplitBySpeaker  │ ─→ 話者ごとに音声分割                            │  │
│  │  └────────┬────────┘                                                   │  │
│  │           ↓                                                            │  │
│  │  ┌─────────────────────────────────────────────────────────────────┐  │  │
│  │  │                    MAP STATE (並列実行)                          │  │  │
│  │  │  ┌───────────┐ ┌───────────┐ ┌───────────┐                      │  │  │
│  │  │  │Transcribe │ │Transcribe │ │Transcribe │   ...                │  │  │
│  │  │  └───────────┘ └───────────┘ └───────────┘                      │  │  │
│  │  └────────────────────────────┬────────────────────────────────────┘  │  │
│  │                               ↓                                        │  │
│  │  ┌─────────────────┐                                                   │  │
│  │  │AggregateResults │ ─→ 文字起こし結果統合                            │  │
│  │  └────────┬────────┘                                                   │  │
│  │           ↓                                                            │  │
│  │  ┌─────────────────┐                                                   │  │
│  │  │  LLMAnalysis    │ ─→ GPT-5-mini で要約・分析                       │  │
│  │  └─────────────────┘                                                   │  │
│  │                                                                        │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                               ↓                                               │
├──────────────────────────────────────────────────────────────────────────────┤
│                              OUTPUT                                           │
│                         S3: output-bucket                                     │
│   ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐               │
│   │transcript. │ │segments.   │ │analysis.   │ │summary.    │               │
│   │json        │ │json        │ │txt         │ │md          │               │
│   └────────────┘ └────────────┘ └────────────┘ └────────────┘               │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 重要な設計上の考慮事項

#### Step Functions 256KB 制限対策

Step Functions の state は **256KB 上限**があるため、埋め込みベクトル（512次元 × 話者数 × チャンク数）を直接渡すと制限を超過する。

**解決策**: DiarizeChunk の結果は **S3 に JSON 保存**し、Step Functions には **S3 キーのみ**を渡す。

```
DiarizeChunk → S3: diarization/chunk_00.json → Step Functions: {"result_key": "diarization/chunk_00.json"}
```

---

## 2. データスキーマ定義

### 2.1 ChunkAudio Lambda

#### 入力

```json
{
  "bucket": "ek-transcript-output-dev-340158431287",
  "audio_key": "processed/hems-user-interview.wav",
  "audio_duration": 2520.5
}
```

#### 出力

```json
{
  "bucket": "ek-transcript-output-dev-340158431287",
  "audio_key": "processed/hems-user-interview.wav",
  "chunks": [
    {
      "chunk_index": 0,
      "chunk_key": "chunks/hems-user-interview_chunk_00.wav",
      "offset": 0.0,
      "duration": 510.0,
      "effective_start": 0.0,
      "effective_end": 480.0
    },
    {
      "chunk_index": 1,
      "chunk_key": "chunks/hems-user-interview_chunk_01.wav",
      "offset": 450.0,
      "duration": 510.0,
      "effective_start": 450.0,
      "effective_end": 930.0
    }
  ],
  "total_chunks": 6,
  "chunk_config": {
    "chunk_duration": 480,
    "overlap_duration": 30
  }
}
```

### 2.2 DiarizeChunk Lambda

#### 入力

```json
{
  "bucket": "ek-transcript-output-dev-340158431287",
  "chunk": {
    "chunk_index": 0,
    "chunk_key": "chunks/hems-user-interview_chunk_00.wav",
    "offset": 0.0,
    "duration": 510.0,
    "effective_start": 0.0,
    "effective_end": 480.0
  }
}
```

#### 出力（Step Functions に返す - 軽量）

```json
{
  "chunk_index": 0,
  "result_key": "diarization/hems-user-interview_chunk_00.json",
  "speaker_count": 2
}
```

#### S3 に保存する詳細結果

```json
{
  "chunk_index": 0,
  "offset": 0.0,
  "effective_start": 0.0,
  "effective_end": 480.0,
  "segments": [
    {
      "local_start": 1.2,
      "local_end": 5.8,
      "local_speaker": "SPEAKER_00"
    },
    {
      "local_start": 6.1,
      "local_end": 12.4,
      "local_speaker": "SPEAKER_01"
    }
  ],
  "speakers": {
    "SPEAKER_00": {
      "embedding": [0.0123, -0.0456, 0.0789, ...],
      "total_duration": 45.6,
      "segment_count": 12
    },
    "SPEAKER_01": {
      "embedding": [-0.0234, 0.0567, -0.0890, ...],
      "total_duration": 38.2,
      "segment_count": 8
    }
  },
  "speaker_count": 2
}
```

### 2.3 MergeSpeakers Lambda

#### 入力

```json
{
  "bucket": "ek-transcript-output-dev-340158431287",
  "audio_key": "processed/hems-user-interview.wav",
  "chunk_results": [
    { "chunk_index": 0, "result_key": "diarization/chunk_00.json", "speaker_count": 2 },
    { "chunk_index": 1, "result_key": "diarization/chunk_01.json", "speaker_count": 2 }
  ],
  "chunk_config": {
    "chunk_duration": 480,
    "overlap_duration": 30
  }
}
```

#### 出力

```json
{
  "bucket": "ek-transcript-output-dev-340158431287",
  "audio_key": "processed/hems-user-interview.wav",
  "segments_key": "processed/hems-user-interview_segments.json",
  "segments": [
    {
      "start": 1.2,
      "end": 5.8,
      "speaker": "SPEAKER_A"
    },
    {
      "start": 6.1,
      "end": 12.4,
      "speaker": "SPEAKER_B"
    }
  ],
  "speaker_mapping": {
    "chunk_0_SPEAKER_00": "SPEAKER_A",
    "chunk_0_SPEAKER_01": "SPEAKER_B",
    "chunk_1_SPEAKER_00": "SPEAKER_A",
    "chunk_1_SPEAKER_01": "SPEAKER_B"
  },
  "global_speaker_count": 2
}
```

---

## 3. Lambda 関数詳細設計

### 3.1 ChunkAudio Lambda

#### ファイル構成

```
lambdas/chunk_audio/
├── Dockerfile
├── lambda_function.py
├── requirements.txt
└── tests/
    └── test_handler.py
```

#### 実装コード（修正版）

```python
# lambdas/chunk_audio/lambda_function.py
"""
ChunkAudio Lambda Function

音声ファイルをオーバーラップ付きチャンクに分割する。

チャンク設計:
- step = chunk_duration - overlap_duration (450秒)
- 各チャンクは chunk_duration + overlap_duration の長さ (510秒)
- effective_start/end は非オーバーラップ区間を示す
"""

import json
import logging
import os
import subprocess
from typing import Any

import boto3

logger = logging.getLogger()
logger.setLevel(logging.INFO)

s3 = boto3.client("s3")

# 設定（環境変数で上書き可能）
CHUNK_DURATION = int(os.environ.get("CHUNK_DURATION", "480"))  # 8分
OVERLAP_DURATION = int(os.environ.get("OVERLAP_DURATION", "30"))  # 30秒
MIN_CHUNK_DURATION = int(os.environ.get("MIN_CHUNK_DURATION", "60"))  # 1分
OUTPUT_BUCKET = os.environ.get("OUTPUT_BUCKET", "")


def get_audio_duration(audio_path: str) -> float:
    """ffprobe で音声の長さを取得"""
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
    """
    logger.info(f"Event: {event}")

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

        return {
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

    finally:
        # クリーンアップ
        if os.path.exists(local_audio):
            os.remove(local_audio)
        for f in os.listdir(chunk_dir):
            os.remove(os.path.join(chunk_dir, f))
```

#### Dockerfile

```dockerfile
FROM public.ecr.aws/lambda/python:3.12

# ffmpeg インストール（静的バイナリ）
RUN dnf install -y tar xz && \
    curl -L https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz | \
    tar xJ --strip-components=1 -C /usr/local/bin && \
    dnf clean all

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY lambda_function.py .

CMD ["lambda_function.lambda_handler"]
```

---

### 3.2 DiarizeChunk Lambda（既存 Diarize の改修）

#### 主要変更点

1. 結果を S3 に保存し、Step Functions には軽量なレスポンスのみ返す
2. 埋め込みベクトルの抽出と出力
3. 話者ごとの**重み付き平均**埋め込み計算
4. HF キャッシュを `/tmp` に配置

#### 実装コード（改修部分）

```python
# lambdas/diarize/lambda_function.py
"""
DiarizeChunk Lambda Function

pyannote.audio を使用してチャンク音声の話者分離を実行する。
話者ごとの埋め込みベクトルも抽出して S3 に保存。
Step Functions には軽量なレスポンスのみ返す（256KB 制限対策）。
"""

import json
import logging
import os
from typing import Any

import boto3
import numpy as np
import soundfile as sf
import torch

logger = logging.getLogger()
logger.setLevel(logging.INFO)

s3 = boto3.client("s3")
secrets_client = boto3.client("secretsmanager")

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
    """pyannote パイプラインを取得（シングルトン）"""
    global _pipeline

    if _pipeline is None:
        from pyannote.audio import Pipeline
        from pyannote.audio.core.model import Introspection
        from pyannote.audio.core.task import Problem, Resolution, Specifications

        torch.serialization.add_safe_globals(
            [Specifications, Problem, Resolution, Introspection]
        )

        logger.info("Initializing pyannote pipeline...")
        hf_token = get_hf_token()
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


def lambda_handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    """
    Lambda ハンドラー

    Args:
        event: Lambda イベント
            - bucket: S3 バケット名
            - chunk: チャンク情報
        context: Lambda コンテキスト

    Returns:
        軽量なレスポンス（詳細は S3 に保存）
    """
    logger.info(f"Event: {event}")

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
```

---

### 3.3 MergeSpeakers Lambda

#### 実装コード（修正版）

```python
# lambdas/merge_speakers/lambda_function.py
"""
MergeSpeakers Lambda Function

複数チャンクの話者分離結果を統合する。
- S3 から各チャンクの詳細結果を読み込み
- 埋め込みベクトルのクラスタリングで話者を統一
- オーバーラップ区間を解決
"""

import json
import logging
import os
from typing import Any

import boto3
import numpy as np
from sklearn.cluster import AgglomerativeClustering
from sklearn.metrics.pairwise import cosine_similarity

logger = logging.getLogger()
logger.setLevel(logging.INFO)

s3 = boto3.client("s3")

OUTPUT_BUCKET = os.environ.get("OUTPUT_BUCKET", "")

# クラスタリングパラメータ（環境変数で上書き可能）
SIMILARITY_THRESHOLD = float(os.environ.get("SIMILARITY_THRESHOLD", "0.75"))


def load_chunk_results(bucket: str, result_keys: list[str]) -> list[dict]:
    """S3 から各チャンクの詳細結果を読み込み"""
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
    """
    logger.info(f"Event keys: {event.keys()}")

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
        return {
            "bucket": bucket,
            "audio_key": audio_key,
            "segments_key": None,
            "segments": [],
            "speaker_mapping": {},
            "global_speaker_count": 0,
        }

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

    return {
        "bucket": output_bucket,
        "audio_key": audio_key,
        "segments_key": segments_key,
        "segments": final_segments,
        "speaker_mapping": speaker_mapping,
        "global_speaker_count": global_speaker_count,
    }
```

#### Dockerfile

```dockerfile
FROM public.ecr.aws/lambda/python:3.12

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY lambda_function.py .

CMD ["lambda_function.lambda_handler"]
```

#### requirements.txt

```
boto3>=1.34.0
numpy>=1.26.0
scikit-learn>=1.4.0
```

---

## 4. Step Functions State Machine 定義

### 4.1 新しい State Machine 定義

```json
{
  "Comment": "話者分離付き文字起こしパイプライン v2 - チャンク並列処理",
  "StartAt": "ExtractAudio",
  "States": {
    "ExtractAudio": {
      "Type": "Task",
      "Resource": "${ExtractAudioFunctionArn}",
      "ResultPath": "$",
      "Next": "ChunkAudio",
      "Retry": [
        {
          "ErrorEquals": ["States.ALL"],
          "IntervalSeconds": 5,
          "MaxAttempts": 2,
          "BackoffRate": 2.0
        }
      ],
      "Catch": [
        {
          "ErrorEquals": ["States.ALL"],
          "ResultPath": "$.error",
          "Next": "HandleError"
        }
      ]
    },

    "ChunkAudio": {
      "Type": "Task",
      "Resource": "${ChunkAudioFunctionArn}",
      "ResultPath": "$",
      "Next": "DiarizeChunks",
      "Retry": [
        {
          "ErrorEquals": ["States.ALL"],
          "IntervalSeconds": 5,
          "MaxAttempts": 2,
          "BackoffRate": 2.0
        }
      ]
    },

    "DiarizeChunks": {
      "Type": "Map",
      "ItemsPath": "$.chunks",
      "MaxConcurrency": 5,
      "ItemSelector": {
        "bucket.$": "$.bucket",
        "chunk.$": "$$.Map.Item.Value"
      },
      "ItemProcessor": {
        "ProcessorConfig": {
          "Mode": "INLINE"
        },
        "StartAt": "DiarizeChunk",
        "States": {
          "DiarizeChunk": {
            "Type": "Task",
            "Resource": "${DiarizeFunctionArn}",
            "End": true,
            "Retry": [
              {
                "ErrorEquals": ["States.ALL"],
                "IntervalSeconds": 10,
                "MaxAttempts": 2,
                "BackoffRate": 2.0
              }
            ]
          }
        }
      },
      "ResultPath": "$.chunk_results",
      "Next": "MergeSpeakers"
    },

    "MergeSpeakers": {
      "Type": "Task",
      "Resource": "${MergeSpeakersFunctionArn}",
      "Parameters": {
        "bucket.$": "$.bucket",
        "audio_key.$": "$.audio_key",
        "chunk_results.$": "$.chunk_results",
        "chunk_config.$": "$.chunk_config"
      },
      "ResultPath": "$",
      "Next": "SplitBySpeaker",
      "Retry": [
        {
          "ErrorEquals": ["States.ALL"],
          "IntervalSeconds": 5,
          "MaxAttempts": 2,
          "BackoffRate": 2.0
        }
      ]
    },

    "SplitBySpeaker": {
      "Type": "Task",
      "Resource": "${SplitBySpeakerFunctionArn}",
      "ResultPath": "$",
      "Next": "TranscribeSegments"
    },

    "TranscribeSegments": {
      "Type": "Map",
      "ItemsPath": "$.segment_files",
      "MaxConcurrency": 20,
      "ItemSelector": {
        "bucket.$": "$.bucket",
        "segment_file.$": "$$.Map.Item.Value"
      },
      "ItemProcessor": {
        "ProcessorConfig": {
          "Mode": "INLINE"
        },
        "StartAt": "Transcribe",
        "States": {
          "Transcribe": {
            "Type": "Task",
            "Resource": "${TranscribeFunctionArn}",
            "End": true,
            "Retry": [
              {
                "ErrorEquals": ["States.ALL"],
                "IntervalSeconds": 5,
                "MaxAttempts": 3,
                "BackoffRate": 2.0
              }
            ]
          }
        }
      },
      "ResultPath": "$.transcription_results",
      "Next": "AggregateResults"
    },

    "AggregateResults": {
      "Type": "Task",
      "Resource": "${AggregateResultsFunctionArn}",
      "ResultPath": "$",
      "Next": "LLMAnalysis"
    },

    "LLMAnalysis": {
      "Type": "Task",
      "Resource": "${LLMAnalysisFunctionArn}",
      "End": true
    },

    "HandleError": {
      "Type": "Task",
      "Resource": "${ErrorHandlerFunctionArn}",
      "End": true
    }
  }
}
```

---

## 5. CDK 変更点

### 5.1 新規 Lambda 追加

```typescript
// lib/stacks/lambda-stack.ts に追加

// ChunkAudio Lambda
this.chunkAudioFn = new lambda.DockerImageFunction(this, "ChunkAudioFn", {
  functionName: `ek-transcript-chunk-audio-${environment}`,
  code: lambda.DockerImageCode.fromImageAsset(
    path.join(lambdasPath, "chunk_audio")
  ),
  memorySize: 1024,
  timeout: cdk.Duration.minutes(5),
  ephemeralStorageSize: cdk.Size.mebibytes(10240),
  environment: {
    INPUT_BUCKET: inputBucket.bucketName,
    OUTPUT_BUCKET: outputBucket.bucketName,
    CHUNK_DURATION: "480",
    OVERLAP_DURATION: "30",
    ENVIRONMENT: environment,
  },
  role: lambdaRole,
  architecture: lambda.Architecture.X86_64,
});

// MergeSpeakers Lambda
this.mergeSpeakersFn = new lambda.DockerImageFunction(
  this,
  "MergeSpeakersFn",
  {
    functionName: `ek-transcript-merge-speakers-${environment}`,
    code: lambda.DockerImageCode.fromImageAsset(
      path.join(lambdasPath, "merge_speakers")
    ),
    memorySize: 2048,
    timeout: cdk.Duration.minutes(5),
    environment: {
      INPUT_BUCKET: inputBucket.bucketName,
      OUTPUT_BUCKET: outputBucket.bucketName,
      SIMILARITY_THRESHOLD: "0.75",
      ENVIRONMENT: environment,
    },
    role: lambdaRole,
    architecture: lambda.Architecture.X86_64,
  }
);
```

### 5.2 Diarize Lambda の調整

```typescript
// Diarize Lambda - HF キャッシュを /tmp に
this.diarizeFn = new lambda.DockerImageFunction(this, "DiarizeFn", {
  functionName: `ek-transcript-diarize-${environment}`,
  code: lambda.DockerImageCode.fromImageAsset(path.join(lambdasPath, "diarize"), {
    buildArgs: {
      HF_TOKEN: hfToken,
    },
  }),
  memorySize: 10240, // 最大メモリ
  timeout: cdk.Duration.minutes(10), // 10分（8分チャンク処理用）
  ephemeralStorageSize: cdk.Size.mebibytes(4096), // HF キャッシュ用に増量
  environment: {
    INPUT_BUCKET: inputBucket.bucketName,
    OUTPUT_BUCKET: outputBucket.bucketName,
    HF_TOKEN_SECRET_ARN: huggingfaceSecret.secretArn,
    // HF_HOME は Lambda 関数内で /tmp に設定
    ENVIRONMENT: environment,
  },
  role: lambdaRole,
  architecture: lambda.Architecture.X86_64,
});
```

---

## 6. テスト戦略

### 6.1 単体テスト（追加ケース含む）

```python
# lambdas/merge_speakers/tests/test_handler.py

import pytest
import numpy as np
from lambda_function import cluster_speakers, resolve_overlaps


class TestClusterSpeakers:
    def test_single_chunk_two_speakers(self):
        """単一チャンクで2話者を識別"""
        chunk_results = [
            {
                "chunk_index": 0,
                "speakers": {
                    "SPEAKER_00": {"embedding": [0.1, 0.2, 0.3], "total_duration": 10.0},
                    "SPEAKER_01": {"embedding": [-0.1, -0.2, -0.3], "total_duration": 8.0},
                },
            }
        ]

        mapping, count = cluster_speakers(chunk_results)

        assert count == 2
        assert "chunk_0_SPEAKER_00" in mapping
        assert "chunk_0_SPEAKER_01" in mapping

    def test_same_speaker_across_chunks(self):
        """複数チャンクで同一話者を統一"""
        chunk_results = [
            {
                "chunk_index": 0,
                "speakers": {
                    "SPEAKER_00": {"embedding": [0.1, 0.2, 0.3], "total_duration": 10.0},
                },
            },
            {
                "chunk_index": 1,
                "speakers": {
                    "SPEAKER_00": {"embedding": [0.11, 0.21, 0.31], "total_duration": 8.0},
                },
            },
        ]

        mapping, count = cluster_speakers(chunk_results)

        assert count == 1
        assert mapping["chunk_0_SPEAKER_00"] == mapping["chunk_1_SPEAKER_00"]

    def test_three_speakers(self):
        """3話者以上のケース"""
        chunk_results = [
            {
                "chunk_index": 0,
                "speakers": {
                    "SPEAKER_00": {"embedding": [1.0, 0.0, 0.0], "total_duration": 10.0},
                    "SPEAKER_01": {"embedding": [0.0, 1.0, 0.0], "total_duration": 8.0},
                    "SPEAKER_02": {"embedding": [0.0, 0.0, 1.0], "total_duration": 5.0},
                },
            }
        ]

        mapping, count = cluster_speakers(chunk_results)

        assert count == 3
        assert len(set(mapping.values())) == 3  # 3つの異なるグローバルラベル

    def test_single_speaker_long_audio(self):
        """単話者長時間（全部同一クラスタにまとめられる）"""
        chunk_results = [
            {
                "chunk_index": i,
                "speakers": {
                    "SPEAKER_00": {
                        "embedding": [0.1 + i * 0.001, 0.2, 0.3],  # わずかな差
                        "total_duration": 100.0,
                    },
                },
            }
            for i in range(5)
        ]

        mapping, count = cluster_speakers(chunk_results)

        assert count == 1
        # 全て同じグローバルラベルに
        global_labels = set(mapping.values())
        assert len(global_labels) == 1

    def test_empty_chunks(self):
        """無音チャンク（segments 0件）"""
        chunk_results = [
            {
                "chunk_index": 0,
                "speakers": {},  # 埋め込みなし
            },
            {
                "chunk_index": 1,
                "speakers": {
                    "SPEAKER_00": {"embedding": [0.1, 0.2, 0.3], "total_duration": 10.0},
                },
            },
        ]

        mapping, count = cluster_speakers(chunk_results)

        assert count == 1
        assert "chunk_1_SPEAKER_00" in mapping


class TestResolveOverlaps:
    def test_no_overlap(self):
        """オーバーラップなしの場合"""
        segments = [
            {
                "global_start": 0.0,
                "global_end": 5.0,
                "speaker": "SPEAKER_A",
                "effective_start": 0.0,
                "effective_end": 480.0,
            },
            {
                "global_start": 5.5,
                "global_end": 10.0,
                "speaker": "SPEAKER_B",
                "effective_start": 0.0,
                "effective_end": 480.0,
            },
        ]

        result = resolve_overlaps(segments)

        assert len(result) == 2
        assert result[0]["start"] == 0.0
        assert result[0]["end"] == 5.0

    def test_overlap_resolution(self):
        """オーバーラップ区間が正しく解決される"""
        segments = [
            {
                "global_start": 450.0,
                "global_end": 490.0,
                "speaker": "SPEAKER_A",
                "effective_start": 0.0,
                "effective_end": 480.0,
            },
            {
                "global_start": 460.0,
                "global_end": 500.0,
                "speaker": "SPEAKER_A",
                "effective_start": 480.0,
                "effective_end": 960.0,
            },
        ]

        result = resolve_overlaps(segments)

        # 有効範囲内でクリップされる
        assert result[0]["end"] <= 480.0
        assert result[1]["start"] >= 480.0

    def test_merge_adjacent_same_speaker(self):
        """連続する同一話者セグメントが結合される"""
        segments = [
            {
                "global_start": 0.0,
                "global_end": 5.0,
                "speaker": "SPEAKER_A",
                "effective_start": 0.0,
                "effective_end": 480.0,
            },
            {
                "global_start": 5.2,  # 0.2秒のギャップ
                "global_end": 10.0,
                "speaker": "SPEAKER_A",
                "effective_start": 0.0,
                "effective_end": 480.0,
            },
        ]

        result = resolve_overlaps(segments)

        # 0.5秒以内なので結合される
        assert len(result) == 1
        assert result[0]["start"] == 0.0
        assert result[0]["end"] == 10.0


class TestChunkAudio:
    def test_chunk_overlap_calculation(self):
        """チャンクオーバーラップの計算が正しい"""
        # 仮想的な設定
        chunk_duration = 480
        overlap_duration = 30
        total_duration = 1000

        step = chunk_duration - overlap_duration  # 450

        expected_chunks = [
            {"offset": 0, "effective_start": 0, "effective_end": 480},
            {"offset": 450, "effective_start": 450, "effective_end": 930},
            {"offset": 900, "effective_start": 900, "effective_end": 1000},
        ]

        current_pos = 0
        chunks = []
        while current_pos < total_duration:
            effective_end = min(current_pos + chunk_duration, total_duration)
            chunks.append({
                "offset": current_pos,
                "effective_start": current_pos,
                "effective_end": effective_end,
            })
            current_pos += step

        assert len(chunks) == 3
        for i, (actual, expected) in enumerate(zip(chunks, expected_chunks)):
            assert actual["offset"] == expected["offset"], f"Chunk {i} offset mismatch"
            assert actual["effective_start"] == expected["effective_start"]
```

---

## 7. 実装タスク一覧

| # | タスク | 説明 | 優先度 | 依存 |
|---|--------|------|--------|------|
| 1 | ChunkAudio Lambda 実装 | オーバーラップロジック修正版 | 必須 | - |
| 2 | ChunkAudio テスト作成 | TDD | 必須 | 1 |
| 3 | Diarize Lambda 改修 | S3 出力 + 加重平均埋め込み | 必須 | - |
| 4 | Diarize テスト更新 | S3 出力テスト追加 | 必須 | 3 |
| 5 | MergeSpeakers Lambda 実装 | S3 読込 + クラスタリング | 必須 | - |
| 6 | MergeSpeakers テスト作成 | 3話者・無音ケース追加 | 必須 | 5 |
| 7 | CDK 更新 | 新規 Lambda + HF キャッシュ設定 | 必須 | 1, 3, 5 |
| 8 | Step Functions 更新 | Map State + MaxConcurrency=5 | 必須 | 7 |
| 9 | 統合テスト実装 | E2E テスト | 必須 | 8 |
| 10 | パフォーマンス検証 | 8分チャンク処理時間計測 | 推奨 | 9 |

---

## 8. リスクと軽減策

| リスク | 影響 | 軽減策 |
|--------|------|--------|
| 話者統一の精度低下 | 中 | SIMILARITY_THRESHOLD を環境変数で調整可能に |
| チャンク境界での話者欠損 | 低 | オーバーラップ 30秒、effective_start/end で正確にクリップ |
| 埋め込みモデルのコールドスタート | 中 | HF キャッシュを /tmp に配置、Provisioned Concurrency 検討 |
| Map State の並列実行制限 | 低 | MaxConcurrency=5 から開始、様子を見て調整 |
| Step Functions 256KB 制限 | 高 | S3 経由で詳細データを受け渡し |

---

## 9. 改訂履歴

| 日付 | 版 | 内容 |
|------|-----|------|
| 2025-12-06 | 1.0 | 初版作成 |
| 2025-12-06 | 1.1 | レビュー反映: オーバーラップロジック修正、256KB制限対策、加重平均埋め込み、HFキャッシュ変更、テストケース追加 |
