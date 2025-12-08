// Mock AWS SDK - must be before import
const mockDynamoSend = jest.fn().mockResolvedValue({});
const mockSfnSend = jest.fn();

jest.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: jest.fn().mockImplementation(() => ({})),
}));

jest.mock("@aws-sdk/lib-dynamodb", () => ({
  DynamoDBDocumentClient: {
    from: jest.fn().mockImplementation(() => ({
      send: mockDynamoSend,
    })),
  },
  UpdateCommand: jest.fn().mockImplementation((params) => ({ input: params })),
}));

jest.mock("@aws-sdk/client-sfn", () => ({
  SFNClient: jest.fn().mockImplementation(() => ({
    send: mockSfnSend,
  })),
  GetExecutionHistoryCommand: jest.fn(),
}));

import { handler } from "../lib/lambdas/completion-handler";

describe("Completion Handler Lambda", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...OLD_ENV };
    process.env.TABLE_NAME = "test-interviews-table";
    process.env.AWS_REGION = "ap-northeast-1";
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  it("should update status to completed on SUCCEEDED event", async () => {
    const event = {
      source: "aws.states",
      "detail-type": "Step Functions Execution Status Change",
      detail: {
        executionArn: "arn:aws:states:ap-northeast-1:123456789012:execution:pipeline:interview-abc123",
        stateMachineArn: "arn:aws:states:ap-northeast-1:123456789012:stateMachine:pipeline",
        status: "SUCCEEDED" as const,
        input: JSON.stringify({
          interview_id: "abc123",
          user_id: "user-123",
        }),
      },
    };

    await handler(event);

    expect(mockDynamoSend).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          TableName: "test-interviews-table",
          Key: { interview_id: "abc123" },
          UpdateExpression: expect.stringContaining("status = :status"),
          ExpressionAttributeValues: expect.objectContaining({
            ":status": "completed",
            ":progress": 100,
          }),
        }),
      })
    );
  });

  it("should update status to failed on FAILED event with error details", async () => {
    // Mock execution history to return error details
    mockSfnSend.mockResolvedValueOnce({
      events: [
        {
          type: "ExecutionFailed",
          executionFailedEventDetails: {
            error: "Lambda.ServiceException",
            cause: "The Lambda function failed with an error",
          },
        },
      ],
    });

    const event = {
      source: "aws.states",
      "detail-type": "Step Functions Execution Status Change",
      detail: {
        executionArn: "arn:aws:states:ap-northeast-1:123456789012:execution:pipeline:interview-def456",
        stateMachineArn: "arn:aws:states:ap-northeast-1:123456789012:stateMachine:pipeline",
        status: "FAILED" as const,
        input: JSON.stringify({
          interview_id: "def456",
          user_id: "user-456",
        }),
      },
    };

    await handler(event);

    expect(mockSfnSend).toHaveBeenCalled();
    expect(mockDynamoSend).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          TableName: "test-interviews-table",
          Key: { interview_id: "def456" },
          UpdateExpression: expect.stringContaining("status = :status"),
          ExpressionAttributeValues: expect.objectContaining({
            ":status": "failed",
            ":error_message": expect.stringContaining("Lambda.ServiceException"),
          }),
        }),
      })
    );
  });

  it("should update status to failed on TIMED_OUT event", async () => {
    mockSfnSend.mockResolvedValueOnce({
      events: [
        {
          type: "ExecutionTimedOut",
        },
      ],
    });

    const event = {
      source: "aws.states",
      "detail-type": "Step Functions Execution Status Change",
      detail: {
        executionArn: "arn:aws:states:ap-northeast-1:123456789012:execution:pipeline:interview-ghi789",
        stateMachineArn: "arn:aws:states:ap-northeast-1:123456789012:stateMachine:pipeline",
        status: "TIMED_OUT" as const,
        input: JSON.stringify({
          interview_id: "ghi789",
          user_id: "user-789",
        }),
      },
    };

    await handler(event);

    expect(mockDynamoSend).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          TableName: "test-interviews-table",
          Key: { interview_id: "ghi789" },
          ExpressionAttributeValues: expect.objectContaining({
            ":status": "failed",
            ":error_message": expect.stringContaining("timed out"),
          }),
        }),
      })
    );
  });

  it("should handle missing interview_id gracefully", async () => {
    const event = {
      source: "aws.states",
      "detail-type": "Step Functions Execution Status Change",
      detail: {
        executionArn: "arn:aws:states:ap-northeast-1:123456789012:execution:pipeline:unknown",
        stateMachineArn: "arn:aws:states:ap-northeast-1:123456789012:stateMachine:pipeline",
        status: "SUCCEEDED" as const,
        input: JSON.stringify({}),
      },
    };

    // Should not throw
    await handler(event);

    // Should not call DynamoDB without interview_id
    expect(mockDynamoSend).not.toHaveBeenCalled();
  });

  it("should require TABLE_NAME environment variable", async () => {
    delete process.env.TABLE_NAME;

    const event = {
      source: "aws.states",
      "detail-type": "Step Functions Execution Status Change",
      detail: {
        executionArn: "arn:aws:states:ap-northeast-1:123456789012:execution:pipeline:interview-abc",
        stateMachineArn: "arn:aws:states:ap-northeast-1:123456789012:stateMachine:pipeline",
        status: "SUCCEEDED" as const,
        input: JSON.stringify({
          interview_id: "abc",
        }),
      },
    };

    await expect(handler(event)).rejects.toThrow("TABLE_NAME");
  });
});
