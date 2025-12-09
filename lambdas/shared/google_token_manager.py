"""
Google OAuth トークン管理

トークンの取得、復号化、更新を担当する共有モジュール。
複数の Lambda 関数から利用される。

Version: 1.1 - Fixed DynamoDB Decimal conversion
"""

import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Optional

import boto3
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials

# ロガー設定
logger = logging.getLogger(__name__)

# AWS クライアント
dynamodb = boto3.resource("dynamodb")
kms = boto3.client("kms")

# 環境変数
TOKENS_TABLE = os.environ.get("TOKENS_TABLE", "")
KMS_KEY_ID = os.environ.get("KMS_KEY_ID", "")
GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET", "")


class TokenNotFoundError(Exception):
    """トークンが見つからない場合の例外"""

    pass


class TokenRefreshError(Exception):
    """トークン更新失敗時の例外"""

    pass


def decrypt_token(encrypted_token: str) -> str:
    """
    KMS でトークンを復号化

    Args:
        encrypted_token: 暗号化されたトークン（hex エンコード）

    Returns:
        復号化されたトークン
    """
    response = kms.decrypt(
        CiphertextBlob=bytes.fromhex(encrypted_token),
        EncryptionContext={"purpose": "google-oauth-token"},
    )
    return response["Plaintext"].decode("utf-8")


def encrypt_token(token: str) -> str:
    """
    KMS でトークンを暗号化

    Args:
        token: 暗号化するトークン

    Returns:
        暗号化されたトークン（hex エンコード）
    """
    response = kms.encrypt(
        KeyId=KMS_KEY_ID,
        Plaintext=token.encode("utf-8"),
        EncryptionContext={"purpose": "google-oauth-token"},
    )
    return response["CiphertextBlob"].hex()


def get_stored_token(user_id: str) -> Optional[dict]:
    """
    DynamoDB からトークン情報を取得

    Args:
        user_id: ユーザー ID

    Returns:
        トークン情報の辞書、見つからない場合は None
    """
    table = dynamodb.Table(TOKENS_TABLE)
    response = table.get_item(Key={"user_id": user_id})

    if "Item" not in response:
        return None

    return response["Item"]


def save_updated_tokens(user_id: str, credentials: Credentials) -> None:
    """
    更新されたトークンを DynamoDB に保存

    Args:
        user_id: ユーザー ID
        credentials: Google 認証情報
    """
    table = dynamodb.Table(TOKENS_TABLE)

    expires_at = None
    if credentials.expiry:
        expires_at = int(credentials.expiry.timestamp())

    table.update_item(
        Key={"user_id": user_id},
        UpdateExpression="SET access_token = :at, expires_at = :exp, updated_at = :upd",
        ExpressionAttributeValues={
            ":at": encrypt_token(credentials.token),
            ":exp": expires_at,
            ":upd": datetime.now(timezone.utc).isoformat(),
        },
    )

    logger.info(f"Updated tokens for user: {user_id}")


def get_valid_credentials(user_id: str) -> Credentials:
    """
    有効な Google 認証情報を取得

    トークンが期限切れまたは5分以内に期限切れの場合は自動更新。

    Args:
        user_id: ユーザー ID

    Returns:
        有効な Google Credentials オブジェクト

    Raises:
        TokenNotFoundError: トークンが見つからない場合
        TokenRefreshError: トークン更新に失敗した場合
    """
    logger.info(f"Getting valid credentials for user: {user_id}")

    # DynamoDB からトークン取得
    item = get_stored_token(user_id)
    if not item:
        raise TokenNotFoundError(f"No tokens found for user: {user_id}")

    # トークンを復号化
    access_token = decrypt_token(item["access_token"])
    refresh_token = None
    if item.get("refresh_token"):
        refresh_token = decrypt_token(item["refresh_token"])

    # Credentials オブジェクト作成
    credentials = Credentials(
        token=access_token,
        refresh_token=refresh_token,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=GOOGLE_CLIENT_ID,
        client_secret=GOOGLE_CLIENT_SECRET,
        scopes=item.get("scopes", []),
    )

    # 期限を設定（timezone-naive で設定、google-auth の内部実装に合わせる）
    # DynamoDB returns Decimal, convert to int for fromtimestamp
    if item.get("expires_at"):
        credentials.expiry = datetime.utcfromtimestamp(int(item["expires_at"]))

    # トークンが期限切れまたは5分以内に期限切れの場合、更新
    needs_refresh = False
    if credentials.expired:
        needs_refresh = True
        logger.info("Token expired, refreshing...")
    elif credentials.expiry:
        # google-auth は utcnow() を使うので、timezone-naive で比較
        time_until_expiry = credentials.expiry - datetime.utcnow()
        if time_until_expiry < timedelta(minutes=5):
            needs_refresh = True
            logger.info(f"Token expires in {time_until_expiry}, refreshing...")

    if needs_refresh:
        if not refresh_token:
            raise TokenRefreshError(f"No refresh token available for user: {user_id}")

        try:
            credentials.refresh(Request())
            save_updated_tokens(user_id, credentials)
            logger.info(f"Token refreshed for user: {user_id}")
        except Exception as e:
            logger.error(f"Failed to refresh token for user {user_id}: {e}")
            raise TokenRefreshError(f"Failed to refresh token: {e}") from e

    return credentials


def check_token_status(user_id: str) -> dict:
    """
    ユーザーのトークン状態を確認

    Args:
        user_id: ユーザー ID

    Returns:
        トークン状態の辞書
    """
    item = get_stored_token(user_id)

    if not item:
        return {
            "connected": False,
            "user_id": user_id,
            "email": None,
            "scopes": [],
            "expires_at": None,
        }

    # 期限を確認
    # DynamoDB returns Decimal, convert to int for fromtimestamp
    expires_at = item.get("expires_at")
    is_expired = False
    if expires_at:
        is_expired = datetime.fromtimestamp(int(expires_at), tz=timezone.utc) < datetime.now(
            timezone.utc
        )

    return {
        "connected": True,
        "user_id": user_id,
        "email": item.get("email"),
        "scopes": item.get("scopes", []),
        "expires_at": datetime.fromtimestamp(int(expires_at), tz=timezone.utc).isoformat()
        if expires_at
        else None,
        "is_expired": is_expired,
        "has_refresh_token": bool(item.get("refresh_token")),
    }
