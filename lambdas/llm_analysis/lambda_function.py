"""
LLMAnalysis Lambda Function

OpenAI API (gpt-5-mini) を使用して文字起こし結果を分析する。
Structured Outputs を使用して HEMS インタビューデータを構造化抽出。

Version: 3.0 - Structured Outputs 対応
"""

import json
import logging
import os
from datetime import datetime, timezone
from typing import Any

import boto3
import openai
from tenacity import retry, stop_after_attempt, wait_exponential

from models import HEMSInterviewData
from progress import update_progress

# ロガー設定
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# AWS クライアント
s3 = boto3.client("s3")
secrets_client = boto3.client("secretsmanager")
dynamodb = boto3.client("dynamodb")

# 環境変数
OUTPUT_BUCKET = os.environ.get("OUTPUT_BUCKET", "")
OPENAI_SECRET_ARN = os.environ.get("OPENAI_SECRET_ARN", "")
OPENAI_MODEL = os.environ.get("OPENAI_MODEL", "gpt-5-mini")
INTERVIEWS_TABLE_NAME = os.environ.get("INTERVIEWS_TABLE_NAME", "")

# グローバル変数（コールドスタート対策）
_openai_client = None

# HEMS インタビュー分析用システムプロンプト
HEMS_SYSTEM_PROMPT = """あなたは HEMS（ホームエネルギーマネジメントシステム）のユーザーインタビュー分析の専門家です。
The Mom Test の原則に従い、過去の行動事実と定量データを重視して分析してください。

以下の原則を守ってください：
1. 仮定の質問への回答より、過去の実際の行動を重視
2. 数値は可能な限り具体的に抽出
3. 曖昧な表現は「情報なし」として null を設定
4. スコアリングは設計書の基準に厳密に従う

スコアリング基準:
【電気代関心度スコア（10点満点）】
- 直近電気代を±1,000円以内で回答: +2点
- 過去1年で2つ以上の削減行動: +3点
- 電力会社を切り替えた: +3点
- 明細を毎月確認: +2点

【エンゲージメントスコア（10点満点）】
- アプリを週3回以上開く: +3点
- オートメーションを3つ以上設定: +2点
- 連携家電が5台以上: +2点
- 故障したら即買い直す: +3点

【クラファン適合スコア（10点満点）】
- クラファン支援経験あり: +3点
- 3回以上支援: +2点
- 1万円以上の支援経験: +2点
- ガジェット系を支援: +3点

セグメント判定:
- A: 省エネ意識高 = 電気代関心度7点以上 + 電力切替経験あり
- B: ガジェット好き = クラファン経験あり + 連携家電5台以上
- C: 便利さ追求 = エンゲージメント7点以上 + 電気代関心度4点以下
- D: ライト層 = アプリ月数回以下 + オートメーション1つ以下"""

# デフォルトプロンプト（従来互換）
DEFAULT_PROMPT = """以下の会議の文字起こしを分析し、次の形式で要約してください：

1. 会議の概要（3文以内）
2. 主な議題（箇条書き）
3. 決定事項（箇条書き）
4. アクションアイテム（担当者・期限があれば含む）
5. 次回までの課題"""


def get_openai_client() -> openai.OpenAI:
    """OpenAI クライアントを取得（シングルトン）"""
    global _openai_client

    if _openai_client is None:
        if not OPENAI_SECRET_ARN:
            raise ValueError("OPENAI_SECRET_ARN environment variable not set")

        logger.info("Getting OpenAI API key from Secrets Manager...")
        secret = secrets_client.get_secret_value(SecretId=OPENAI_SECRET_ARN)
        secret_data = json.loads(secret["SecretString"])
        api_key = secret_data.get("api_key", secret_data.get("OPENAI_API_KEY", ""))

        _openai_client = openai.OpenAI(api_key=api_key)
        logger.info("OpenAI client initialized")

    return _openai_client


@retry(
    wait=wait_exponential(multiplier=1, min=4, max=60),
    stop=stop_after_attempt(3),
)
def analyze_transcript_structured(transcript: list[dict]) -> HEMSInterviewData:
    """
    文字起こしを構造化分析（Structured Outputs 使用）

    Args:
        transcript: 文字起こし結果のリスト

    Returns:
        HEMSInterviewData: 構造化されたインタビューデータ
    """
    # 話者ごとの発言を整形
    full_text = "\n".join([f"[{t['speaker']}] {t['text']}" for t in transcript])

    logger.info(f"Analyzing transcript with {len(transcript)} segments (structured)...")

    client = get_openai_client()

    # Structured Outputs を使用
    completion = client.beta.chat.completions.parse(
        model=OPENAI_MODEL,
        messages=[
            {"role": "system", "content": HEMS_SYSTEM_PROMPT},
            {
                "role": "user",
                "content": f"以下のインタビュー文字起こしから、HEMSインタビューデータを抽出してください。\n\n文字起こし:\n{full_text}",
            },
        ],
        response_format=HEMSInterviewData,
        # gpt-5-mini は temperature パラメータをサポートしていない（デフォルト値 1 のみ）
    )

    message = completion.choices[0].message
    if message.parsed:
        logger.info("Structured output parsed successfully")
        return message.parsed
    elif message.refusal:
        logger.warning(f"Model refused to generate: {message.refusal}")
        raise ValueError(f"Model refused: {message.refusal}")
    else:
        raise ValueError("Failed to parse structured output")


@retry(
    wait=wait_exponential(multiplier=1, min=4, max=60),
    stop=stop_after_attempt(3),
)
def analyze_transcript_text(transcript: list[dict], prompt: str) -> str:
    """
    文字起こしをテキスト分析（従来方式）

    Args:
        transcript: 文字起こし結果のリスト
        prompt: 分析プロンプト

    Returns:
        分析結果（テキスト）
    """
    # 話者ごとの発言を整形
    full_text = "\n".join([f"[{t['speaker']}] {t['text']}" for t in transcript])

    logger.info(f"Analyzing transcript with {len(transcript)} segments (text)...")

    client = get_openai_client()
    response = client.chat.completions.create(
        model=OPENAI_MODEL,
        messages=[
            {
                "role": "system",
                "content": "あなたは会議分析の専門家です。正確で簡潔な分析を提供してください。",
            },
            {"role": "user", "content": f"{prompt}\n\n文字起こし:\n{full_text}"},
        ],
        temperature=0.3,
    )

    return response.choices[0].message.content or ""


def save_to_dynamodb(
    interview_id: str,
    segment: str,
    analysis_key: str,
    transcript_key: str,
    video_key: str | None = None,
    diarization_key: str | None = None,
) -> None:
    """
    分析結果を DynamoDB に保存

    Args:
        interview_id: インタビュー ID
        segment: セグメント (A/B/C/D)
        analysis_key: 分析結果の S3 キー
        transcript_key: 文字起こしファイルの S3 キー
        video_key: 動画ファイルの S3 キー（オプション）
        diarization_key: 話者分離ファイルの S3 キー（オプション）
    """
    if not INTERVIEWS_TABLE_NAME:
        logger.info("INTERVIEWS_TABLE_NAME not configured, skipping DynamoDB save")
        return

    created_at = datetime.now(timezone.utc).isoformat()

    item: dict[str, Any] = {
        "interview_id": {"S": interview_id},
        "segment": {"S": segment},
        "created_at": {"S": created_at},
        "analysis_key": {"S": analysis_key},
        "transcript_key": {"S": transcript_key},
    }

    if video_key:
        item["video_key"] = {"S": video_key}
    if diarization_key:
        item["diarization_key"] = {"S": diarization_key}

    logger.info(f"Saving to DynamoDB table {INTERVIEWS_TABLE_NAME}: interview_id={interview_id}")
    dynamodb.put_item(TableName=INTERVIEWS_TABLE_NAME, Item=item)
    logger.info("Successfully saved to DynamoDB")


def lambda_handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    """
    Lambda ハンドラー

    Args:
        event: Lambda イベント
            - bucket: S3 バケット名
            - transcript_key: 文字起こしファイルのキー
            - prompt: 分析プロンプト（オプション）
            - structured: 構造化出力を使用するか（オプション、デフォルト: True）
        context: Lambda コンテキスト

    Returns:
        処理結果
            - bucket: 出力バケット名
            - analysis_key: 分析結果ファイルのキー
            - structured_data: 構造化データ（structured=True の場合）
    """
    logger.info(f"Event: {event}")

    bucket = event["bucket"]
    transcript_key = event["transcript_key"]
    prompt = event.get("prompt", DEFAULT_PROMPT)
    use_structured = event.get("structured", True)  # デフォルトで構造化出力を使用

    # DynamoDB 保存用のオプションパラメータ
    interview_id = event.get("interview_id")
    video_key = event.get("video_key")
    diarization_key = event.get("diarization_key")

    # 進捗更新
    if interview_id:
        update_progress(interview_id, "analyzing")

    # S3 から文字起こしを取得
    logger.info(f"Getting transcript from s3://{bucket}/{transcript_key}")
    response = s3.get_object(Bucket=bucket, Key=transcript_key)
    transcript = json.loads(response["Body"].read().decode("utf-8"))

    # 出力バケットを決定
    output_bucket = OUTPUT_BUCKET if OUTPUT_BUCKET else bucket

    # 出力キーのベース名
    base_key = transcript_key.rsplit("/", 1)[-1].rsplit(".", 1)[0]

    if use_structured:
        # 構造化分析を実行
        structured_data = analyze_transcript_structured(transcript)

        # JSON として保存
        analysis_key = f"analysis/{base_key.replace('_transcript', '')}_structured.json"
        json_content = structured_data.model_dump_json(indent=2, ensure_ascii=False)

        logger.info(f"Uploading structured analysis to s3://{output_bucket}/{analysis_key}")
        s3.put_object(
            Bucket=output_bucket,
            Key=analysis_key,
            Body=json_content.encode("utf-8"),
            ContentType="application/json; charset=utf-8",
        )

        # DynamoDB に保存（interview_id が指定されている場合）
        if interview_id:
            save_to_dynamodb(
                interview_id=interview_id,
                segment=structured_data.scoring.segment,
                analysis_key=analysis_key,
                transcript_key=transcript_key,
                video_key=video_key,
                diarization_key=diarization_key,
            )

        return {
            "bucket": output_bucket,
            "analysis_key": analysis_key,
            "status": "completed",
            "structured": True,
            "total_score": structured_data.scoring.total_score,
            "segment": structured_data.scoring.segment,
        }
    else:
        # テキスト分析を実行（従来方式）
        result = analyze_transcript_text(transcript, prompt)

        analysis_key = f"analysis/{base_key.replace('_transcript', '')}_analysis.txt"

        logger.info(f"Uploading analysis to s3://{output_bucket}/{analysis_key}")
        s3.put_object(
            Bucket=output_bucket,
            Key=analysis_key,
            Body=result.encode("utf-8"),
            ContentType="text/plain; charset=utf-8",
        )

        return {
            "bucket": output_bucket,
            "analysis_key": analysis_key,
            "status": "completed",
            "structured": False,
        }
