import * as cdk from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { StorageStack } from "../lib/stacks/storage-stack";

describe("StorageStack", () => {
  let app: cdk.App;
  let stack: StorageStack;
  let template: Template;

  beforeEach(() => {
    app = new cdk.App();
    stack = new StorageStack(app, "TestStorageStack", {
      environment: "test",
      env: { account: "123456789012", region: "ap-northeast-1" },
    });
    template = Template.fromStack(stack);
  });

  describe("S3 Buckets", () => {
    test("creates input bucket with correct name pattern", () => {
      template.hasResourceProperties("AWS::S3::Bucket", {
        BucketName: "ek-transcript-input-test-123456789012",
      });
    });

    test("creates output bucket with correct name pattern", () => {
      template.hasResourceProperties("AWS::S3::Bucket", {
        BucketName: "ek-transcript-output-test-123456789012",
      });
    });
  });

  describe("Secrets", () => {
    test("creates OpenAI secret", () => {
      template.hasResourceProperties("AWS::SecretsManager::Secret", {
        Name: "ek-transcript/test/openai-api-key",
      });
    });

    test("creates HuggingFace secret", () => {
      template.hasResourceProperties("AWS::SecretsManager::Secret", {
        Name: "ek-transcript/test/huggingface-token",
      });
    });
  });

  describe("DynamoDB Table", () => {
    test("creates interviews table with correct name", () => {
      template.hasResourceProperties("AWS::DynamoDB::Table", {
        TableName: "ek-transcript-interviews-test",
      });
    });

    test("interviews table has interview_id as partition key", () => {
      template.hasResourceProperties("AWS::DynamoDB::Table", {
        KeySchema: [
          {
            AttributeName: "interview_id",
            KeyType: "HASH",
          },
        ],
      });
    });

    test("interviews table uses PAY_PER_REQUEST billing", () => {
      template.hasResourceProperties("AWS::DynamoDB::Table", {
        BillingMode: "PAY_PER_REQUEST",
      });
    });

    test("interviews table has TTL enabled on expires_at", () => {
      template.hasResourceProperties("AWS::DynamoDB::Table", {
        TimeToLiveSpecification: {
          AttributeName: "expires_at",
          Enabled: true,
        },
      });
    });

    test("interviews table has GSI for segment queries", () => {
      template.hasResourceProperties("AWS::DynamoDB::Table", {
        GlobalSecondaryIndexes: [
          {
            IndexName: "segment-index",
            KeySchema: [
              {
                AttributeName: "segment",
                KeyType: "HASH",
              },
              {
                AttributeName: "created_at",
                KeyType: "RANGE",
              },
            ],
            Projection: {
              ProjectionType: "ALL",
            },
          },
        ],
      });
    });
  });
});
