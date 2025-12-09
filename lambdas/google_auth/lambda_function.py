"""
Google OAuth 認証 Lambda

OAuth 2.0 Authorization Code Flow を処理し、
トークンを KMS で暗号化して DynamoDB に保存する。

Version: 1.1
"""

import json
import logging
import os
from datetime import datetime, timezone
from functools import lru_cache

import boto3
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow

# ロガー設定
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# AWS クライアント
dynamodb = boto3.resource("dynamodb")
kms = boto3.client("kms")
secretsmanager = boto3.client("secretsmanager")

# 環境変数
GOOGLE_OAUTH_SECRET_ARN = os.environ.get("GOOGLE_OAUTH_SECRET_ARN", "")
KMS_KEY_ID = os.environ.get("KMS_KEY_ID", "")
TOKENS_TABLE = os.environ.get("TOKENS_TABLE", "")


@lru_cache(maxsize=1)
def _get_google_oauth_credentials() -> tuple[str, str]:
    """
    Secrets Manager から Google OAuth 認証情報を取得（キャッシュ付き）

    Returns:
        tuple: (client_id, client_secret)
    """
    if not GOOGLE_OAUTH_SECRET_ARN:
        raise ValueError("GOOGLE_OAUTH_SECRET_ARN environment variable is not set")

    logger.info("Fetching Google OAuth credentials from Secrets Manager")
    response = secretsmanager.get_secret_value(SecretId=GOOGLE_OAUTH_SECRET_ARN)
    secret = json.loads(response["SecretString"])

    client_id = secret.get("client_id", "")
    client_secret = secret.get("client_secret", "")

    if not client_id or not client_secret:
        raise ValueError("Google OAuth credentials not found in secret")

    return client_id, client_secret

# Google OAuth スコープ
# Note: openid is automatically added by Google, so we include it explicitly
SCOPES = [
    "openid",
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/meetings.space.settings",  # 自動録画設定用
    "https://www.googleapis.com/auth/meetings.space.readonly",  # 会議記録・録画取得用
    "https://www.googleapis.com/auth/drive.readonly",  # 録画ファイルダウンロード用
    "https://www.googleapis.com/auth/userinfo.email",
]


def _get_client_config() -> dict:
    """OAuth クライアント設定を取得"""
    client_id, client_secret = _get_google_oauth_credentials()
    return {
        "web": {
            "client_id": client_id,
            "client_secret": client_secret,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
        }
    }


def get_auth_url(redirect_uri: str, state: str) -> str:
    """
    OAuth 認証 URL を生成

    Args:
        redirect_uri: コールバック URI
        state: CSRF 防止用の状態トークン

    Returns:
        認証 URL
    """
    logger.info(f"Generating auth URL for redirect_uri: {redirect_uri}")

    flow = Flow.from_client_config(
        _get_client_config(),
        scopes=SCOPES,
        redirect_uri=redirect_uri,
    )

    auth_url, _ = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent",
        state=state,
    )

    logger.info("Auth URL generated successfully")
    return auth_url


def exchange_code(code: str, redirect_uri: str) -> dict:
    """
    認証コードをトークンに交換

    Args:
        code: 認証コード
        redirect_uri: コールバック URI

    Returns:
        トークン情報
    """
    logger.info("Exchanging authorization code for tokens")

    flow = Flow.from_client_config(
        _get_client_config(),
        scopes=SCOPES,
        redirect_uri=redirect_uri,
    )

    flow.fetch_token(code=code)
    credentials = flow.credentials

    logger.info("Token exchange successful")

    return {
        "access_token": credentials.token,
        "refresh_token": credentials.refresh_token,
        "expires_at": credentials.expiry.isoformat() if credentials.expiry else None,
        "scopes": list(credentials.scopes) if credentials.scopes else [],
    }


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


def save_tokens(user_id: str, email: str, tokens: dict) -> None:
    """
    トークンを DynamoDB に保存（暗号化）

    Args:
        user_id: ユーザー ID
        email: メールアドレス
        tokens: トークン情報
    """
    logger.info(f"Saving tokens for user: {user_id}")

    table = dynamodb.Table(TOKENS_TABLE)

    expires_at = None
    if tokens.get("expires_at"):
        expires_at = int(datetime.fromisoformat(tokens["expires_at"]).timestamp())

    table.put_item(
        Item={
            "user_id": user_id,
            "email": email,
            "access_token": encrypt_token(tokens["access_token"]),
            "refresh_token": encrypt_token(tokens["refresh_token"])
            if tokens.get("refresh_token")
            else None,
            "scopes": tokens.get("scopes", []),
            "expires_at": expires_at,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
    )

    logger.info(f"Tokens saved successfully for user: {user_id}")


def get_tokens(user_id: str) -> dict:
    """
    ユーザーのトークンを取得（復号化）

    Args:
        user_id: ユーザー ID

    Returns:
        トークン情報
    """
    logger.info(f"Getting tokens for user: {user_id}")

    table = dynamodb.Table(TOKENS_TABLE)
    response = table.get_item(Key={"user_id": user_id})

    if "Item" not in response:
        logger.warning(f"No tokens found for user: {user_id}")
        return None

    item = response["Item"]

    return {
        "user_id": item["user_id"],
        "email": item.get("email"),
        "access_token": decrypt_token(item["access_token"]),
        "refresh_token": decrypt_token(item["refresh_token"])
        if item.get("refresh_token")
        else None,
        "scopes": item.get("scopes", []),
        "expires_at": item.get("expires_at"),
    }


def revoke_tokens(user_id: str) -> None:
    """
    ユーザーのトークンを削除

    Args:
        user_id: ユーザー ID
    """
    logger.info(f"Revoking tokens for user: {user_id}")

    table = dynamodb.Table(TOKENS_TABLE)
    table.delete_item(Key={"user_id": user_id})

    logger.info(f"Tokens revoked for user: {user_id}")


def lambda_handler(event: dict, context) -> dict:
    """
    Lambda ハンドラー

    サポートするアクション:
    - get_auth_url: OAuth 認証 URL を生成
    - exchange_code: 認証コードをトークンに交換して保存
    - get_tokens: ユーザーのトークンを取得
    - revoke_tokens: ユーザーのトークンを削除
    """
    action = event.get("action")
    logger.info(f"Processing action: {action}")

    try:
        if action == "get_auth_url":
            redirect_uri = event["redirect_uri"]
            state = event["state"]
            auth_url = get_auth_url(redirect_uri, state)
            return {"auth_url": auth_url}

        elif action == "exchange_code":
            code = event["code"]
            redirect_uri = event["redirect_uri"]
            user_id = event["user_id"]
            email = event["email"]

            tokens = exchange_code(code, redirect_uri)
            save_tokens(user_id, email, tokens)

            return {"success": True}

        elif action == "get_tokens":
            user_id = event["user_id"]
            tokens = get_tokens(user_id)

            if tokens is None:
                return {"success": False, "error": "Tokens not found"}

            return {"success": True, "tokens": tokens}

        elif action == "revoke_tokens":
            user_id = event["user_id"]
            revoke_tokens(user_id)

            return {"success": True}

        elif action == "check_status":
            user_id = event["user_id"]
            tokens = get_tokens(user_id)

            if tokens is None:
                return {
                    "connected": False,
                    "email": None,
                    "scopes": [],
                    "expires_at": None,
                    "is_expired": None,
                }

            # 期限を確認
            is_expired = False
            expires_at_iso = None
            if tokens.get("expires_at"):
                from datetime import datetime, timezone
                # DynamoDB returns Decimal, convert to int for fromtimestamp
                expires_at = datetime.fromtimestamp(int(tokens["expires_at"]), tz=timezone.utc)
                is_expired = expires_at < datetime.now(timezone.utc)
                expires_at_iso = expires_at.isoformat()

            return {
                "connected": True,
                "email": tokens.get("email"),
                "scopes": tokens.get("scopes", []),
                "expires_at": expires_at_iso,
                "is_expired": is_expired,
            }

        else:
            return {"error": f"Unknown action: {action}"}

    except Exception as e:
        logger.error(f"Error processing action {action}: {e}", exc_info=True)
        return {"error": str(e)}
