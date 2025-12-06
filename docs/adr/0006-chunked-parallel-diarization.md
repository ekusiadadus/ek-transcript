# ADR-0006: チャンク並列話者分離アーキテクチャの採用

## ステータス

提案中

## 日付

2025-12-06

## コンテキスト

### 現状の問題

1. **Lambda タイムアウト**: pyannote による話者分離は、640MiB クラスの長時間音声（約40-45分）に対して Lambda の最大タイムアウト（900秒/15分）を超過する
2. **処理時間**: pyannote は CPU 処理で音声長にほぼ比例した時間がかかる（GPU なしの場合、1時間音声に20-30分程度）
3. **スケーラビリティ**: 単一 Lambda での直列処理ではスケールしない

### 技術的背景

- pyannote.audio の話者分離パイプラインは内部で以下の処理を行う:
  1. 音声のスライディングウィンドウ分割
  2. セグメンテーション（発話区間検出）
  3. 話者埋め込み（Speaker Embedding）抽出
  4. クラスタリング（話者識別）

- チャンク分割時の課題:
  - 各チャンクで独立に diarization を実行すると、話者ラベルが不一致になる
  - 例: チャンクA の `SPEAKER_00` とチャンクB の `SPEAKER_00` が同一人物とは限らない

### 参考情報

- [GitHub Discussion #1205](https://github.com/pyannote/pyannote-audio/discussions/1205): 複数ファイル間での話者識別
- [pyannote/embedding](https://huggingface.co/pyannote/embedding): 話者埋め込みモデル
- [Speaker Identification using DBSCAN](https://medium.com/@sapkotabinit2002/speaker-identification-and-clustering-using-pyannote-dbscan-and-cosine-similarity-dfa08b5b2a24)

## 決定

**チャンク並列処理 + 埋め込みベースクラスタリング**アーキテクチャを採用する。

### アーキテクチャ概要

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Step Functions Workflow                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  1. ExtractAudio Lambda                                                 │
│     └─→ 動画から音声抽出 (16kHz mono WAV)                              │
│         └─→ 音声長を取得                                                │
│                                                                         │
│  2. ChunkAudio Lambda (新規)                                            │
│     └─→ 音声を N 個のチャンクに分割                                    │
│         └─→ オーバーラップ付きで分割                                    │
│         └─→ チャンクメタデータ配列を返す                                │
│                                                                         │
│  3. DiarizeChunks (Map State - 並列実行)                                │
│     ├─→ DiarizeChunk Lambda [chunk_0]                                   │
│     ├─→ DiarizeChunk Lambda [chunk_1]                                   │
│     ├─→ DiarizeChunk Lambda [chunk_2]                                   │
│     └─→ DiarizeChunk Lambda [chunk_N]                                   │
│         └─→ 各チャンクで話者分離 + 埋め込み抽出                         │
│                                                                         │
│  4. MergeSpeakers Lambda (新規)                                         │
│     └─→ 全チャンクの埋め込みを収集                                      │
│     └─→ コサイン類似度 + クラスタリングで統一ラベル付与                 │
│     └─→ オーバーラップ区間の解決                                        │
│     └─→ グローバルセグメント情報を出力                                  │
│                                                                         │
│  5. SplitBySpeaker Lambda                                               │
│     └─→ 統一ラベルに基づいて音声分割                                    │
│                                                                         │
│  6. TranscribeSegments (Map State - 並列実行)                           │
│     └─→ 各セグメントを文字起こし                                        │
│                                                                         │
│  7. AggregateResults Lambda                                             │
│     └─→ 文字起こし結果を統合                                            │
│                                                                         │
│  8. LLMAnalysis Lambda                                                  │
│     └─→ GPT-5-mini で分析                                               │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## 詳細設計

### チャンク分割パラメータ

| パラメータ | 値 | 説明 |
|-----------|-----|------|
| `CHUNK_DURATION` | 480秒（8分） | 1チャンクの基本長 |
| `OVERLAP_DURATION` | 30秒 | チャンク間のオーバーラップ |
| `MIN_CHUNK_DURATION` | 60秒 | 最小チャンク長（これ以下は前チャンクに統合） |

### 処理時間見積もり

| 音声長 | チャンク数 | 並列処理時間 | 統合処理 | 合計見込み |
|--------|-----------|-------------|---------|-----------|
| 10分 | 2 | 2-3分 | 10秒 | 3分 |
| 30分 | 4 | 4-5分 | 20秒 | 5分 |
| 60分 | 8 | 5-6分 | 30秒 | 7分 |
| 120分 | 15 | 6-7分 | 45秒 | 8分 |

### 新規 Lambda 関数

#### ChunkAudio Lambda

- **入力**: 音声ファイルのS3パス、音声長
- **処理**: ffmpeg で音声をオーバーラップ付きチャンクに分割
- **出力**: チャンクメタデータ配列

#### DiarizeChunk Lambda (既存 Diarize の改修)

- **入力**: チャンク音声のS3パス、オフセット情報
- **処理**:
  1. pyannote で話者分離
  2. 各話者の代表埋め込みベクトルを抽出
- **出力**: ローカルセグメント + 埋め込みベクトル

#### MergeSpeakers Lambda

- **入力**: 全チャンクの diarization 結果
- **処理**:
  1. 全埋め込みベクトルを収集
  2. コサイン類似度行列を計算
  3. Agglomerative Clustering でグローバル話者ID割り当て
  4. オーバーラップ区間の重複解決
  5. タイムスタンプをグローバル時刻に変換
- **出力**: 統一されたセグメント情報

## 結果

### メリット

1. **Lambda タイムアウト回避**: 各チャンクは8分音声 → 約3-4分で処理完了
2. **スケーラビリティ**: Step Functions Map State で自動並列化
3. **コスト効率**: 並列実行により総処理時間短縮
4. **耐障害性**: チャンク単位でリトライ可能

### デメリット

1. **実装複雑性**: 統合ロジック（MergeSpeakers）の追加開発が必要
2. **境界誤差**: チャンク境界で話者検出精度が若干低下する可能性
3. **一時ストレージ**: チャンクファイルのS3保存が必要

### トレードオフ

- **完全一致 vs 実用性**: 1本処理と完全に同じ結果にはならないが、実用上十分な精度
- **複雑性 vs 処理時間**: 実装は複雑化するが、長時間音声の処理が可能に

## 代替案

### 代替案1: AWS Batch / ECS Fargate

- **メリット**: 1ジョブで全体処理可能、pyannote のチャンク処理を内部に任せられる
- **デメリット**: インフラ構成が複雑化、Lambda の手軽さを失う
- **判断**: 将来の移行オプションとして保留

### 代替案2: 軽量モデルへの変更

- **メリット**: 処理時間短縮
- **デメリット**: 精度低下、長時間音声では根本解決にならない
- **判断**: 不採用

## 参照

- [pyannote.audio GitHub](https://github.com/pyannote/pyannote-audio)
- [Speaker Embedding Model](https://huggingface.co/pyannote/embedding)
- [AWS Lambda Timeout Limits](https://docs.aws.amazon.com/lambda/latest/dg/configuration-timeout.html)
- [Step Functions Map State](https://docs.aws.amazon.com/step-functions/latest/dg/amazon-states-language-map-state.html)
