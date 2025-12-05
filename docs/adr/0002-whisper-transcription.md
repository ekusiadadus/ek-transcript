# ADR 0002: faster-whisper による文字起こし

## ステータス

**採用 (Accepted)** - 2025-12-05

## コンテキスト

話者分離後の音声セグメントをテキストに変換する文字起こしエンジンを選定する必要がある。精度・速度・コスト・多言語対応のバランスを考慮する。

### 要件

- 日本語を含む多言語対応
- 高い文字起こし精度
- Lambda/Fargate で実行可能
- 低コスト
- オープンソースまたは従量課金

## 決定

**faster-whisper（CTranslate2ベースのWhisper実装）を採用する。**

### 採用するモデル構成

| 環境 | モデル | 理由 |
|------|--------|------|
| 本番（精度重視） | `large-v3` | 最高精度 |
| 本番（コスト重視） | `medium` | バランス良好 |
| 開発・テスト | `small` または `distil-medium.en` | 高速・低メモリ |

### 実行環境

```python
from faster_whisper import WhisperModel

model = WhisperModel(
    model_size="medium",
    device="cpu",          # Lambda: CPU, Fargate GPU: "cuda"
    compute_type="int8"    # 量子化でメモリ削減
)

segments, info = model.transcribe(
    "audio.wav",
    beam_size=5,
    language="ja"          # 日本語を明示指定
)
```

## 検討した代替案

### 代替案1: AWS Transcribe

| 項目 | 評価 |
|------|------|
| 概要 | AWSマネージド文字起こしサービス |
| メリット | フルマネージド、AWS統合、リアルタイム対応 |
| デメリット | 従量課金が高い、話者識別は追加料金 |
| コスト | $0.024/分（標準）、話者識別は追加$0.012/分 |
| 日本語精度 | 良好だが、Whisperには劣る場合あり |

**8時間動画の場合:**
```
8時間 = 480分
$0.024 × 480 = $11.52/動画（話者識別なし）
$0.036 × 480 = $17.28/動画（話者識別あり）
```

### 代替案2: OpenAI Whisper API

| 項目 | 評価 |
|------|------|
| 概要 | OpenAIが提供するWhisper API |
| メリット | 最新モデル、高精度、簡単なAPI |
| デメリット | 外部API依存、25MBファイル制限、従量課金 |
| コスト | $0.006/分 |
| 日本語精度 | 非常に高い |

**8時間動画の場合:**
```
8時間 = 480分
$0.006 × 480 = $2.88/動画
```

ただし、25MBファイル制限があるため、長時間音声は分割が必須。

### 代替案3: オリジナル Whisper (OpenAI)

| 項目 | 評価 |
|------|------|
| 概要 | OpenAIが公開したオリジナル実装 |
| メリット | 高精度、オープンソース |
| デメリット | メモリ消費大、処理速度が遅い |
| コスト | 計算リソースのみ |
| 日本語精度 | 非常に高い |

## 根拠

### 1. 性能比較

| 指標 | faster-whisper | オリジナルWhisper | AWS Transcribe |
|------|----------------|-------------------|----------------|
| 処理速度 | 4x高速 | 1x（基準） | N/A（マネージド） |
| メモリ使用量 | 50%削減 | 100%（基準） | N/A |
| WER（英語） | 同等 | 基準 | やや劣る |
| 日本語精度 | 高い | 高い | 良好 |

### 2. コスト試算（月100動画、平均2時間/動画）

| サービス | 月間コスト |
|----------|-----------|
| faster-whisper（Lambda） | 約$20〜$50（計算リソースのみ） |
| AWS Transcribe | 約$288〜$432 |
| OpenAI Whisper API | 約$72 |

### 3. Lambda適合性

```
faster-whisper medium モデル:
- メモリ使用量: 約2〜4GB（int8量子化時）
- Lambda 10GBメモリで十分動作可能
- コールドスタート: 30〜60秒（モデルロード）
```

### 4. 日本語対応

faster-whisperはオリジナルWhisperと同じモデルを使用するため、日本語認識精度は同等。

```python
# 日本語最適化設定
segments, info = model.transcribe(
    audio_path,
    language="ja",
    task="transcribe",
    initial_prompt="日本語の会議音声です。"  # コンテキスト提供
)
```

## 結果

### 実装方針

1. **コンテナイメージ**: faster-whisperを含むDockerイメージを作成
2. **モデル配置**: S3またはEFSにモデルをキャッシュ
3. **量子化**: int8で実行しメモリ削減
4. **並列処理**: Step Functions Map Stateでセグメント並列処理

### 期待される効果

| 効果 | 詳細 |
|------|------|
| コスト削減 | AWS Transcribe比で80%以上削減 |
| 高精度 | Whisper同等の認識精度 |
| 柔軟性 | モデルサイズ・パラメータ調整可能 |

### 注意事項

| 項目 | 対策 |
|------|------|
| コールドスタート | Provisioned Concurrency検討 |
| 長時間音声 | 事前に分割して並列処理 |
| GPU利用時 | FargateまたはEC2でCUDA環境構築 |

## 参考資料

- [faster-whisper GitHub](https://github.com/SYSTRAN/faster-whisper)
- [CTranslate2](https://github.com/OpenNMT/CTranslate2)
- [OpenAI Whisper](https://github.com/openai/whisper)
- [AWS Transcribe 料金](https://aws.amazon.com/transcribe/pricing/)
