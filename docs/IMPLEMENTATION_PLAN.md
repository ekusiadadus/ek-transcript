# 実装計画書: 話者分離付き文字起こしパイプライン

## 概要

Lambda + Step Functions + S3 + faster-whisper + pyannote.audio + OpenAI API による低コスト話者分離書き起こしパイプラインの実装計画。

### 関連 ADR

| ADR | タイトル | ステータス |
|-----|----------|-----------|
| [0001](./adr/0001-serverless-architecture.md) | サーバーレスアーキテクチャの採用 | 採用 |
| [0002](./adr/0002-whisper-transcription.md) | faster-whisper による文字起こし | 採用 |
| [0003](./adr/0003-pyannote-speaker-diarization.md) | pyannote.audio による話者分離 | 採用 |
| [0004](./adr/0004-stepfunctions-orchestration.md) | Step Functions によるオーケストレーション | 採用 |
| [0005](./adr/0005-openai-llm-analysis.md) | OpenAI API (gpt-5-mini) による LLM 分析 | 採用 |

---

## Phase 1: プロジェクト初期設定

### 1.1 ディレクトリ構造の作成

```
ek-transcript/
├── docs/
│   ├── RULE.md
│   ├── IMPLEMENTATION_PLAN.md
│   └── adr/
│       ├── 0001-serverless-architecture.md
│       ├── 0002-whisper-transcription.md
│       ├── 0003-pyannote-speaker-diarization.md
│       ├── 0004-stepfunctions-orchestration.md
│       └── 0005-openai-llm-analysis.md
├── infrastructure/
│   ├── cdk/
│   │   ├── app.py
│   │   ├── cdk.json
│   │   └── stacks/
│   │       ├── __init__.py
│   │       ├── storage_stack.py
│   │       ├── lambda_stack.py
│   │       └── stepfunctions_stack.py
│   └── Makefile
├── lambdas/
│   ├── extract_audio/
│   │   ├── Dockerfile
│   │   ├── lambda_function.py
│   │   ├── requirements.txt
│   │   └── tests/
│   ├── diarize/
│   │   ├── Dockerfile
│   │   ├── lambda_function.py
│   │   ├── requirements.txt
│   │   └── tests/
│   ├── split_by_speaker/
│   │   ├── Dockerfile
│   │   ├── lambda_function.py
│   │   ├── requirements.txt
│   │   └── tests/
│   ├── transcribe/
│   │   ├── Dockerfile
│   │   ├── lambda_function.py
│   │   ├── requirements.txt
│   │   └── tests/
│   └── llm_analysis/
│       ├── Dockerfile
│       ├── lambda_function.py
│       ├── prompts.py
│       ├── requirements.txt
│       └── tests/
├── tests/
│   ├── integration/
│   └── e2e/
├── scripts/
│   ├── deploy.sh
│   └── test_local.sh
├── ARCHITECTURE.md
├── CLAUDE.md
├── .gitignore
├── pyproject.toml
└── README.md
```

### 1.2 タスク一覧

| タスク | 説明 | 優先度 |
|--------|------|--------|
| 1.1.1 | ディレクトリ構造作成 | 必須 |
| 1.1.2 | pyproject.toml 作成 | 必須 |
| 1.1.3 | .gitignore 設定 | 必須 |
| 1.1.4 | pre-commit hooks 設定 | 推奨 |
| 1.1.5 | GitHub Actions CI/CD 設定 | 推奨 |

---

## Phase 2: インフラストラクチャ構築 (CDK)

### 2.1 Storage Stack

```python
# infrastructure/cdk/stacks/storage_stack.py
class StorageStack(Stack):
    def __init__(self, scope, id, **kwargs):
        super().__init__(scope, id, **kwargs)

        # 入力バケット
        self.input_bucket = s3.Bucket(
            self, "InputBucket",
            removal_policy=RemovalPolicy.RETAIN,
            encryption=s3.BucketEncryption.S3_MANAGED,
            block_public_access=s3.BlockPublicAccess.BLOCK_ALL
        )

        # 処理済みバケット
        self.output_bucket = s3.Bucket(
            self, "OutputBucket",
            removal_policy=RemovalPolicy.RETAIN,
            encryption=s3.BucketEncryption.S3_MANAGED,
            lifecycle_rules=[
                s3.LifecycleRule(
                    expiration=Duration.days(90)  # 90日で削除
                )
            ]
        )
```

### 2.2 Secrets Manager

```python
# OpenAI API キー
self.openai_secret = secretsmanager.Secret(
    self, "OpenAISecret",
    secret_name="ek-transcript/openai-api-key"
)

# HuggingFace トークン
self.hf_secret = secretsmanager.Secret(
    self, "HuggingFaceToken",
    secret_name="ek-transcript/huggingface-token"
)
```

### 2.3 タスク一覧

| タスク | 説明 | 依存 |
|--------|------|------|
| 2.1.1 | CDK プロジェクト初期化 | - |
| 2.1.2 | S3 バケット定義 | 2.1.1 |
| 2.1.3 | Secrets Manager 定義 | 2.1.1 |
| 2.1.4 | IAM ロール定義 | 2.1.1 |
| 2.1.5 | VPC/セキュリティグループ定義（Fargate用） | 2.1.1 |
| 2.1.6 | ECR リポジトリ定義 | 2.1.1 |

---

## Phase 3: ExtractAudio Lambda 実装

### 3.1 テスト作成（TDD）

```python
# lambdas/extract_audio/tests/test_handler.py
import pytest
from unittest.mock import Mock, patch

class TestExtractAudio:
    def test_extract_audio_from_mp4(self, tmp_path):
        """MP4からWAVを正しく抽出できること"""
        # Given: テスト用MP4ファイル
        # When: extract_audio を実行
        # Then: 16kHz モノラル WAV が生成される
        pass

    def test_extract_audio_invalid_format(self):
        """非対応フォーマットでエラーが発生すること"""
        pass

    def test_lambda_handler_s3_integration(self, mock_s3):
        """S3からダウンロード→処理→S3アップロードが成功すること"""
        pass
```

### 3.2 実装

```python
# lambdas/extract_audio/lambda_function.py
import boto3
import ffmpeg
import os

s3 = boto3.client('s3')

def extract_audio(input_path: str, output_path: str) -> None:
    """動画から16kHzモノラルWAVを抽出"""
    (
        ffmpeg.input(input_path)
              .output(output_path, ac=1, ar='16000')
              .overwrite_output()
              .run(capture_stdout=True, capture_stderr=True)
    )

def lambda_handler(event, context):
    bucket = event['bucket']
    key = event['key']

    local_video = '/tmp/input.mp4'
    local_audio = '/tmp/audio.wav'

    # ダウンロード
    s3.download_file(bucket, key, local_video)

    # 音声抽出
    extract_audio(local_video, local_audio)

    # アップロード
    audio_key = f"processed/{key.rsplit('.', 1)[0]}.wav"
    s3.upload_file(local_audio, bucket, audio_key)

    return {
        'bucket': bucket,
        'audio_key': audio_key,
        'original_key': key
    }
```

### 3.3 Dockerfile

```dockerfile
FROM public.ecr.aws/lambda/python:3.11

# ffmpeg インストール
RUN yum install -y tar xz && \
    curl -L https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz | \
    tar xJ --strip-components=1 -C /usr/local/bin

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY lambda_function.py .

CMD ["lambda_function.lambda_handler"]
```

### 3.4 タスク一覧

| タスク | 説明 | 依存 |
|--------|------|------|
| 3.1.1 | テストケース設計 | - |
| 3.1.2 | 単体テスト実装 | 3.1.1 |
| 3.1.3 | lambda_function.py 実装 | 3.1.2 |
| 3.1.4 | Dockerfile 作成 | 3.1.3 |
| 3.1.5 | ローカル動作確認 | 3.1.4 |
| 3.1.6 | CDK に Lambda 追加 | 3.1.5, 2.x |

---

## Phase 4: Diarize Lambda/Fargate 実装

### 4.1 テスト作成（TDD）

```python
# lambdas/diarize/tests/test_handler.py
class TestDiarize:
    def test_diarize_two_speakers(self, sample_audio):
        """2話者の音声を正しく分離できること"""
        pass

    def test_output_rttm_format(self):
        """RTTM形式で正しく出力されること"""
        pass

    def test_output_json_format(self):
        """JSON形式で正しく出力されること"""
        pass
```

### 4.2 実装

```python
# lambdas/diarize/lambda_function.py
from pyannote.audio import Pipeline
import torch
import boto3
import json
import os

# モデル初期化（コールドスタート対策）
pipeline = None

def get_pipeline():
    global pipeline
    if pipeline is None:
        secrets = boto3.client('secretsmanager')
        hf_token = json.loads(
            secrets.get_secret_value(SecretId='ek-transcript/huggingface-token')
            ['SecretString']
        )['token']

        pipeline = Pipeline.from_pretrained(
            "pyannote/speaker-diarization-3.1",
            use_auth_token=hf_token
        )
    return pipeline

def lambda_handler(event, context):
    bucket = event['bucket']
    audio_key = event['audio_key']

    s3 = boto3.client('s3')
    local_audio = '/tmp/audio.wav'
    s3.download_file(bucket, audio_key, local_audio)

    # 話者分離実行
    diarization = get_pipeline()(local_audio)

    # セグメント抽出
    segments = []
    for turn, _, speaker in diarization.itertracks(yield_label=True):
        segments.append({
            'start': turn.start,
            'end': turn.end,
            'speaker': speaker
        })

    # JSON保存
    segments_key = audio_key.replace('.wav', '_segments.json')
    s3.put_object(
        Bucket=bucket,
        Key=segments_key,
        Body=json.dumps(segments, ensure_ascii=False)
    )

    return {
        'bucket': bucket,
        'audio_key': audio_key,
        'segments_key': segments_key,
        'speaker_count': len(set(s['speaker'] for s in segments))
    }
```

### 4.3 タスク一覧

| タスク | 説明 | 依存 |
|--------|------|------|
| 4.1.1 | テストケース設計 | - |
| 4.1.2 | 単体テスト実装 | 4.1.1 |
| 4.1.3 | lambda_function.py 実装 | 4.1.2 |
| 4.1.4 | Dockerfile 作成（PyTorch含む） | 4.1.3 |
| 4.1.5 | Fargate タスク定義（GPU版） | 4.1.4 |
| 4.1.6 | ローカル動作確認 | 4.1.4 |
| 4.1.7 | CDK に追加 | 4.1.6, 2.x |

---

## Phase 5: SplitBySpeaker Lambda 実装

### 5.1 テスト作成（TDD）

```python
class TestSplitBySpeaker:
    def test_split_audio_by_segments(self):
        """セグメント情報に基づいて正しく分割されること"""
        pass

    def test_empty_segments(self):
        """空のセグメントリストでエラーにならないこと"""
        pass
```

### 5.2 実装

```python
# lambdas/split_by_speaker/lambda_function.py
from pydub import AudioSegment
import boto3
import json
import os

def lambda_handler(event, context):
    bucket = event['bucket']
    audio_key = event['audio_key']
    segments_key = event['segments_key']

    s3 = boto3.client('s3')

    # ダウンロード
    s3.download_file(bucket, audio_key, '/tmp/audio.wav')
    segments = json.loads(
        s3.get_object(Bucket=bucket, Key=segments_key)['Body'].read()
    )

    audio = AudioSegment.from_wav('/tmp/audio.wav')

    segment_files = []
    for i, seg in enumerate(segments):
        start_ms = int(seg['start'] * 1000)
        end_ms = int(seg['end'] * 1000)
        clip = audio[start_ms:end_ms]

        out_path = f'/tmp/seg_{i:04d}.wav'
        clip.export(out_path, format='wav')

        out_key = f"segments/{audio_key.split('/')[-1].replace('.wav', '')}_{i:04d}_{seg['speaker']}.wav"
        s3.upload_file(out_path, bucket, out_key)

        segment_files.append({
            'key': out_key,
            'speaker': seg['speaker'],
            'start': seg['start'],
            'end': seg['end']
        })

    return {
        'bucket': bucket,
        'segment_files': segment_files
    }
```

### 5.3 タスク一覧

| タスク | 説明 | 依存 |
|--------|------|------|
| 5.1.1 | テストケース設計 | - |
| 5.1.2 | 単体テスト実装 | 5.1.1 |
| 5.1.3 | lambda_function.py 実装 | 5.1.2 |
| 5.1.4 | Dockerfile 作成 | 5.1.3 |
| 5.1.5 | ローカル動作確認 | 5.1.4 |
| 5.1.6 | CDK に Lambda 追加 | 5.1.5, 2.x |

---

## Phase 6: Transcribe Lambda 実装

### 6.1 テスト作成（TDD）

```python
class TestTranscribe:
    def test_transcribe_japanese_audio(self):
        """日本語音声を正しく文字起こしできること"""
        pass

    def test_transcribe_short_segment(self):
        """短いセグメントでも動作すること"""
        pass

    def test_model_initialization(self):
        """モデルが正しく初期化されること"""
        pass
```

### 6.2 実装

```python
# lambdas/transcribe/lambda_function.py
from faster_whisper import WhisperModel
import boto3
import json
import os

# モデル初期化（コールドスタート対策）
model = None

def get_model():
    global model
    if model is None:
        model = WhisperModel(
            "medium",
            device="cpu",
            compute_type="int8"
        )
    return model

def lambda_handler(event, context):
    bucket = event['bucket']
    segment_file = event['segment_file']

    s3 = boto3.client('s3')
    local_path = '/tmp/segment.wav'
    s3.download_file(bucket, segment_file['key'], local_path)

    # 文字起こし
    segments, info = get_model().transcribe(
        local_path,
        beam_size=5,
        language="ja"
    )

    text = "".join([seg.text for seg in segments])

    return {
        'speaker': segment_file['speaker'],
        'start': segment_file['start'],
        'end': segment_file['end'],
        'text': text
    }
```

### 6.3 タスク一覧

| タスク | 説明 | 依存 |
|--------|------|------|
| 6.1.1 | テストケース設計 | - |
| 6.1.2 | 単体テスト実装 | 6.1.1 |
| 6.1.3 | lambda_function.py 実装 | 6.1.2 |
| 6.1.4 | Dockerfile 作成（faster-whisper含む） | 6.1.3 |
| 6.1.5 | ローカル動作確認 | 6.1.4 |
| 6.1.6 | CDK に Lambda 追加 | 6.1.5, 2.x |

---

## Phase 7: LLMAnalysis Lambda 実装

### 7.1 テスト作成（TDD）

```python
class TestLLMAnalysis:
    def test_analyze_transcript_summary(self, mock_openai):
        """要約プロンプトで正しく分析されること"""
        pass

    def test_analyze_long_transcript(self, mock_openai):
        """長文のチャンク分割が正しく行われること"""
        pass

    def test_retry_on_rate_limit(self, mock_openai):
        """レート制限時にリトライされること"""
        pass
```

### 7.2 実装

```python
# lambdas/llm_analysis/lambda_function.py
import openai
import boto3
import json
from tenacity import retry, wait_exponential, stop_after_attempt

# OpenAI クライアント初期化
client = None

def get_openai_client():
    global client
    if client is None:
        secrets = boto3.client('secretsmanager')
        api_key = json.loads(
            secrets.get_secret_value(SecretId='ek-transcript/openai-api-key')
            ['SecretString']
        )['api_key']
        client = openai.OpenAI(api_key=api_key)
    return client

@retry(
    wait=wait_exponential(multiplier=1, min=4, max=60),
    stop=stop_after_attempt(3)
)
def analyze(transcript: list, prompt: str) -> str:
    full_text = "\n".join([
        f"[{t['speaker']}] {t['text']}"
        for t in transcript
    ])

    response = get_openai_client().chat.completions.create(
        model="gpt-5-mini",
        messages=[
            {"role": "system", "content": "あなたは会議分析の専門家です。"},
            {"role": "user", "content": f"{prompt}\n\n文字起こし:\n{full_text}"}
        ],
        max_tokens=4096,
        temperature=0.3
    )

    return response.choices[0].message.content

def lambda_handler(event, context):
    bucket = event['bucket']
    transcript_key = event['transcript_key']
    prompt = event.get('prompt', '要約を作成してください')

    s3 = boto3.client('s3')
    transcript = json.loads(
        s3.get_object(Bucket=bucket, Key=transcript_key)['Body'].read()
    )

    result = analyze(transcript, prompt)

    result_key = transcript_key.replace('_transcript.json', '_analysis.txt')
    s3.put_object(
        Bucket=bucket,
        Key=result_key,
        Body=result.encode('utf-8')
    )

    return {
        'bucket': bucket,
        'analysis_key': result_key
    }
```

### 7.3 タスク一覧

| タスク | 説明 | 依存 |
|--------|------|------|
| 7.1.1 | テストケース設計 | - |
| 7.1.2 | プロンプトテンプレート設計 | 7.1.1 |
| 7.1.3 | 単体テスト実装 | 7.1.1 |
| 7.1.4 | lambda_function.py 実装 | 7.1.3 |
| 7.1.5 | Dockerfile 作成 | 7.1.4 |
| 7.1.6 | ローカル動作確認 | 7.1.5 |
| 7.1.7 | CDK に Lambda 追加 | 7.1.6, 2.x |

---

## Phase 8: Step Functions State Machine 定義

### 8.1 State Machine 定義

```json
{
  "Comment": "話者分離付き文字起こしパイプライン",
  "StartAt": "ExtractAudio",
  "States": {
    "ExtractAudio": {
      "Type": "Task",
      "Resource": "${ExtractAudioFunctionArn}",
      "Next": "Diarize",
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
          "Next": "HandleError"
        }
      ]
    },
    "Diarize": {
      "Type": "Task",
      "Resource": "${DiarizeFunctionArn}",
      "TimeoutSeconds": 900,
      "Next": "SplitBySpeaker"
    },
    "SplitBySpeaker": {
      "Type": "Task",
      "Resource": "${SplitBySpeakerFunctionArn}",
      "Next": "TranscribeSegments"
    },
    "TranscribeSegments": {
      "Type": "Map",
      "ItemsPath": "$.segment_files",
      "MaxConcurrency": 10,
      "ItemSelector": {
        "bucket.$": "$.bucket",
        "segment_file.$": "$$.Map.Item.Value"
      },
      "Iterator": {
        "StartAt": "Transcribe",
        "States": {
          "Transcribe": {
            "Type": "Task",
            "Resource": "${TranscribeFunctionArn}",
            "End": true
          }
        }
      },
      "ResultPath": "$.transcription_results",
      "Next": "AggregateResults"
    },
    "AggregateResults": {
      "Type": "Task",
      "Resource": "${AggregateResultsFunctionArn}",
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

### 8.2 タスク一覧

| タスク | 説明 | 依存 |
|--------|------|------|
| 8.1.1 | State Machine JSON 定義 | 3.x, 4.x, 5.x, 6.x, 7.x |
| 8.1.2 | CDK に Step Functions 追加 | 8.1.1 |
| 8.1.3 | S3 トリガー設定 | 8.1.2 |
| 8.1.4 | EventBridge 通知設定 | 8.1.2 |
| 8.1.5 | CloudWatch ダッシュボード設定 | 8.1.2 |

---

## Phase 9: E2E テスト・パフォーマンスチューニング

### 9.1 E2E テスト

```python
# tests/e2e/test_pipeline.py
class TestPipeline:
    def test_short_video_processing(self):
        """5分の動画が正しく処理されること"""
        pass

    def test_multi_speaker_detection(self):
        """複数話者が正しく識別されること"""
        pass

    def test_japanese_transcription_accuracy(self):
        """日本語の文字起こし精度が閾値以上であること"""
        pass
```

### 9.2 パフォーマンス計測

| 項目 | 目標値 | 計測方法 |
|------|--------|----------|
| 1時間動画処理時間 | < 15分 | X-Ray トレース |
| コールドスタート | < 60秒 | CloudWatch Logs |
| 並列処理効率 | > 80% | Step Functions コンソール |
| メモリ使用率 | < 80% | Lambda メトリクス |

### 9.3 タスク一覧

| タスク | 説明 | 依存 |
|--------|------|------|
| 9.1.1 | E2E テストケース設計 | 8.x |
| 9.1.2 | テストデータ準備 | 9.1.1 |
| 9.1.3 | E2E テスト実装・実行 | 9.1.2 |
| 9.1.4 | パフォーマンス計測 | 9.1.3 |
| 9.1.5 | ボトルネック特定・改善 | 9.1.4 |
| 9.1.6 | ドキュメント更新 | 9.1.5 |

---

## 依存関係図

```
Phase 1 (初期設定)
    ↓
Phase 2 (インフラ) ──────────────────────────────────────┐
    ↓                                                    │
Phase 3 (ExtractAudio) ─→ Phase 4 (Diarize) ─→ Phase 5 (Split)
                                                         │
                              ┌──────────────────────────┘
                              ↓
                         Phase 6 (Transcribe) ─→ Phase 7 (LLM)
                                                         │
                              ┌──────────────────────────┘
                              ↓
                         Phase 8 (Step Functions)
                              ↓
                         Phase 9 (E2E・チューニング)
```

---

## リスクと軽減策

| リスク | 影響度 | 確率 | 軽減策 |
|--------|--------|------|--------|
| Lambda タイムアウト | 高 | 中 | Fargate へのオフロード、処理分割 |
| pyannote ライセンス問題 | 高 | 低 | 商用ライセンス確認、代替検討 |
| OpenAI API レート制限 | 中 | 中 | リトライ実装、バッチ処理 |
| コールドスタート遅延 | 中 | 高 | Provisioned Concurrency、EFS キャッシュ |
| コスト超過 | 中 | 中 | CloudWatch アラート、バジェット設定 |

---

## 完了条件

1. 全ての Phase が完了していること
2. E2E テストが全てパスすること
3. パフォーマンス目標値を満たしていること
4. ドキュメントが最新化されていること
5. セキュリティレビューが完了していること

---

## 改訂履歴

| 日付 | 版 | 内容 |
|------|-----|------|
| 2025-12-05 | 1.0 | 初版作成 |
