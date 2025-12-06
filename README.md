# ek-transcript

AWS サーバーレスアーキテクチャを使用した話者分離・文字起こしパイプライン

## 概要

動画/音声ファイルから話者を分離し、各話者ごとに文字起こしを行い、LLM で分析・要約するサーバーレスパイプラインです。

### 主な機能

- 動画/音声ファイルからの音声抽出 (ffmpeg)
- 話者分離 (pyannote.audio speaker-diarization-community-1)
- 高精度文字起こし (faster-whisper)
- LLM による分析・要約 (OpenAI GPT)
- 完全サーバーレス (AWS Lambda + Step Functions)

### 主要技術

| コンポーネント | 技術 |
|---------------|------|
| オーケストレーション | AWS Step Functions |
| 音声抽出 | ffmpeg-python |
| 話者分離 | pyannote.audio |
| 文字起こし | faster-whisper |
| LLM分析 | OpenAI API (gpt-4o-mini) |
| インフラ | AWS CDK (TypeScript) |
| パッケージ管理 | uv |

## アーキテクチャ

```
┌─────────────┐     ┌─────────────────────────────────────────────────────────────┐
│   S3 Input  │────▶│                    Step Functions                           │
│   Bucket    │     │  ┌───────────┐  ┌─────────┐  ┌───────────┐  ┌───────────┐  │
└─────────────┘     │  │  Extract  │─▶│ Diarize │─▶│   Split   │─▶│Transcribe │  │
                    │  │   Audio   │  │         │  │by Speaker │  │  (Map)    │  │
                    │  └───────────┘  └─────────┘  └───────────┘  └───────────┘  │
                    │                                                      │      │
                    │  ┌───────────┐  ┌─────────┐                          │      │
                    │  │    LLM    │◀─│Aggregate│◀─────────────────────────┘      │
                    │  │ Analysis  │  │ Results │                                 │
                    │  └───────────┘  └─────────┘                                 │
                    └─────────────────────────────────────────────────────────────┘
                                           │
                                           ▼
                                    ┌─────────────┐
                                    │  S3 Output  │
                                    │   Bucket    │
                                    └─────────────┘
```

### 処理フロー

1. **ExtractAudio**: 動画から音声を抽出 (16kHz, モノラル WAV)
2. **Diarize**: pyannote.audio で話者分離を実行
3. **SplitBySpeaker**: 話者ごとに音声を分割
4. **Transcribe**: faster-whisper で各セグメントを文字起こし (並列処理)
5. **AggregateResults**: 文字起こし結果を統合
6. **LLMAnalysis**: OpenAI で要約・分析

## 前提条件

- Python 3.11+
- Node.js 18+
- [uv](https://docs.astral.sh/uv/) (Python パッケージマネージャ)
- AWS CLI (設定済み)
- Docker (Lambda イメージビルド用)
- ffmpeg (ローカルテスト用)

## クイックスタート

### 1. リポジトリのクローン

```bash
git clone https://github.com/ekusiadadus/ek-transcript.git
cd ek-transcript
```

### 2. 環境セットアップ

```bash
make setup
```

### 3. 環境変数の設定

```bash
# .env ファイルを作成
cat > .env << EOF
OPENAI_API_KEY=sk-your-api-key-here
EOF
```

### 4. テスト実行

```bash
make test
```

### 5. デプロイ

```bash
make deploy
```

## 使用方法

### Make コマンド

```bash
make help          # ヘルプ表示
make setup         # 初期環境セットアップ
make install       # 依存関係インストール
make test          # テスト実行
make test-cov      # カバレッジ付きテスト
make lint          # リンター実行
make format        # コード整形
make check         # リント + テスト
make build         # CDK ビルド
make synth         # CloudFormation テンプレート生成
make deploy        # AWS にデプロイ
make diff          # デプロイ差分確認
make destroy       # リソース削除
make clean         # クリーンアップ
make version       # バージョン情報
make env-check     # 環境チェック
```

### 手動コマンド

```bash
# Python 依存関係
uv sync --all-extras

# テスト
uv run pytest -v

# リント
uv run ruff check .
uv run mypy lambdas tests

# CDK ビルド
cd cdk && npm run build

# デプロイ
cd cdk && npx cdk deploy --all
```

## プロジェクト構成

```
ek-transcript/
├── lambdas/                    # Lambda 関数
│   ├── extract_audio/          # 音声抽出 (ffmpeg)
│   ├── diarize/                # 話者分離 (pyannote)
│   ├── split_by_speaker/       # 音声分割 (ffmpeg)
│   ├── transcribe/             # 文字起こし (whisper)
│   ├── aggregate_results/      # 結果統合
│   └── llm_analysis/           # LLM 分析 (OpenAI)
├── cdk/                        # AWS CDK インフラ
│   ├── lib/stacks/             # スタック定義
│   │   ├── storage-stack.ts    # S3, Secrets Manager
│   │   ├── lambda-stack.ts     # Lambda 関数
│   │   └── stepfunctions-stack.ts  # Step Functions
│   └── bin/cdk.ts              # エントリポイント
├── tests/                      # 共通テスト・フィクスチャ
├── docs/                       # ドキュメント
│   ├── adr/                    # アーキテクチャ決定記録
│   ├── IMPLEMENTATION_PLAN.md  # 実装計画
│   └── RULE.md                 # 開発ルール
├── pyproject.toml              # Python プロジェクト設定
├── Makefile                    # ビルドコマンド
└── README.md                   # このファイル
```

## コスト見積もり

### 2時間動画の処理コスト (概算)

| サービス | 詳細 | コスト |
|---------|------|--------|
| Lambda (ExtractAudio) | 2GB, 5分 | $0.01 |
| Lambda (Diarize) | 10GB, 30分 | $0.30 |
| Lambda (Split) | 1GB, 2分 | $0.002 |
| Lambda (Transcribe) | 4GB, 60分 (並列) | $0.24 |
| Lambda (Aggregate) | 512MB, 10秒 | $0.0001 |
| Lambda (LLM Analysis) | 512MB, 30秒 | $0.0003 |
| Step Functions | ~200 状態遷移 | $0.005 |
| S3 | 1GB 保存 + 転送 | $0.03 |
| OpenAI API | GPT-4o-mini, ~10K tokens | $0.01 |
| **合計** | | **約 $0.60/動画** |

### 月額固定コスト (概算)

| サービス | 詳細 | コスト |
|---------|------|--------|
| S3 | 10GB ストレージ | $0.23 |
| Secrets Manager | 2 シークレット | $0.80 |
| CloudWatch Logs | 1GB | $0.50 |
| ECR | 5GB イメージ | $0.50 |
| **合計** | | **約 $2/月** |

※ 実際のコストは利用状況により変動します

## Lambda 設定

| Lambda | メモリ | タイムアウト | 説明 |
|--------|-------|-------------|------|
| ExtractAudio | 2048 MB | 15分 | 動画から音声抽出 |
| Diarize | 10240 MB | 15分 | 話者分離 (GPU相当のメモリ必要) |
| SplitBySpeaker | 1024 MB | 15分 | 話者ごとに音声分割 |
| Transcribe | 4096 MB | 15分 | Whisper で文字起こし |
| AggregateResults | 512 MB | 5分 | 結果統合 |
| LLMAnalysis | 512 MB | 5分 | OpenAI で分析 |

## 環境変数

| 変数名 | 説明 | デフォルト |
|--------|------|-----------|
| `INPUT_BUCKET` | 入力 S3 バケット | - |
| `OUTPUT_BUCKET` | 出力 S3 バケット | - |
| `WHISPER_MODEL` | Whisper モデル | `large-v3` |
| `OPENAI_MODEL` | OpenAI モデル | `gpt-4o-mini` |
| `HF_TOKEN_SECRET_ARN` | HuggingFace トークン ARN | - |
| `OPENAI_SECRET_ARN` | OpenAI API キー ARN | - |

## トラブルシューティング

### pyannote.audio 認証エラー

pyannote/speaker-diarization-3.1 はライセンス同意が必要です:

1. https://huggingface.co/pyannote/speaker-diarization-3.1 でライセンスに同意
2. HuggingFace トークンを取得
3. AWS Secrets Manager に設定

### Lambda タイムアウト

長時間動画では Lambda がタイムアウトする可能性があります:

- **Diarize**: 2時間超の動画は事前分割を推奨
- **Transcribe**: Map State で自動並列化

### メモリ不足

pyannote.audio は大量のメモリを使用:

- 最低 8GB、推奨 10GB (Lambda 最大)
- それでも不足する場合は Fargate を検討

## ドキュメント

- [アーキテクチャ設計](./ARCHITECTURE.md)
- [実装計画](./docs/IMPLEMENTATION_PLAN.md)
- [ADR (Architecture Decision Records)](./docs/adr/)
- [開発ルール](./docs/RULE.md)

## 開発

### テスト

```bash
# 全テスト
make test

# カバレッジ付き
make test-cov

# 特定のテスト
uv run pytest lambdas/extract_audio/tests/ -v
```

### リント

```bash
# チェックのみ
make lint

# 自動修正
make format
```

### プルリクエスト

1. フォーク
2. フィーチャーブランチ作成 (`git checkout -b feature/amazing-feature`)
3. 変更をコミット (`git commit -m 'feat: add amazing feature'`)
4. プッシュ (`git push origin feature/amazing-feature`)
5. プルリクエスト作成

## ライセンス

MIT License

## 作者

ekusiadadus
