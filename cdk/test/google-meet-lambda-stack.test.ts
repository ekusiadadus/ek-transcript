import * as cdk from "aws-cdk-lib";
import { Template, Match } from "aws-cdk-lib/assertions";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as kms from "aws-cdk-lib/aws-kms";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import { GoogleMeetLambdaStack } from "../lib/stacks/google-meet-lambda-stack";

describe("GoogleMeetLambdaStack", () => {
  let app: cdk.App;
  let stack: GoogleMeetLambdaStack;
  let template: Template;

  // Mock resources
  let meetingsTable: dynamodb.Table;
  let tokensTable: dynamodb.Table;
  let subscriptionsTable: dynamodb.Table;
  let recordingsTable: dynamodb.Table;
  let tokenEncryptionKey: kms.Key;
  let recordingsBucket: s3.Bucket;
  let googleOAuthSecret: secretsmanager.Secret;
  let mockStack: cdk.Stack;

  beforeAll(() => {
    app = new cdk.App();

    // Create mock resources in a separate stack
    mockStack = new cdk.Stack(app, "MockStack", {
      env: {
        account: "123456789012",
        region: "ap-northeast-1",
      },
    });

    meetingsTable = new dynamodb.Table(mockStack, "MockMeetingsTable", {
      tableName: "mock-meetings-table",
      partitionKey: { name: "meeting_id", type: dynamodb.AttributeType.STRING },
    });

    tokensTable = new dynamodb.Table(mockStack, "MockTokensTable", {
      tableName: "mock-tokens-table",
      partitionKey: { name: "user_id", type: dynamodb.AttributeType.STRING },
    });

    subscriptionsTable = new dynamodb.Table(
      mockStack,
      "MockSubscriptionsTable",
      {
        tableName: "mock-subscriptions-table",
        partitionKey: {
          name: "subscription_id",
          type: dynamodb.AttributeType.STRING,
        },
      }
    );

    recordingsTable = new dynamodb.Table(mockStack, "MockRecordingsTable", {
      tableName: "mock-recordings-table",
      partitionKey: { name: "user_id", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "recording_name", type: dynamodb.AttributeType.STRING },
    });

    tokenEncryptionKey = new kms.Key(mockStack, "MockKmsKey", {
      description: "Mock KMS Key",
    });

    recordingsBucket = new s3.Bucket(mockStack, "MockRecordingsBucket", {
      bucketName: "mock-recordings-bucket",
    });

    googleOAuthSecret = new secretsmanager.Secret(mockStack, "MockGoogleOAuthSecret", {
      secretName: "mock-google-oauth-secret",
    });

    stack = new GoogleMeetLambdaStack(app, "TestGoogleMeetLambdaStack", {
      environment: "test",
      meetingsTable,
      tokensTable,
      subscriptionsTable,
      recordingsTable,
      tokenEncryptionKey,
      recordingsBucket,
      googleOAuthSecret,
      env: {
        account: "123456789012",
        region: "ap-northeast-1",
      },
    });
    template = Template.fromStack(stack);
  });

  describe("Lambda Functions", () => {
    test("creates Google Auth Lambda", () => {
      template.hasResourceProperties("AWS::Lambda::Function", {
        FunctionName: Match.stringLikeRegexp("google-auth"),
        Runtime: "python3.12",
        Handler: "lambda_function.lambda_handler",
      });
    });

    test("creates Calendar Sync Lambda", () => {
      template.hasResourceProperties("AWS::Lambda::Function", {
        FunctionName: Match.stringLikeRegexp("calendar-sync"),
        Runtime: "python3.12",
        Handler: "lambda_function.lambda_handler",
      });
    });

    test("creates Meet Config Lambda", () => {
      template.hasResourceProperties("AWS::Lambda::Function", {
        FunctionName: Match.stringLikeRegexp("meet-config"),
        Runtime: "python3.12",
        Handler: "lambda_function.lambda_handler",
      });
    });

    test("creates Event Handler Lambda", () => {
      template.hasResourceProperties("AWS::Lambda::Function", {
        FunctionName: Match.stringLikeRegexp("event-handler"),
        Runtime: "python3.12",
        Handler: "lambda_function.lambda_handler",
      });
    });

    test("creates Download Recording Lambda", () => {
      template.hasResourceProperties("AWS::Lambda::Function", {
        FunctionName: Match.stringLikeRegexp("download-recording"),
        Runtime: "python3.12",
        Handler: "lambda_function.lambda_handler",
      });
    });

    test("creates at least 5 Lambda functions", () => {
      const resources = template.findResources("AWS::Lambda::Function");
      expect(Object.keys(resources).length).toBeGreaterThanOrEqual(5);
    });
  });

  describe("Lambda Configuration", () => {
    test("Download Recording Lambda has high memory", () => {
      template.hasResourceProperties("AWS::Lambda::Function", {
        FunctionName: Match.stringLikeRegexp("download-recording"),
        MemorySize: 3008,
      });
    });

    test("Download Recording Lambda has long timeout", () => {
      template.hasResourceProperties("AWS::Lambda::Function", {
        FunctionName: Match.stringLikeRegexp("download-recording"),
        Timeout: 900, // 15 minutes
      });
    });

    test("Download Recording Lambda has ephemeral storage", () => {
      template.hasResourceProperties("AWS::Lambda::Function", {
        FunctionName: Match.stringLikeRegexp("download-recording"),
        EphemeralStorage: {
          Size: 10240, // 10 GB
        },
      });
    });

    test("Event Handler Lambda has moderate timeout", () => {
      template.hasResourceProperties("AWS::Lambda::Function", {
        FunctionName: Match.stringLikeRegexp("event-handler"),
        Timeout: 30,
      });
    });

    test("Calendar Sync Lambda has 5 minute timeout", () => {
      template.hasResourceProperties("AWS::Lambda::Function", {
        FunctionName: Match.stringLikeRegexp("calendar-sync"),
        Timeout: 300, // 5 minutes
      });
    });
  });

  describe("Lambda Environment Variables", () => {
    test("Lambdas have MEETINGS_TABLE environment variable", () => {
      template.hasResourceProperties("AWS::Lambda::Function", {
        Environment: {
          Variables: Match.objectLike({
            MEETINGS_TABLE: Match.anyValue(),
          }),
        },
      });
    });

    test("Lambdas have TOKENS_TABLE environment variable", () => {
      template.hasResourceProperties("AWS::Lambda::Function", {
        Environment: {
          Variables: Match.objectLike({
            TOKENS_TABLE: Match.anyValue(),
          }),
        },
      });
    });

    test("Lambdas have KMS_KEY_ID environment variable", () => {
      template.hasResourceProperties("AWS::Lambda::Function", {
        Environment: {
          Variables: Match.objectLike({
            KMS_KEY_ID: Match.anyValue(),
          }),
        },
      });
    });

    test("Download Recording Lambda has RECORDINGS_BUCKET environment variable", () => {
      template.hasResourceProperties("AWS::Lambda::Function", {
        FunctionName: Match.stringLikeRegexp("download-recording"),
        Environment: {
          Variables: Match.objectLike({
            RECORDINGS_BUCKET: Match.anyValue(),
          }),
        },
      });
    });
  });

  describe("IAM Roles", () => {
    test("creates IAM roles for Lambda functions", () => {
      const resources = template.findResources("AWS::IAM::Role");
      expect(Object.keys(resources).length).toBeGreaterThanOrEqual(5);
    });

    test("Lambda roles have basic execution policy", () => {
      template.hasResourceProperties("AWS::IAM::Role", {
        AssumeRolePolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: "sts:AssumeRole",
              Effect: "Allow",
              Principal: {
                Service: "lambda.amazonaws.com",
              },
            }),
          ]),
        },
      });
    });
  });

  describe("Lambda Layers", () => {
    test("creates shared layer for common dependencies", () => {
      template.hasResourceProperties("AWS::Lambda::LayerVersion", {
        Description: Match.stringLikeRegexp("(Shared|shared|common|Google|google)"),
      });
    });
  });

  describe("Outputs", () => {
    test("exports Google Auth Lambda ARN", () => {
      template.hasOutput("GoogleAuthLambdaArn", {});
    });

    test("exports Calendar Sync Lambda ARN", () => {
      template.hasOutput("CalendarSyncLambdaArn", {});
    });

    test("exports Meet Config Lambda ARN", () => {
      template.hasOutput("MeetConfigLambdaArn", {});
    });

    test("exports Event Handler Lambda ARN", () => {
      template.hasOutput("EventHandlerLambdaArn", {});
    });

    test("exports Download Recording Lambda ARN", () => {
      template.hasOutput("DownloadRecordingLambdaArn", {});
    });
  });
});
