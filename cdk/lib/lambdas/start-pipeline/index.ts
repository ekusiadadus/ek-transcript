import { SFNClient, StartExecutionCommand } from "@aws-sdk/client-sfn";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, GetCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "crypto";

const sfnClient = new SFNClient({});
const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const VIDEO_EXTENSIONS = [".mp4", ".mov", ".avi", ".webm", ".mkv"];

// S3 Event Notification format
interface S3Event {
  Records: Array<{
    s3: {
      bucket: {
        name: string;
      };
      object: {
        key: string;
        size: number;
      };
    };
  }>;
}

// EventBridge S3 event format
interface EventBridgeS3Event {
  source: string;
  "detail-type": string;
  detail: {
    bucket: {
      name: string;
    };
    object: {
      key: string;
      size: number;
    };
  };
}

type PipelineEvent = S3Event | EventBridgeS3Event;

interface StartPipelineResponse {
  statusCode: number;
  body: string;
}

function isVideoFile(key: string): boolean {
  const lowerKey = key.toLowerCase();
  return VIDEO_EXTENSIONS.some((ext) => lowerKey.endsWith(ext));
}

interface ParsedS3Key {
  userId: string;
  date: string;
  segment: string;
  fileName: string;
  meetingId?: string;
  isRecording: boolean;
}

function parseS3Key(key: string): ParsedS3Key {
  const parts = key.split("/");
  const prefix = parts[0];

  // Format: recordings/{userId}/{meetingId}/{fileName}
  if (prefix === "recordings" && parts.length >= 4) {
    return {
      userId: parts[1],
      date: new Date().toISOString().split("T")[0],
      segment: "MEETING",
      fileName: parts.slice(3).join("/"),
      meetingId: parts[2],
      isRecording: true,
    };
  }

  // Format: uploads/{userId}/{date}/{segment}/{fileName}
  if (parts.length >= 5) {
    return {
      userId: parts[1],
      date: parts[2],
      segment: parts[3],
      fileName: parts.slice(4).join("/"),
      isRecording: false,
    };
  }

  return {
    userId: "unknown",
    date: new Date().toISOString().split("T")[0],
    segment: "unknown",
    fileName: parts[parts.length - 1],
    isRecording: false,
  };
}

function isEventBridgeEvent(event: PipelineEvent): event is EventBridgeS3Event {
  return "source" in event && event.source === "aws.s3";
}

function extractS3Info(event: PipelineEvent): Array<{ bucket: string; key: string; size: number }> {
  if (isEventBridgeEvent(event)) {
    // EventBridge format
    return [{
      bucket: event.detail.bucket.name,
      key: event.detail.object.key,
      size: event.detail.object.size,
    }];
  } else {
    // S3 Event Notification format
    return event.Records.map((record) => ({
      bucket: record.s3.bucket.name,
      key: decodeURIComponent(record.s3.object.key.replace(/\+/g, " ")),
      size: record.s3.object.size,
    }));
  }
}

export async function handler(event: PipelineEvent): Promise<StartPipelineResponse> {
  const stateMachineArn = process.env.STATE_MACHINE_ARN;
  const tableName = process.env.TABLE_NAME;

  if (!stateMachineArn) {
    throw new Error("STATE_MACHINE_ARN environment variable is not set");
  }

  if (!tableName) {
    throw new Error("TABLE_NAME environment variable is not set");
  }

  const results: string[] = [];
  const s3Objects = extractS3Info(event);

  for (const { bucket, key, size } of s3Objects) {

    // Skip non-video files
    if (!isVideoFile(key)) {
      results.push(`Skipped non-video file: ${key}`);
      continue;
    }

    const { userId, date, segment, fileName: keyFileName, meetingId, isRecording } = parseS3Key(key);
    const interviewId = randomUUID();
    const createdAt = new Date().toISOString();

    // Get original filename and project_id from DynamoDB upload metadata
    let originalFileName = keyFileName;
    let projectId: string | undefined;
    try {
      const uploadMetadataKey = `upload_${key}`;
      const getResponse = await docClient.send(new GetCommand({
        TableName: tableName,
        Key: { interview_id: uploadMetadataKey },
      }));
      if (getResponse.Item?.original_filename) {
        originalFileName = getResponse.Item.original_filename;
      }
      if (getResponse.Item?.project_id) {
        projectId = getResponse.Item.project_id;
      }
      // Clean up the temporary upload metadata record
      if (getResponse.Item) {
        await docClient.send(new DeleteCommand({
          TableName: tableName,
          Key: { interview_id: uploadMetadataKey },
        }));
      }
    } catch (err) {
      // If metadata fetch fails, use key-based filename as fallback
      console.warn(`Failed to get upload metadata for ${key}:`, err);
    }

    const input: Record<string, unknown> = {
      interview_id: interviewId,
      bucket: bucket,
      video_key: key,
      user_id: userId,
      segment: segment,
      file_name: originalFileName,
      file_size: size,
      upload_date: date,
      created_at: createdAt,
    };

    // Add project_id if available
    if (projectId) {
      input.project_id = projectId;
    }

    // Add meeting_id for recording files
    if (isRecording && meetingId) {
      input.meeting_id = meetingId;
    }

    // Start Step Functions execution
    const command = new StartExecutionCommand({
      stateMachineArn: stateMachineArn,
      name: `interview-${interviewId}`,
      input: JSON.stringify(input),
    });

    const response = await sfnClient.send(command);

    // Save interview record to DynamoDB with initial progress
    const interviewItem: Record<string, unknown> = {
      interview_id: interviewId,
      user_id: userId,
      segment: segment,
      file_name: originalFileName,
      file_size: size,
      video_key: key,
      bucket: bucket,
      status: "processing",
      progress: 0,
      current_step: "queued",
      execution_arn: response.executionArn,
      created_at: createdAt,
      updated_at: createdAt,
    };

    // Add project_id if available
    if (projectId) {
      interviewItem.project_id = projectId;
    }

    // Add meeting_id for recording files
    if (isRecording && meetingId) {
      interviewItem.meeting_id = meetingId;
    }

    await docClient.send(new PutCommand({
      TableName: tableName,
      Item: interviewItem,
    }));

    results.push(
      JSON.stringify({
        status: "started",
        interview_id: interviewId,
        user_id: userId,
        segment: segment,
        execution_arn: response.executionArn,
      })
    );
  }

  if (results.length === 0) {
    return {
      statusCode: 200,
      body: JSON.stringify({ message: "No records to process" }),
    };
  }

  if (results.every((r) => r.includes("skipped") || r.includes("Skipped"))) {
    return {
      statusCode: 200,
      body: JSON.stringify({ message: "All files skipped", details: results }),
    };
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ executions: results }),
  };
}
