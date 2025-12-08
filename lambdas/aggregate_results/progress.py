"""
Progress tracking utility for Lambda functions.

Provides DynamoDB-based progress updates for the interview processing pipeline.
"""

import logging
import os
from datetime import datetime, timezone
from typing import Optional

import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger(__name__)

# Step to progress mapping
STEP_PROGRESS = {
    "queued": 0,
    "extracting_audio": 10,
    "chunking_audio": 15,
    "diarizing": 30,
    "merging_speakers": 45,
    "splitting_by_speaker": 50,
    "transcribing": 70,
    "aggregating_results": 85,
    "analyzing": 95,
    "completed": 100,
}

# DynamoDB client (initialized lazily)
_dynamodb_client = None


def get_dynamodb_client():
    """Get or create DynamoDB client."""
    global _dynamodb_client
    if _dynamodb_client is None:
        _dynamodb_client = boto3.client("dynamodb")
    return _dynamodb_client


def update_progress(
    interview_id: str,
    step: str,
    progress: Optional[int] = None,
    table_name: Optional[str] = None,
) -> bool:
    """
    Update interview progress in DynamoDB.

    Args:
        interview_id: The interview ID to update
        step: The current step name (e.g., "extracting_audio", "diarizing")
        progress: Optional explicit progress value (0-100). If not provided,
                  will be derived from step name using STEP_PROGRESS mapping.
        table_name: Optional table name. If not provided, uses TABLE_NAME env var.

    Returns:
        True if update succeeded, False otherwise.
    """
    if not interview_id:
        logger.warning("Cannot update progress: interview_id is required")
        return False

    table = table_name or os.environ.get("TABLE_NAME")
    if not table:
        logger.warning("Cannot update progress: TABLE_NAME not configured")
        return False

    # Determine progress value
    if progress is None:
        progress = STEP_PROGRESS.get(step, 0)

    now = datetime.now(timezone.utc).isoformat()

    try:
        client = get_dynamodb_client()
        client.update_item(
            TableName=table,
            Key={"interview_id": {"S": interview_id}},
            UpdateExpression="SET #progress = :progress, #current_step = :step, #updated_at = :updated_at",
            ExpressionAttributeNames={
                "#progress": "progress",
                "#current_step": "current_step",
                "#updated_at": "updated_at",
            },
            ExpressionAttributeValues={
                ":progress": {"N": str(progress)},
                ":step": {"S": step},
                ":updated_at": {"S": now},
            },
        )
        logger.info(f"Updated progress for {interview_id}: step={step}, progress={progress}%")
        return True
    except ClientError as e:
        logger.error(f"Failed to update progress for {interview_id}: {e}")
        return False
    except Exception as e:
        logger.error(f"Unexpected error updating progress for {interview_id}: {e}")
        return False


def get_interview_id_from_event(event: dict) -> Optional[str]:
    """
    Extract interview_id from Lambda event.

    Handles various event formats from Step Functions.

    Args:
        event: Lambda event dict

    Returns:
        interview_id if found, None otherwise
    """
    # Direct interview_id
    if "interview_id" in event:
        return event["interview_id"]

    # Nested in input (from Step Functions)
    if "input" in event and isinstance(event["input"], dict):
        return event["input"].get("interview_id")

    return None
