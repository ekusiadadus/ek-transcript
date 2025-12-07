import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";

const s3Client = new S3Client({});

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

  const { fileName, contentType = "video/mp4", segment = "unknown" } = args;

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

  // Create presigned URL
  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    ContentType: contentType,
    Metadata: {
      "user-id": identity.sub,
      segment: segment,
      "original-filename": fileName,
    },
  });

  const uploadUrl = await getSignedUrl(s3Client, command, {
    expiresIn: EXPIRATION_SECONDS,
  });

  return {
    uploadUrl,
    key,
    expiresIn: EXPIRATION_SECONDS,
  };
}
