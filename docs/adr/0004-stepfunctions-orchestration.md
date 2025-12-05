# ADR 0004: Step Functions によるワークフローオーケストレーション

## ステータス

**採用 (Accepted)** - 2025-12-05

## コンテキスト

動画から話者分離付き文字起こしを行うパイプラインは、複数の処理ステップ（音声抽出→話者分離→分割→文字起こし→LLM分析）から構成される。これらのステップを順序立てて実行し、エラー処理・リトライ・並列処理を適切に管理するオーケストレーション機構が必要である。

### 要件

- 複数Lambda関数の順次・並列実行
- エラー時のリトライと回復
- 長時間実行（最大8時間音声の処理）
- 処理状況の可視化・監視
- コスト効率

## 決定

**AWS Step Functions（Standard Workflow）を採用する。**

### ステートマシン構成

```json
{
  "StartAt": "ExtractAudio",
  "States": {
    "ExtractAudio": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:...:ExtractAudio",
      "Next": "Diarize",
      "Retry": [{"ErrorEquals": ["States.ALL"], "MaxAttempts": 2}]
    },
    "Diarize": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:...:Diarize",
      "Next": "SplitBySpeaker",
      "TimeoutSeconds": 900
    },
    "SplitBySpeaker": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:...:SplitBySpeaker",
      "Next": "TranscribeSegments"
    },
    "TranscribeSegments": {
      "Type": "Map",
      "ItemsPath": "$.segment_files",
      "MaxConcurrency": 10,
      "Iterator": {
        "StartAt": "Transcribe",
        "States": {
          "Transcribe": {
            "Type": "Task",
            "Resource": "arn:aws:lambda:...:Transcribe",
            "End": true
          }
        }
      },
      "Next": "AggregateResults"
    },
    "AggregateResults": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:...:AggregateResults",
      "Next": "LLMAnalysis"
    },
    "LLMAnalysis": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:...:LLMAnalysis",
      "End": true
    }
  }
}
```

## 検討した代替案

### 代替案1: SQS + Lambda（イベント駆動）

| 項目 | 評価 |
|------|------|
| 概要 | SQSキューで各処理を連結 |
| メリット | シンプル、疎結合、コスト安い |
| デメリット | 状態管理困難、可視化なし、エラー追跡困難 |
| コスト | SQS: $0.40/100万リクエスト |
| 複雑性 | 処理フローが見えにくい |

### 代替案2: Apache Airflow (MWAA)

| 項目 | 評価 |
|------|------|
| 概要 | マネージドAirflowでDAGを実行 |
| メリット | 強力なスケジューリング、豊富なオペレーター |
| デメリット | 常時稼働コスト高、オーバースペック |
| コスト | 最小構成で$300〜500/月 |
| 複雑性 | 学習コスト高 |

### 代替案3: Step Functions Express Workflow

| 項目 | 評価 |
|------|------|
| 概要 | 短時間・高頻度向けStep Functions |
| メリット | コスト安い（$1.00/100万実行） |
| デメリット | 最大5分制限、長時間処理不可 |
| コスト | Standard の 1/10 程度 |
| 適合性 | 本ユースケースには不適 |

### 代替案4: EventBridge + Lambda

| 項目 | 評価 |
|------|------|
| 概要 | EventBridgeルールでLambda連携 |
| メリット | 疎結合、スケーラブル |
| デメリット | 複雑なワークフロー管理困難 |
| コスト | 低コスト |
| 複雑性 | 並列・分岐処理が困難 |

## 根拠

### 1. 機能比較

| 機能 | Step Functions | SQS + Lambda | Airflow |
|------|----------------|--------------|---------|
| 視覚的ワークフロー | ○ | × | ○ |
| 並列処理（Map） | ○ | △ | ○ |
| 自動リトライ | ○ | △ | ○ |
| エラーハンドリング | ○ | △ | ○ |
| 長時間実行 | ○（1年） | ○ | ○ |
| 状態追跡 | ○ | × | ○ |
| サーバーレス | ○ | ○ | △ |

### 2. コスト試算（月100動画処理）

```
Step Functions Standard:
- 状態遷移: 約6ステート × 100動画 × 100セグメント = 60,000遷移
- コスト: $0.025 / 1,000遷移 × 60 = $1.50/月

SQS + Lambda:
- メッセージ: 約$0.04/月
- ただし、開発・運用コストが大幅に増加

Airflow (MWAA):
- 最小構成: $300〜$500/月
```

### 3. Map State による並列処理

```json
{
  "Type": "Map",
  "ItemsPath": "$.segment_files",
  "MaxConcurrency": 10,
  "Iterator": {
    "StartAt": "Transcribe",
    "States": {
      "Transcribe": {
        "Type": "Task",
        "Resource": "...",
        "End": true
      }
    }
  }
}
```

- 100セグメントを最大10並列で処理
- 処理時間を大幅短縮
- Lambda同時実行制限を超えない制御

### 4. エラー処理とリトライ

```json
{
  "Retry": [
    {
      "ErrorEquals": ["Lambda.ServiceException"],
      "IntervalSeconds": 2,
      "MaxAttempts": 3,
      "BackoffRate": 2.0
    },
    {
      "ErrorEquals": ["States.Timeout"],
      "MaxAttempts": 2
    }
  ],
  "Catch": [
    {
      "ErrorEquals": ["States.ALL"],
      "Next": "HandleError"
    }
  ]
}
```

### 5. 可観測性

- AWS Console でワークフロー可視化
- 実行履歴の完全な記録
- CloudWatch Logs 統合
- X-Ray トレーシング対応

## 結果

### 実装方針

1. **ワークフロータイプ**: Standard（長時間実行対応）
2. **状態管理**: 各ステップで結果をS3に保存
3. **並列度**: MaxConcurrency=10（Lambda制限考慮）
4. **タイムアウト**: 各ステップに適切な値を設定

### ワークフロー図

```
┌─────────────────────────────────────────────────────────┐
│                  Step Functions                          │
│                                                          │
│  [S3 Trigger]                                            │
│       ↓                                                  │
│  ┌─────────────┐                                         │
│  │ExtractAudio │ → ffmpeg で音声抽出                      │
│  └─────────────┘                                         │
│       ↓                                                  │
│  ┌─────────────┐                                         │
│  │  Diarize    │ → pyannote で話者分離                    │
│  └─────────────┘                                         │
│       ↓                                                  │
│  ┌─────────────┐                                         │
│  │SplitBySpeaker│ → 話者ごとに音声分割                    │
│  └─────────────┘                                         │
│       ↓                                                  │
│  ┌─────────────────────────────────────┐                 │
│  │         Map (Parallel)              │                 │
│  │  ┌───────────┐ ┌───────────┐       │                 │
│  │  │Transcribe │ │Transcribe │ ...   │ → faster-whisper│
│  │  └───────────┘ └───────────┘       │                 │
│  └─────────────────────────────────────┘                 │
│       ↓                                                  │
│  ┌─────────────┐                                         │
│  │ Aggregate   │ → 結果統合                               │
│  └─────────────┘                                         │
│       ↓                                                  │
│  ┌─────────────┐                                         │
│  │ LLMAnalysis │ → OpenAI API で分析                     │
│  └─────────────┘                                         │
│       ↓                                                  │
│  [S3 Output] → [EventBridge Notification]                │
└─────────────────────────────────────────────────────────┘
```

### 期待される効果

| 効果 | 詳細 |
|------|------|
| 信頼性 | 自動リトライでエラー回復 |
| 可視性 | 処理状況をリアルタイムで確認 |
| スケーラビリティ | 並列処理で処理時間短縮 |
| 保守性 | 視覚的なワークフロー定義 |

### 注意事項

| 項目 | 対策 |
|------|------|
| ペイロードサイズ | 256KB制限、大きいデータはS3経由 |
| 状態遷移コスト | 不要な状態を削減 |
| 履歴制限 | 25,000イベント制限に注意 |

## 参考資料

- [AWS Step Functions ドキュメント](https://docs.aws.amazon.com/step-functions/)
- [Step Functions Best Practices](https://docs.aws.amazon.com/step-functions/latest/dg/bp-express.html)
- [Map State](https://docs.aws.amazon.com/step-functions/latest/dg/amazon-states-language-map-state.html)
- [Step Functions 料金](https://aws.amazon.com/step-functions/pricing/)
