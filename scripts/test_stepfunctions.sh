#!/bin/bash
# Step Functions テスト実行スクリプト
# チャンク並列処理の動作確認用

set -e

REGION="ap-northeast-1"
STATE_MACHINE_ARN="arn:aws:states:ap-northeast-1:340158431287:stateMachine:ek-transcript-pipeline-dev"
INPUT_BUCKET="ek-transcript-input-dev-340158431287"
VIDEO_KEY="hems-user-interview.mp4"

echo "=========================================="
echo "Step Functions テスト実行"
echo "=========================================="
echo "State Machine: $STATE_MACHINE_ARN"
echo "Input: s3://$INPUT_BUCKET/$VIDEO_KEY"
echo ""

# 入力JSON
INPUT_JSON=$(cat <<EOF
{
  "bucket": "$INPUT_BUCKET",
  "video_key": "$VIDEO_KEY"
}
EOF
)

echo "Input JSON:"
echo "$INPUT_JSON"
echo ""

# Step Functions 実行開始
echo "Starting execution..."
EXECUTION_RESULT=$(aws stepfunctions start-execution \
  --state-machine-arn "$STATE_MACHINE_ARN" \
  --input "$INPUT_JSON" \
  --region "$REGION")

EXECUTION_ARN=$(echo "$EXECUTION_RESULT" | jq -r '.executionArn')
echo "Execution ARN: $EXECUTION_ARN"
echo ""

# ステータス確認ループ
echo "Monitoring execution status..."
echo ""

while true; do
  STATUS_RESULT=$(aws stepfunctions describe-execution \
    --execution-arn "$EXECUTION_ARN" \
    --region "$REGION")

  STATUS=$(echo "$STATUS_RESULT" | jq -r '.status')
  START_DATE=$(echo "$STATUS_RESULT" | jq -r '.startDate')

  echo "[$(date '+%H:%M:%S')] Status: $STATUS"

  if [ "$STATUS" = "SUCCEEDED" ]; then
    echo ""
    echo "=========================================="
    echo "✅ Execution SUCCEEDED!"
    echo "=========================================="
    echo "Output:"
    echo "$STATUS_RESULT" | jq '.output | fromjson'
    break
  elif [ "$STATUS" = "FAILED" ] || [ "$STATUS" = "TIMED_OUT" ] || [ "$STATUS" = "ABORTED" ]; then
    echo ""
    echo "=========================================="
    echo "❌ Execution $STATUS"
    echo "=========================================="
    echo "Error:"
    echo "$STATUS_RESULT" | jq '{error: .error, cause: .cause}'

    # 実行履歴を取得してエラー詳細を表示
    echo ""
    echo "Execution History (last 10 events):"
    aws stepfunctions get-execution-history \
      --execution-arn "$EXECUTION_ARN" \
      --region "$REGION" \
      --max-results 10 \
      --reverse-order | jq '.events[] | {type: .type, timestamp: .timestamp}'

    exit 1
  fi

  sleep 30
done
