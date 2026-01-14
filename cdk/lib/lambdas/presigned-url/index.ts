import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";

const s3Client = new S3Client({});
const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const VIDEO_URL_EXPIRATION_SECONDS = 3600; // 1 hour

const ALLOWED_CONTENT_TYPES = [
  "video/mp4",
  "video/quicktime",
  "video/x-msvideo",
  "video/webm",
];

const EXPIRATION_SECONDS = 3600; // 1 hour

interface AppSyncEvent {
  arguments: {
    fileName?: string;
    contentType?: string;
    segment?: string;
  };
  identity: {
    sub?: string;
    username?: string;
  } | null;
}

interface UploadUrlResponse {
  uploadUrl: string;
  key: string;
  expiresIn: number;
}

export async function handler(event: AppSyncEvent): Promise<UploadUrlResponse> {
  const { arguments: args, identity } = event;

  // Validate authentication
  if (!identity?.sub) {
    throw new Error("Unauthorized");
  }

  // Validate required fields
  if (!args.fileName) {
    throw new Error("fileName is required");
  }

  // Handle null values explicitly (GraphQL may pass null instead of undefined)
  const fileName = args.fileName;
  const contentType = args.contentType || "video/mp4";
  const segment = args.segment || "unknown";

  // Validate content type
  if (!ALLOWED_CONTENT_TYPES.includes(contentType)) {
    throw new Error(
      `Invalid content type: ${contentType}. Allowed types: ${ALLOWED_CONTENT_TYPES.join(", ")}`
    );
  }

  // Generate unique key
  const fileExtension = fileName.split(".").pop() || "mp4";
  const uniqueId = randomUUID();
  const timestamp = new Date().toISOString().split("T")[0];
  const key = `uploads/${identity.sub}/${timestamp}/${segment}/${uniqueId}.${fileExtension}`;

  const bucketName = process.env.BUCKET_NAME;
  if (!bucketName) {
    throw new Error("BUCKET_NAME environment variable is not set");
  }

  const tableName = process.env.TABLE_NAME;
  if (!tableName) {
    throw new Error("TABLE_NAME environment variable is not set");
  }

  // Create presigned URL (no metadata to avoid signature mismatch)
  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(s3Client, command, {
    expiresIn: EXPIRATION_SECONDS,
  });

  // Save upload metadata to DynamoDB for later retrieval by start-pipeline
  // Using special prefix "upload_" to distinguish from interview records
  await docClient.send(new PutCommand({
    TableName: tableName,
    Item: {
      interview_id: `upload_${key}`,
      segment: segment,
      original_filename: fileName,
      user_id: identity.sub,
      s3_key: key,
      created_at: new Date().toISOString(),
      ttl: Math.floor(Date.now() / 1000) + 86400, // Expire in 24 hours
    },
  }));

  return {
    uploadUrl,
    key,
    expiresIn: EXPIRATION_SECONDS,
  };
}

// GET Video URL handler
interface GetVideoUrlEvent {
  arguments: {
    key?: string;
  };
  identity: {
    sub?: string;
    username?: string;
  } | null;
}

interface VideoUrlResponse {
  videoUrl: string;
  expiresIn: number;
}

// Allowed prefixes for content access
const ALLOWED_INPUT_PREFIXES = ["uploads/"];
const ALLOWED_OUTPUT_PREFIXES = ["analysis/", "transcripts/"];

export async function getVideoUrlHandler(event: GetVideoUrlEvent): Promise<VideoUrlResponse> {
  const { arguments: args, identity } = event;

  // Validate authentication
  if (!identity?.sub) {
    throw new Error("Unauthorized");
  }

  // Validate required fields
  if (!args.key) {
    throw new Error("key is required");
  }

  const { key } = args;

  // Determine which bucket to use based on key prefix
  const isInputContent = ALLOWED_INPUT_PREFIXES.some(prefix => key.startsWith(prefix));
  const isOutputContent = ALLOWED_OUTPUT_PREFIXES.some(prefix => key.startsWith(prefix));

  if (!isInputContent && !isOutputContent) {
    throw new Error("Invalid key: Access denied");
  }

  // Use appropriate bucket
  let bucketName: string | undefined;
  if (isOutputContent) {
    bucketName = process.env.OUTPUT_BUCKET_NAME;
    if (!bucketName) {
      throw new Error("OUTPUT_BUCKET_NAME environment variable is not set");
    }
  } else {
    bucketName = process.env.BUCKET_NAME;
    if (!bucketName) {
      throw new Error("BUCKET_NAME environment variable is not set");
    }
  }

  // Create presigned GET URL
  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: key,
  });

  const videoUrl = await getSignedUrl(s3Client, command, {
    expiresIn: VIDEO_URL_EXPIRATION_SECONDS,
  });

  return {
    videoUrl,
    expiresIn: VIDEO_URL_EXPIRATION_SECONDS,
  };
}
