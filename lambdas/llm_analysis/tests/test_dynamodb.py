"""
DynamoDB 保存機能のテスト

第5原則: テストファースト
分析結果を DynamoDB に保存する機能のテスト。
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

# Lambda ディレクトリをパスに追加（models モジュールを見つけるため）
sys.path.insert(0, str(LAMBDA_DIR))

spec = importlib.util.spec_from_file_location(
    "llm_analysis_lambda", LAMBDA_DIR / "lambda_function.py"
)
if spec and spec.loader:
    lambda_module = importlib.util.module_from_spec(spec)
    sys.modules["llm_analysis_lambda"] = lambda_module
    spec.loader.exec_module(lambda_module)


class TestDynamoDBSave:
    """DynamoDB 保存機能のテスト"""

    @pytest.fixture
    def mock_s3(self) -> Generator[MagicMock, None, None]:
        """S3 クライアントのモック"""
        with patch.object(lambda_module, "s3") as mock:
            mock.get_object.return_value = {
                "Body": MagicMock(
                    read=lambda: json.dumps(
                        [
                            {"speaker": "SPEAKER_00", "start": 0.0, "end": 5.0, "text": "こんにちは"},
                            {"speaker": "SPEAKER_01", "start": 5.5, "end": 10.0, "text": "電気代が高いです"},
                        ]
                    ).encode()
                )
            }
            yield mock

    @pytest.fixture
    def mock_dynamodb(self) -> Generator[MagicMock, None, None]:
        """DynamoDB クライアントのモック"""
        with patch.object(lambda_module, "dynamodb") as mock:
            mock.put_item.return_value = {}
            yield mock

    @pytest.fixture
    def mock_openai_structured(self) -> Generator[MagicMock, None, None]:
        """OpenAI Structured Output のモック"""
        with patch.object(lambda_module, "get_openai_client") as mock:
            client = MagicMock()

            # Structured output のモック
            parsed_data = MagicMock()
            parsed_data.scoring = MagicMock()
            parsed_data.scoring.total_score = 19
            parsed_data.scoring.segment = "A"
            parsed_data.model_dump_json.return_value = json.dumps({
                "interview_id": "test-interview-001",
                "scoring": {"total_score": 19, "segment": "A"},
            })

            message = MagicMock()
            message.parsed = parsed_data
            message.refusal = None

            choice = MagicMock()
            choice.message = message

            completion = MagicMock()
            completion.choices = [choice]

            client.beta.chat.completions.parse.return_value = completion
            mock.return_value = client
            yield mock

    def test_save_to_dynamodb_after_structured_analysis(
        self,
        mock_s3: MagicMock,
        mock_dynamodb: MagicMock,
        mock_openai_structured: MagicMock,
    ) -> None:
        """構造化分析後に DynamoDB に保存されること"""
        # 環境変数を設定
        with patch.object(lambda_module, "INTERVIEWS_TABLE_NAME", "test-interviews-table"):
            event = {
                "bucket": "test-bucket",
                "transcript_key": "transcripts/test_transcript.json",
                "structured": True,
                "interview_id": "test-interview-001",
            }
            context = MagicMock()

            result = lambda_module.lambda_handler(event, context)

            # DynamoDB put_item が呼ばれたことを確認
            mock_dynamodb.put_item.assert_called_once()

            # 結果に interview_id が含まれること
            assert result["status"] == "completed"
            assert result["structured"] is True

    def test_dynamodb_item_contains_required_fields(
        self,
        mock_s3: MagicMock,
        mock_dynamodb: MagicMock,
        mock_openai_structured: MagicMock,
    ) -> None:
        """DynamoDB に保存されるアイテムに必須フィールドが含まれること"""
        with patch.object(lambda_module, "INTERVIEWS_TABLE_NAME", "test-interviews-table"):
            event = {
                "bucket": "test-bucket",
                "transcript_key": "transcripts/test_transcript.json",
                "structured": True,
                "interview_id": "test-interview-001",
                "video_key": "videos/test.mp4",
                "diarization_key": "diarization/test.json",
            }
            context = MagicMock()

            lambda_module.lambda_handler(event, context)

            # put_item の引数を検証
            call_args = mock_dynamodb.put_item.call_args
            item = call_args.kwargs.get("Item", call_args[1].get("Item", {}))

            # 必須フィールドが含まれていること
            assert "interview_id" in item
            assert "segment" in item
            assert "created_at" in item
            assert "analysis_key" in item

    def test_dynamodb_save_includes_s3_links(
        self,
        mock_s3: MagicMock,
        mock_dynamodb: MagicMock,
        mock_openai_structured: MagicMock,
    ) -> None:
        """DynamoDB に S3 リンクが保存されること"""
        with patch.object(lambda_module, "INTERVIEWS_TABLE_NAME", "test-interviews-table"):
            event = {
                "bucket": "test-bucket",
                "transcript_key": "transcripts/test_transcript.json",
                "structured": True,
                "interview_id": "test-interview-001",
                "video_key": "videos/test.mp4",
                "diarization_key": "diarization/test.json",
            }
            context = MagicMock()

            lambda_module.lambda_handler(event, context)

            call_args = mock_dynamodb.put_item.call_args
            item = call_args.kwargs.get("Item", call_args[1].get("Item", {}))

            # S3 リンクフィールドが含まれていること
            assert "transcript_key" in item
            # video_key と diarization_key はオプションだが渡されていれば保存される
            assert "video_key" in item
            assert "diarization_key" in item

    def test_no_dynamodb_save_when_table_not_configured(
        self,
        mock_s3: MagicMock,
        mock_dynamodb: MagicMock,
        mock_openai_structured: MagicMock,
    ) -> None:
        """INTERVIEWS_TABLE_NAME が未設定の場合は DynamoDB 保存をスキップ"""
        with patch.object(lambda_module, "INTERVIEWS_TABLE_NAME", ""):
            event = {
                "bucket": "test-bucket",
                "transcript_key": "transcripts/test_transcript.json",
                "structured": True,
            }
            context = MagicMock()

            result = lambda_module.lambda_handler(event, context)

            # DynamoDB put_item が呼ばれないこと
            mock_dynamodb.put_item.assert_not_called()

            # 分析は成功すること
            assert result["status"] == "completed"
