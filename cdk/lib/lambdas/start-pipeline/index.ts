import { SFNClient, StartExecutionCommand } from "@aws-sdk/client-sfn";
import { randomUUID } from "crypto";

const sfnClient = new SFNClient({});

const VIDEO_EXTENSIONS = [".mp4", ".mov", ".avi", ".webm", ".mkv"];

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

interface StartPipelineResponse {
  statusCode: number;
  body: string;
}

function isVideoFile(key: string): boolean {
  const lowerKey = key.toLowerCase();
  return VIDEO_EXTENSIONS.some((ext) => lowerKey.endsWith(ext));
}

function parseS3Key(key: string): {
  userId: string;
  date: string;
  segment: string;
  fileName: string;
} {
  // Expected format: uploads/{userId}/{date}/{segment}/{fileName}
  const parts = key.split("/");
  if (parts.length >= 5) {
    return {
      userId: parts[1],
      date: parts[2],
      segment: parts[3],
      fileName: parts.slice(4).join("/"),
    };
  }
  return {
    userId: "unknown",
    date: new Date().toISOString().split("T")[0],
    segment: "unknown",
    fileName: parts[parts.length - 1],
  };
}

export async function handler(event: S3Event): Promise<StartPipelineResponse> {
  const stateMachineArn = process.env.STATE_MACHINE_ARN;

  if (!stateMachineArn) {
    throw new Error("STATE_MACHINE_ARN environment variable is not set");
  }

  const results: string[] = [];

  for (const record of event.Records) {
    const bucket = record.s3.bucket.name;
    const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, " "));
    const size = record.s3.object.size;

    // Skip non-video files
    if (!isVideoFile(key)) {
      results.push(`Skipped non-video file: ${key}`);
      continue;
    }

    const { userId, date, segment, fileName } = parseS3Key(key);
    const interviewId = randomUUID();

    const input = {
      interview_id: interviewId,
      bucket: bucket,
      video_key: key,
      user_id: userId,
      segment: segment,
      file_name: fileName,
      file_size: size,
      upload_date: date,
      created_at: new Date().toISOString(),
    };

    const command = new StartExecutionCommand({
      stateMachineArn: stateMachineArn,
      name: `interview-${interviewId}`,
      input: JSON.stringify(input),
    });

    const response = await sfnClient.send(command);

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
