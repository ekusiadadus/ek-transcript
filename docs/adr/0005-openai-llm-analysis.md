# ADR 0005: OpenAI API (gpt-5-mini) による LLM 分析

## ステータス

**採用 (Accepted)** - 2025-12-05

## コンテキスト

話者分離付き文字起こし結果を分析し、要約・感情分析・質問応答・アクションアイテム抽出などの高度な自然言語処理を行う必要がある。ユーザー要件により、LLM には OpenAI API を使用する。

### 要件

- 長文（最大8時間分の文字起こし）の処理
- 日本語対応
- 高精度な要約・分析
- 柔軟なプロンプト対応
- Lambda からのAPI呼び出し
- コスト効率

## 決定

**OpenAI API（gpt-5-mini）を採用する。**

### モデル選定

| ユースケース | モデル | 理由 |
|-------------|--------|------|
| 本番（標準） | **gpt-5-mini** | コスト最適化、高速、十分な精度 |
| 高精度分析 | gpt-5 | 複雑な分析が必要な場合 |
| フォールバック | gpt-4o-mini | gpt-5-mini 障害時 |

### 実装コード例

```python
import openai
import os
import json
import boto3

# Secrets Manager から API キーを取得
secrets_client = boto3.client('secretsmanager')
secret = secrets_client.get_secret_value(SecretId='openai-api-key')
openai.api_key = json.loads(secret['SecretString'])['api_key']

def analyze_transcript(transcript: list, prompt: str) -> str:
    """
    文字起こし結果を gpt-5-mini で分析
    """
    # 話者ごとの発言を整形
    full_text = "\n".join([
        f"[{t['speaker']}] {t['text']}"
        for t in transcript
    ])

    response = openai.chat.completions.create(
        model="gpt-5-mini",
        messages=[
            {
                "role": "system",
                "content": "あなたは会議分析の専門家です。"
            },
            {
                "role": "user",
                "content": f"{prompt}\n\n文字起こし:\n{full_text}"
            }
        ],
        max_tokens=4096,
        temperature=0.3
    )

    return response.choices[0].message.content
```

## 検討した代替案

### 代替案1: Amazon Bedrock (Claude)

| 項目 | 評価 |
|------|------|
| 概要 | AWSマネージドのLLMサービス |
| メリット | AWS統合、IAM認証、リージョン内通信 |
| デメリット | モデル利用申請必要、レイテンシ |
| コスト | モデルにより異なる |
| 日本語精度 | 高い |

### 代替案2: Azure OpenAI Service

| 項目 | 評価 |
|------|------|
| 概要 | Azure上のOpenAIモデル |
| メリット | エンタープライズサポート、SLA |
| デメリット | Azure契約必要、セットアップ複雑 |
| コスト | OpenAI直接と同等 |
| 日本語精度 | 高い |

### 代替案3: ローカルLLM (Llama, Mixtral等)

| 項目 | 評価 |
|------|------|
| 概要 | オープンソースモデルを自前でホスト |
| メリット | API料金なし、データプライバシー |
| デメリット | GPU必要、運用コスト、精度劣る |
| コスト | GPU インスタンス代 |
| 日本語精度 | モデルによる |

### 代替案4: gpt-4o / gpt-4o-mini

| 項目 | 評価 |
|------|------|
| 概要 | OpenAI の既存モデル |
| メリット | 安定、実績あり |
| デメリット | gpt-5-mini より性能劣る可能性 |
| コスト | gpt-4o-mini: $0.15/1M input tokens |
| 日本語精度 | 高い |

## 根拠

### 1. gpt-5-mini の特徴

```
gpt-5-mini:
- GPT-5 ファミリーの軽量・高速モデル
- コスト効率に優れる
- 長文コンテキスト対応
- 日本語を含む多言語サポート
- レイテンシが低い
```

### 2. コスト試算（月100動画、平均2時間/動画）

```
想定トークン数:
- 2時間の文字起こし: 約20,000〜30,000トークン（入力）
- 分析結果: 約1,000〜2,000トークン（出力）

月間コスト見込み:
- 入力: 30,000 × 100 = 3M tokens
- 出力: 2,000 × 100 = 200K tokens
- 合計: gpt-5-mini の料金体系による
  (gpt-4o-mini 参考: 約$0.45 + $0.12 = $0.57/月)
```

### 3. Lambda 統合

```python
import boto3
import openai
from tenacity import retry, wait_exponential, stop_after_attempt

@retry(
    wait=wait_exponential(multiplier=1, min=4, max=60),
    stop=stop_after_attempt(3)
)
def call_openai_with_retry(messages, model="gpt-5-mini"):
    """
    リトライ付き OpenAI API 呼び出し
    """
    return openai.chat.completions.create(
        model=model,
        messages=messages,
        max_tokens=4096,
        temperature=0.3
    )


def lambda_handler(event, context):
    bucket = event['bucket']
    transcript_key = event['transcript_key']
    prompt = event.get('prompt', '要約を作成してください')

    # S3 から文字起こし取得
    s3 = boto3.client('s3')
    transcript = json.loads(
        s3.get_object(Bucket=bucket, Key=transcript_key)['Body'].read()
    )

    # 分析実行
    result = analyze_transcript(transcript, prompt)

    # 結果を S3 に保存
    result_key = transcript_key.replace('_transcript.json', '_analysis.txt')
    s3.put_object(
        Bucket=bucket,
        Key=f"processed/{result_key}",
        Body=result.encode('utf-8')
    )

    return {'analysis_key': result_key}
```

### 4. 長文対応戦略

8時間の音声 = 大量のトークンとなるため、以下の戦略を採用:

```python
def analyze_long_transcript(transcript: list, prompt: str) -> str:
    """
    長文文字起こしの分析（チャンク分割）
    """
    # トークン数に応じてチャンク分割
    chunks = split_into_chunks(transcript, max_tokens=100000)

    partial_results = []
    for i, chunk in enumerate(chunks):
        result = analyze_transcript(chunk, f"Part {i+1}: {prompt}")
        partial_results.append(result)

    # 部分結果を統合
    if len(partial_results) > 1:
        final_result = analyze_transcript(
            [{"speaker": "SUMMARY", "text": r} for r in partial_results],
            "以下の部分要約を統合して最終的な分析を作成してください"
        )
        return final_result

    return partial_results[0]
```

### 5. プロンプトテンプレート

```python
PROMPT_TEMPLATES = {
    "summary": """
以下の会議の文字起こしを分析し、次の形式で要約してください：

1. 会議の概要（3文以内）
2. 主な議題（箇条書き）
3. 決定事項（箇条書き）
4. アクションアイテム（担当者・期限があれば含む）
5. 次回までの課題
    """,

    "sentiment": """
以下の会議の文字起こしを分析し、各話者の発言のセンチメント（感情）を分析してください。
ポジティブ/ネガティブ/ニュートラルの割合と、特筆すべき感情表現を報告してください。
    """,

    "qa": """
以下の文字起こしの内容に基づいて質問に回答してください。
文字起こしに含まれない情報については「文字起こしには含まれていません」と回答してください。

質問: {question}
    """
}
```

## 結果

### 実装方針

1. **API キー管理**: AWS Secrets Manager で安全に管理
2. **リトライ**: tenacity ライブラリでexponential backoff
3. **長文対応**: チャンク分割 + 統合戦略
4. **プロンプト管理**: テンプレート化して再利用

### Lambda 関数構成

```
LLMAnalysis/
├── lambda_function.py    # メインハンドラー
├── prompts.py            # プロンプトテンプレート
├── openai_client.py      # OpenAI API ラッパー
└── requirements.txt      # openai, tenacity, boto3
```

### 期待される効果

| 効果 | 詳細 |
|------|------|
| 高精度分析 | gpt-5-mini による高品質な要約・分析 |
| 低コスト | 効率的なトークン使用でコスト削減 |
| 柔軟性 | カスタムプロンプトで様々な分析に対応 |
| 信頼性 | リトライ機構でAPI障害に対応 |

### セキュリティ考慮事項

| 項目 | 対策 |
|------|------|
| APIキー | Secrets Manager で管理、Lambda環境変数に展開 |
| データ | 機密情報のマスキング検討 |
| ログ | 入出力のログにトークンを含めない |
| アクセス | IAM ロールで最小権限 |

### 注意事項

| 項目 | 対策 |
|------|------|
| レート制限 | リトライ + backoff で対応 |
| コンテキスト長 | チャンク分割で対応 |
| コスト急増 | CloudWatch アラートで監視 |
| API障害 | gpt-4o-mini へのフォールバック |

## 参考資料

- [OpenAI API ドキュメント](https://platform.openai.com/docs)
- [OpenAI 料金](https://openai.com/pricing)
- [tenacity - リトライライブラリ](https://github.com/jd/tenacity)
- [AWS Secrets Manager](https://docs.aws.amazon.com/secretsmanager/)
