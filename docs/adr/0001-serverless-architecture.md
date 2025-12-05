# ADR 0001: サーバーレスアーキテクチャの採用

## ステータス

**採用 (Accepted)** - 2025-12-05

## コンテキスト

長時間の録画動画（最大8時間）から話者分離付き文字起こしを行い、そのテキストをLLMで分析するパイプラインを構築する必要がある。運用コストを最小限に抑えつつ、スケーラビリティと保守性を確保したい。

### 要件

- 最大8時間の動画を処理可能
- 話者分離付き文字起こし
- LLMによる分析機能
- 低コスト運用
- オンデマンドでのスケーリング
- 保守性・運用負荷の低減

## 決定

**AWS Lambda + Step Functions + S3 によるサーバーレスアーキテクチャを採用する。**

### アーキテクチャ概要

```
[S3 Upload]
    ↓ (S3 Event)
[Step Functions State Machine]
    ├── ExtractAudio (Lambda)
    ├── Diarize (Lambda/Fargate)
    ├── SplitBySpeaker (Lambda)
    ├── Transcribe (Lambda - Map State)
    └── LLMAnalysis (Lambda)
    ↓
[S3 Output] → [EventBridge Notification]
```

## 検討した代替案

### 代替案1: ECS/EKS ベース

| 項目 | 評価 |
|------|------|
| 概要 | コンテナオーケストレーションによる常時稼働システム |
| メリット | 柔軟なリソース制御、長時間処理に適する |
| デメリット | 常時稼働コスト、運用複雑性、オーバーエンジニアリング |
| コスト | 月額$100〜$500（最小構成でも） |

### 代替案2: EC2 ベース

| 項目 | 評価 |
|------|------|
| 概要 | 仮想マシン上でバッチ処理 |
| メリット | 完全な制御、GPU利用が容易 |
| デメリット | インスタンス管理、スケーリング設定、待機コスト |
| コスト | 月額$50〜$300（待機時間含む） |

### 代替案3: AWS Batch

| 項目 | 評価 |
|------|------|
| 概要 | マネージドバッチ処理 |
| メリット | 長時間ジョブに最適、GPU対応 |
| デメリット | Step Functionsとの組み合わせで複雑化 |
| コスト | 使用分のみ課金だが、EC2/Fargateの起動時間が必要 |

## 根拠

### 1. コスト効率

```
Lambda + Step Functions:
- Lambda: $0.20 / 100万リクエスト + $0.0000166667 / GB-秒
- Step Functions: $0.025 / 1,000状態遷移
- S3: $0.023 / GB-月（ストレージ）

想定月間コスト（動画100本/月処理時）:
- Lambda: 約$5〜$20
- Step Functions: 約$1〜$5
- S3: 約$2〜$10
- 合計: 約$10〜$40/月
```

### 2. スケーラビリティ

- 同時実行数は自動スケール
- Map Stateによる並列処理で処理時間短縮
- リクエストに応じた自動スケールアップ/ダウン

### 3. 運用負荷

- サーバー管理不要
- 自動リトライ・エラーハンドリング（Step Functions）
- CloudWatch による統合監視

### 4. 制約事項と対策

| 制約 | 対策 |
|------|------|
| Lambda 15分タイムアウト | 処理を細分化、重い処理はFargateへ |
| Lambda 10GB メモリ上限 | モデルサイズ最適化、Fargateへの切り替え |
| /tmp 10GB 制限 | S3ストリーミング、分割処理 |

## 結果

### 期待される効果

1. **コスト削減**: 従量課金により、処理がない時はコストゼロ
2. **運用負荷軽減**: マネージドサービスによりインフラ管理不要
3. **柔軟性**: 処理量に応じた自動スケーリング
4. **可観測性**: CloudWatch統合による監視・アラート

### リスクと軽減策

| リスク | 軽減策 |
|--------|--------|
| コールドスタート | Provisioned Concurrency、軽量化 |
| タイムアウト | 処理分割、Fargateへのオフロード |
| 依存性複雑化 | IAC (CDK) による構成管理 |

## 参考資料

- [AWS Lambda ドキュメント](https://docs.aws.amazon.com/lambda/)
- [AWS Step Functions ドキュメント](https://docs.aws.amazon.com/step-functions/)
- [Conversation Intelligence using AI/ML on AWS](https://github.com/aws-samples/conversation-intelligence-using-aiml-on-aws)
