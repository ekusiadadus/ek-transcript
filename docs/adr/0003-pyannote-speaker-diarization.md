# ADR 0003: pyannote.audio による話者分離

## ステータス

**採用 (Accepted)** - 2025-12-05

## コンテキスト

長時間の会議・会話音声から「誰がいつ話しているか」を識別する話者分離（Speaker Diarization）機能が必要である。文字起こし結果と組み合わせ、話者ごとの発言内容を整理する。

### 要件

- 複数話者（2〜10名程度）の識別
- 長時間音声（最大8時間）の処理
- 話者の重複発話への対応
- オープンソースまたは低コスト
- Lambda/Fargateでの実行

## 決定

**pyannote.audio（speaker-diarization-3.1）を採用する。**

### 採用するモデル

```python
from pyannote.audio import Pipeline
import torch

pipeline = Pipeline.from_pretrained(
    "pyannote/speaker-diarization-3.1",
    use_auth_token="HF_TOKEN"
)

# GPU利用時（Fargateなど）
# pipeline.to(torch.device("cuda"))

diarization = pipeline("audio.wav")
```

### 出力形式

```
SPEAKER_00 0.5s - 3.2s
SPEAKER_01 3.5s - 7.8s
SPEAKER_00 8.0s - 12.4s
...
```

RTTM（Rich Transcription Time Marked）形式またはJSON形式で出力。

## 検討した代替案

### 代替案1: AWS Transcribe 話者識別

| 項目 | 評価 |
|------|------|
| 概要 | AWS Transcribeの話者識別機能 |
| メリット | フルマネージド、文字起こしと統合 |
| デメリット | 追加料金、最大10話者制限、精度がpyannoteに劣る |
| コスト | $0.012/分（追加） |
| 精度 | 良好だが、pyannoteには劣る |

### 代替案2: SpeechBrain

| 項目 | 評価 |
|------|------|
| 概要 | PyTorchベースの音声処理ツールキット |
| メリット | 柔軟性、他の音声処理も可能 |
| デメリット | 話者分離特化ではない、セットアップ複雑 |
| コスト | 計算リソースのみ |
| 精度 | 良好 |

### 代替案3: NVIDIA NeMo

| 項目 | 評価 |
|------|------|
| 概要 | NVIDIAの会話AI向けツールキット |
| メリット | GPU最適化、高精度 |
| デメリット | GPU必須、セットアップ複雑 |
| コスト | GPU計算リソース |
| 精度 | 非常に高い |

### 代替案4: Whisper + whisperX

| 項目 | 評価 |
|------|------|
| 概要 | WhisperにWord-level timestampと話者分離を追加 |
| メリット | 文字起こしと統合、ワンストップ |
| デメリット | 内部でpyannoteを使用、カスタマイズ性低 |
| コスト | 計算リソースのみ |
| 精度 | pyannote依存 |

## 根拠

### 1. 精度比較（DER: Diarization Error Rate）

| モデル | AMI Test | VoxConverse | DIHARD III |
|--------|----------|-------------|------------|
| pyannote 3.1 | 11.0% | 4.1% | 14.8% |
| AWS Transcribe | 15〜20% | N/A | N/A |
| NeMo | 10.5% | 4.5% | 13.2% |

pyannote 3.1は現時点でオープンソースの中で最高レベルの精度。

### 2. 機能比較

| 機能 | pyannote | AWS Transcribe | SpeechBrain |
|------|----------|----------------|-------------|
| 話者数自動推定 | ○ | ○（最大10） | △ |
| 重複発話検出 | ○ | △ | △ |
| リアルタイム | △ | ○ | △ |
| 話者数指定 | ○ | ○ | ○ |
| CPU実行 | ○ | - | ○ |

### 3. コスト試算（月100動画、平均2時間/動画）

| サービス | 月間コスト |
|----------|-----------|
| pyannote（Lambda/Fargate） | 約$30〜$80（計算リソースのみ） |
| AWS Transcribe話者識別 | 約$144（追加分のみ） |

### 4. Lambda/Fargate適合性

```
pyannote 3.1:
- メモリ使用量: 約4〜8GB
- Lambda 10GBメモリで動作可能（CPU、短時間音声）
- 長時間音声はFargate推奨
- 処理時間: 音声の0.3〜0.5倍（CPU）、0.1倍（GPU）
```

### 5. HuggingFaceトークン要件

pyannoteのモデルを使用するには:

1. HuggingFaceアカウント作成
2. モデルページで利用規約に同意
3. アクセストークンを取得
4. AWS Secrets Managerで管理

```python
import os
from pyannote.audio import Pipeline

pipeline = Pipeline.from_pretrained(
    "pyannote/speaker-diarization-3.1",
    use_auth_token=os.environ["HF_TOKEN"]
)
```

## 結果

### 実装方針

1. **Lambda用コンテナ**: PyTorchを含む軽量イメージ（CPU版）
2. **Fargate用コンテナ**: GPU対応イメージ（長時間音声用）
3. **トークン管理**: AWS Secrets Manager
4. **出力**: RTTM + JSON形式

### 処理フロー

```
[音声ファイル (S3)]
    ↓
[pyannote.audio]
    ↓
[RTTM/JSON (話者区間)]
    ↓
[SplitBySpeaker] → [各話者セグメント]
```

### 期待される効果

| 効果 | 詳細 |
|------|------|
| 高精度 | DER 10%前後（業界トップレベル） |
| コスト削減 | AWS Transcribe話者識別比で50%以上削減 |
| 柔軟性 | 話者数指定、閾値調整可能 |

### パラメータチューニング

```python
# 話者数が既知の場合
diarization = pipeline(
    "audio.wav",
    num_speakers=4
)

# 話者数の範囲指定
diarization = pipeline(
    "audio.wav",
    min_speakers=2,
    max_speakers=6
)
```

### 注意事項

| 項目 | 対策 |
|------|------|
| HuggingFace規約 | 商用利用時はライセンス確認 |
| 処理時間 | 長時間音声はFargateでGPU利用 |
| メモリ | 8時間音声は分割処理を検討 |

## 参考資料

- [pyannote.audio GitHub](https://github.com/pyannote/pyannote-audio)
- [speaker-diarization-3.1 Model Card](https://huggingface.co/pyannote/speaker-diarization-3.1)
- [pyannote 論文](https://arxiv.org/abs/2312.00931)
- [AWS Transcribe Speaker Identification](https://docs.aws.amazon.com/transcribe/latest/dg/diarization.html)
