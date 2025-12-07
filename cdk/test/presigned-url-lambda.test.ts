import { handler } from "../lib/lambdas/presigned-url";

// Mock AWS SDK
jest.mock("@aws-sdk/client-s3", () => ({
  S3Client: jest.fn().mockImplementation(() => ({})),
  PutObjectCommand: jest.fn(),
}));

jest.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: jest.fn().mockResolvedValue("https://s3.example.com/presigned-url"),
}));

describe("Presigned URL Lambda", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV };
    process.env.BUCKET_NAME = "test-bucket";
    process.env.AWS_REGION = "ap-northeast-1";
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  it("should return presigned URL for valid input", async () => {
    const event = {
      arguments: {
        fileName: "test-video.mp4",
        contentType: "video/mp4",
        segment: "HEMS",
      },
      identity: {
        sub: "user-123",
        username: "testuser",
      },
    };

    const result = await handler(event);

    expect(result).toHaveProperty("uploadUrl");
    expect(result).toHaveProperty("key");
    expect(result.key).toContain("uploads/");
    expect(result.key).toContain("user-123");
    expect(result.key).toContain(".mp4");
  });

  it("should reject invalid file types", async () => {
    const event = {
      arguments: {
        fileName: "test.exe",
        contentType: "application/x-msdownload",
        segment: "HEMS",
      },
      identity: {
        sub: "user-123",
      },
    };

    await expect(handler(event)).rejects.toThrow("Invalid content type");
  });

  it("should require authentication", async () => {
    const event = {
      arguments: {
        fileName: "test-video.mp4",
        contentType: "video/mp4",
        segment: "HEMS",
      },
      identity: null,
    };

    await expect(handler(event)).rejects.toThrow("Unauthorized");
  });

  it("should require fileName", async () => {
    const event = {
      arguments: {
        contentType: "video/mp4",
        segment: "HEMS",
      },
      identity: {
        sub: "user-123",
      },
    };

    await expect(handler(event)).rejects.toThrow("fileName is required");
  });
});
