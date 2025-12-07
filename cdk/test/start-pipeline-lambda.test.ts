// Mock AWS SDK - must be before import
const mockSend = jest.fn().mockResolvedValue({
  executionArn: "arn:aws:states:ap-northeast-1:123456789012:execution:test-state-machine:test-execution",
  startDate: new Date(),
});

jest.mock("@aws-sdk/client-sfn", () => ({
  SFNClient: jest.fn().mockImplementation(() => ({
    send: mockSend,
  })),
  StartExecutionCommand: jest.fn(),
}));

import { handler } from "../lib/lambdas/start-pipeline";

describe("Start Pipeline Lambda", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env = { ...OLD_ENV };
    process.env.STATE_MACHINE_ARN = "arn:aws:states:ap-northeast-1:123456789012:stateMachine:test-state-machine";
    process.env.AWS_REGION = "ap-northeast-1";
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  it("should start Step Functions execution for valid S3 event", async () => {
    const event = {
      Records: [
        {
          s3: {
            bucket: {
              name: "test-bucket",
            },
            object: {
              key: "uploads/user-123/2025-12-07/HEMS/video.mp4",
              size: 1024000,
            },
          },
        },
      ],
    };

    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    expect(mockSend).toHaveBeenCalled();
  });

  it("should extract user_id and segment from S3 key", async () => {
    const event = {
      Records: [
        {
          s3: {
            bucket: {
              name: "test-bucket",
            },
            object: {
              key: "uploads/user-456/2025-12-07/EV/interview.mp4",
              size: 2048000,
            },
          },
        },
      ],
    };

    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    expect(result.body).toContain("user-456");
    expect(result.body).toContain("EV");
  });

  it("should skip non-video files", async () => {
    const event = {
      Records: [
        {
          s3: {
            bucket: {
              name: "test-bucket",
            },
            object: {
              key: "uploads/user-123/2025-12-07/HEMS/document.txt",
              size: 1024,
            },
          },
        },
      ],
    };

    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    expect(result.body).toContain("skipped");
  });

  it("should handle missing STATE_MACHINE_ARN", async () => {
    delete process.env.STATE_MACHINE_ARN;

    const event = {
      Records: [
        {
          s3: {
            bucket: {
              name: "test-bucket",
            },
            object: {
              key: "uploads/user-123/2025-12-07/HEMS/video.mp4",
              size: 1024000,
            },
          },
        },
      ],
    };

    await expect(handler(event)).rejects.toThrow("STATE_MACHINE_ARN");
  });
});
