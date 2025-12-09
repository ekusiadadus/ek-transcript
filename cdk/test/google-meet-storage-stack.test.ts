import * as cdk from "aws-cdk-lib";
import { Template, Match } from "aws-cdk-lib/assertions";
import { GoogleMeetStorageStack } from "../lib/stacks/google-meet-storage-stack";

describe("GoogleMeetStorageStack", () => {
  let app: cdk.App;
  let stack: GoogleMeetStorageStack;
  let template: Template;

  beforeEach(() => {
    app = new cdk.App();
    stack = new GoogleMeetStorageStack(app, "TestGoogleMeetStorageStack", {
      environment: "test",
      env: {
        account: "123456789012",
        region: "ap-northeast-1",
      },
    });
    template = Template.fromStack(stack);
  });

  describe("KMS Key", () => {
    test("creates KMS key for token encryption", () => {
      template.hasResourceProperties("AWS::KMS::Key", {
        Description: "Key for encrypting Google OAuth tokens",
        EnableKeyRotation: true,
      });
    });

    test("creates KMS alias", () => {
      template.hasResourceProperties("AWS::KMS::Alias", {
        AliasName: "alias/ek-transcript-google-tokens-test",
      });
    });
  });

  describe("Meetings Table", () => {
    test("creates DynamoDB table with correct name", () => {
      template.hasResourceProperties("AWS::DynamoDB::Table", {
        TableName: "ek-transcript-meetings-test",
      });
    });

    test("has meeting_id as partition key", () => {
      template.hasResourceProperties("AWS::DynamoDB::Table", {
        TableName: "ek-transcript-meetings-test",
        KeySchema: [
          {
            AttributeName: "meeting_id",
            KeyType: "HASH",
          },
        ],
      });
    });

    test("has user_id-start_time GSI", () => {
      template.hasResourceProperties("AWS::DynamoDB::Table", {
        TableName: "ek-transcript-meetings-test",
        GlobalSecondaryIndexes: Match.arrayWith([
          Match.objectLike({
            IndexName: "user_id-start_time-index",
            KeySchema: [
              {
                AttributeName: "user_id",
                KeyType: "HASH",
              },
              {
                AttributeName: "start_time",
                KeyType: "RANGE",
              },
            ],
          }),
        ]),
      });
    });

    test("has calendar_event_id GSI", () => {
      template.hasResourceProperties("AWS::DynamoDB::Table", {
        TableName: "ek-transcript-meetings-test",
        GlobalSecondaryIndexes: Match.arrayWith([
          Match.objectLike({
            IndexName: "calendar_event_id-index",
            KeySchema: [
              {
                AttributeName: "calendar_event_id",
                KeyType: "HASH",
              },
            ],
          }),
        ]),
      });
    });

    test("has PAY_PER_REQUEST billing mode", () => {
      template.hasResourceProperties("AWS::DynamoDB::Table", {
        TableName: "ek-transcript-meetings-test",
        BillingMode: "PAY_PER_REQUEST",
      });
    });

    test("has point-in-time recovery enabled", () => {
      template.hasResourceProperties("AWS::DynamoDB::Table", {
        TableName: "ek-transcript-meetings-test",
        PointInTimeRecoverySpecification: {
          PointInTimeRecoveryEnabled: true,
        },
      });
    });
  });

  describe("Google Tokens Table", () => {
    test("creates DynamoDB table with correct name", () => {
      template.hasResourceProperties("AWS::DynamoDB::Table", {
        TableName: "ek-transcript-google-tokens-test",
      });
    });

    test("has user_id as partition key", () => {
      template.hasResourceProperties("AWS::DynamoDB::Table", {
        TableName: "ek-transcript-google-tokens-test",
        KeySchema: [
          {
            AttributeName: "user_id",
            KeyType: "HASH",
          },
        ],
      });
    });

    test("has KMS encryption enabled", () => {
      template.hasResourceProperties("AWS::DynamoDB::Table", {
        TableName: "ek-transcript-google-tokens-test",
        SSESpecification: {
          SSEEnabled: true,
          SSEType: "KMS",
        },
      });
    });
  });

  describe("Event Subscriptions Table", () => {
    test("creates DynamoDB table with correct name", () => {
      template.hasResourceProperties("AWS::DynamoDB::Table", {
        TableName: "ek-transcript-event-subscriptions-test",
      });
    });

    test("has subscription_id as partition key", () => {
      template.hasResourceProperties("AWS::DynamoDB::Table", {
        TableName: "ek-transcript-event-subscriptions-test",
        KeySchema: [
          {
            AttributeName: "subscription_id",
            KeyType: "HASH",
          },
        ],
      });
    });

    test("has space_id GSI", () => {
      template.hasResourceProperties("AWS::DynamoDB::Table", {
        TableName: "ek-transcript-event-subscriptions-test",
        GlobalSecondaryIndexes: Match.arrayWith([
          Match.objectLike({
            IndexName: "space_id-index",
            KeySchema: [
              {
                AttributeName: "space_id",
                KeyType: "HASH",
              },
            ],
          }),
        ]),
      });
    });

    test("has TTL attribute", () => {
      template.hasResourceProperties("AWS::DynamoDB::Table", {
        TableName: "ek-transcript-event-subscriptions-test",
        TimeToLiveSpecification: {
          AttributeName: "expire_time",
          Enabled: true,
        },
      });
    });
  });

  describe("Outputs", () => {
    test("exports MeetingsTable name", () => {
      template.hasOutput("MeetingsTableName", {});
    });

    test("exports GoogleTokensTable name", () => {
      template.hasOutput("GoogleTokensTableName", {});
    });

    test("exports SubscriptionsTable name", () => {
      template.hasOutput("SubscriptionsTableName", {});
    });

    test("exports RecordingsTable name", () => {
      template.hasOutput("RecordingsTableName", {});
    });

    test("exports TokenEncryptionKey ARN", () => {
      template.hasOutput("TokenEncryptionKeyArn", {});
    });
  });

  describe("Table count", () => {
    test("creates exactly 4 DynamoDB tables", () => {
      template.resourceCountIs("AWS::DynamoDB::Table", 4);
    });
  });
});
