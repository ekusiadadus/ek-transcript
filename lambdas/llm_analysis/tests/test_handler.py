"""
LLMAnalysis Lambda のテスト

第5原則: テストファースト
"""

import importlib.util
import json
import sys
from collections.abc import Generator
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

# このLambdaのlambda_function.pyを動的にインポート
LAMBDA_DIR = Path(__file__).parent.parent
spec = importlib.util.spec_from_file_location(
    "llm_analysis_lambda", LAMBDA_DIR / "lambda_function.py"
)
if spec and spec.loader:
    lambda_module = importlib.util.module_from_spec(spec)
    sys.modules["llm_analysis_lambda"] = lambda_module
    spec.loader.exec_module(lambda_module)


class TestLLMAnalysis:
    """LLM分析機能のテスト"""

    @pytest.fixture
    def mock_s3(self) -> Generator[MagicMock, None, None]:
        """S3 クライアントのモック"""
        with patch.object(lambda_module, "s3") as mock:
            mock.get_object.return_value = {
                "Body": MagicMock(
                    read=lambda: json.dumps(
                        [
                            {"speaker": "SPEAKER_00", "start": 0.0, "end": 5.0, "text": "こんにちは"},
                            {"speaker": "SPEAKER_01", "start": 5.5, "end": 10.0, "text": "はい、こんにちは"},
                        ]
                    ).encode()
                )
            }
            yield mock

    @pytest.fixture
    def mock_openai(self) -> Generator[MagicMock, None, None]:
        """OpenAI クライアントのモック"""
        with patch.object(lambda_module, "get_openai_client") as mock:
            client = MagicMock()
            response = MagicMock()
            response.choices = [MagicMock(message=MagicMock(content="これは要約です。"))]
            client.chat.completions.create.return_value = response
            mock.return_value = client
            yield mock

    def test_lambda_handler_success(
        self, mock_s3: MagicMock, mock_openai: MagicMock
    ) -> None:
        """正常系: LLM分析が成功すること"""
        event = {
            "bucket": "test-bucket",
            "transcript_key": "transcripts/test_transcript.json",
        }
        context = MagicMock()

        result = lambda_module.lambda_handler(event, context)

        assert result["bucket"] == "test-bucket"
        assert "analysis_key" in result

    def test_lambda_handler_custom_prompt(
        self, mock_s3: MagicMock, mock_openai: MagicMock
    ) -> None:
        """カスタムプロンプトが使用されること"""
        event = {
            "bucket": "test-bucket",
            "transcript_key": "transcripts/test_transcript.json",
            "prompt": "アクションアイテムを抽出してください",
        }
        context = MagicMock()

        lambda_module.lambda_handler(event, context)

        # OpenAI API が呼び出されたことを確認
        mock_openai.return_value.chat.completions.create.assert_called_once()
