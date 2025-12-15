import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  UpdateCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { SFNClient, GetExecutionHistoryCommand } from "@aws-sdk/client-sfn";

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const sfnClient = new SFNClient({});

// Version: 2025-12-11 - Added recordings table update logging

interface StepFunctionsEvent {
  source: string;
  "detail-type": string;
  detail: {
    executionArn: string;
    stateMachineArn: string;
    status: "SUCCEEDED" | "FAILED" | "TIMED_OUT" | "ABORTED";
    input: string;
    output?: string;
  };
}

interface ExecutionInput {
  interview_id?: string;
  user_id?: string;
  video_key?: string;
  bucket?: string;
  recording_name?: string;
}

interface ExecutionOutput {
  bucket?: string;
  analysis_key?: string;
  transcript_key?: string;
  status?: string;
  structured?: boolean;
  total_score?: number;
  segment?: string;
}

export async function handler(event: StepFunctionsEvent): Promise<void> {
  const tableName = process.env.TABLE_NAME;
  const recordingsTableName = process.env.RECORDINGS_TABLE;

  if (!tableName) {
    throw new Error("TABLE_NAME environment variable is not set");
  }

  const { executionArn, status, input, output } = event.detail;

  // Parse execution input to get interview_id
  let executionInput: ExecutionInput = {};
  try {
    executionInput = JSON.parse(input);
  } catch {
    console.warn("Failed to parse execution input:", input);
  }

  // Parse execution output to get analysis_key and transcript_key
  let executionOutput: ExecutionOutput = {};
  if (output) {
    try {
      executionOutput = JSON.parse(output);
    } catch {
      console.warn("Failed to parse execution output:", output);
    }
  }

  const interviewId = executionInput.interview_id;

  if (!interviewId) {
    console.warn("No interview_id found in execution input, skipping update");
    return;
  }

  console.log(`Processing completion event for interview: ${interviewId}, status: ${status}`);

  const now = new Date().toISOString();

  if (status === "SUCCEEDED") {
    // Build update expression dynamically based on available output
    const updateParts = [
      "#status = :status",
      "#progress = :progress",
      "#current_step = :current_step",
      "#updated_at = :updated_at",
    ];
    const expressionNames: Record<string, string> = {
      "#status": "status",
      "#progress": "progress",
      "#current_step": "current_step",
      "#updated_at": "updated_at",
    };
    const expressionValues: Record<string, unknown> = {
      ":status": "completed",
      ":progress": 100,
      ":current_step": "completed",
      ":updated_at": now,
    };

    // Add analysis_key if available from llm_analysis output
    if (executionOutput.analysis_key) {
      updateParts.push("analysis_key = :analysis_key");
      expressionValues[":analysis_key"] = executionOutput.analysis_key;
      console.log(`Adding analysis_key: ${executionOutput.analysis_key}`);
    }

    // Add transcript_key - derive from analysis_key if not directly available
    // llm_analysis outputs analysis_key, transcript is at transcripts/{base}_transcript.json
    if (executionOutput.analysis_key) {
      // Extract base name from analysis_key: analysis/xxx_structured.json -> xxx
      const analysisKey = executionOutput.analysis_key;
      const baseName = analysisKey
        .replace("analysis/", "")
        .replace("_structured.json", "")
        .replace("_analysis.txt", "");
      const transcriptKey = `transcripts/${baseName}_transcript.json`;
      updateParts.push("transcript_key = :transcript_key");
      expressionValues[":transcript_key"] = transcriptKey;
      console.log(`Adding transcript_key: ${transcriptKey}`);
    }

    // Add total_score if available
    if (executionOutput.total_score !== undefined) {
      updateParts.push("total_score = :total_score");
      expressionValues[":total_score"] = executionOutput.total_score;
    }

    // Update to completed status with analysis results
    await docClient.send(
      new UpdateCommand({
        TableName: tableName,
        Key: { interview_id: interviewId },
        UpdateExpression: "SET " + updateParts.join(", "),
        ExpressionAttributeNames: expressionNames,
        ExpressionAttributeValues: expressionValues,
      })
    );

    console.log(`Interview ${interviewId} marked as completed with analysis results`);

    // Update recordings table if applicable
    if (recordingsTableName && executionInput.user_id) {
      await updateRecordingsTable(
        recordingsTableName,
        executionInput.user_id,
        interviewId,
        "ANALYZED"
      );
    }
  } else if (status === "FAILED" || status === "TIMED_OUT" || status === "ABORTED") {
    // Get error details from execution history
    let errorMessage = "";

    if (status === "TIMED_OUT") {
      errorMessage = "Execution timed out";
    } else if (status === "ABORTED") {
      errorMessage = "Execution was aborted";
    } else {
      try {
        const historyResponse = await sfnClient.send(
          new GetExecutionHistoryCommand({
            executionArn,
            reverseOrder: true,
            maxResults: 10,
          })
        );

        // Find the failure event
        for (const historyEvent of historyResponse.events || []) {
          if (historyEvent.type === "ExecutionFailed") {
            const details = historyEvent.executionFailedEventDetails;
            if (details) {
              errorMessage = `${details.error || "Unknown error"}: ${details.cause || "No details"}`;
            }
            break;
          }
          if (historyEvent.type === "LambdaFunctionFailed") {
            const details = historyEvent.lambdaFunctionFailedEventDetails;
            if (details) {
              errorMessage = `Lambda error: ${details.error || "Unknown"} - ${details.cause || "No details"}`;
            }
            break;
          }
          if (historyEvent.type === "TaskFailed") {
            const details = historyEvent.taskFailedEventDetails;
            if (details) {
              errorMessage = `Task error: ${details.error || "Unknown"} - ${details.cause || "No details"}`;
            }
            break;
          }
        }
      } catch (err) {
        console.error("Failed to get execution history:", err);
        errorMessage = "Failed to retrieve error details";
      }
    }

    if (!errorMessage) {
      errorMessage = `Execution ${status.toLowerCase()}`;
    }

    // Update to failed status with error message
    await docClient.send(
      new UpdateCommand({
        TableName: tableName,
        Key: { interview_id: interviewId },
        UpdateExpression:
          "SET #status = :status, #error_message = :error_message, #updated_at = :updated_at",
        ExpressionAttributeNames: {
          "#status": "status",
          "#error_message": "error_message",
          "#updated_at": "updated_at",
        },
        ExpressionAttributeValues: {
          ":status": "failed",
          ":error_message": errorMessage,
          ":updated_at": now,
        },
      })
    );

    console.log(`Interview ${interviewId} marked as failed: ${errorMessage}`);

    // Update recordings table if applicable
    if (recordingsTableName && executionInput.user_id) {
      await updateRecordingsTable(
        recordingsTableName,
        executionInput.user_id,
        interviewId,
        "ERROR"
      );
    }
  }
}

/**
 * Update recordings table status based on interview_id
 * Searches for recordings with matching interview_id and updates their status
 */
async function updateRecordingsTable(
  tableName: string,
  userId: string,
  interviewId: string,
  newStatus: "ANALYZED" | "ERROR"
): Promise<void> {
  try {
    // Query recordings by user_id to find the one with matching interview_id
    const queryResult = await docClient.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: "user_id = :uid",
        FilterExpression: "interview_id = :iid",
        ExpressionAttributeValues: {
          ":uid": userId,
          ":iid": interviewId,
        },
      })
    );

    if (!queryResult.Items || queryResult.Items.length === 0) {
      console.log(`No recording found with interview_id: ${interviewId}`);
      return;
    }

    const now = new Date().toISOString();

    // Update each matching recording
    for (const item of queryResult.Items) {
      const recordingName = item.recording_name as string;
      await docClient.send(
        new UpdateCommand({
          TableName: tableName,
          Key: {
            user_id: userId,
            recording_name: recordingName,
          },
          UpdateExpression: "SET #status = :status, updated_at = :updated_at",
          ExpressionAttributeNames: {
            "#status": "status",
          },
          ExpressionAttributeValues: {
            ":status": newStatus,
            ":updated_at": now,
          },
        })
      );
      console.log(`Recording ${recordingName} marked as ${newStatus}`);
    }
  } catch (err) {
    console.error(`Failed to update recordings table:`, err);
    // Don't throw - this is a non-critical update
  }
}
