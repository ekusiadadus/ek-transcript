import * as cdk from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import { Match, Template } from "aws-cdk-lib/assertions";
import { LambdaStack } from "../lib/stacks/lambda-stack";

describe("LambdaStack", () => {
  let app: cdk.App;
  let stack: LambdaStack;
  let template: Template;

  // Mock dependencies
  let mockInputBucket: s3.IBucket;
  let mockOutputBucket: s3.IBucket;
  let mockOpenaiSecret: secretsmanager.ISecret;
  let mockHuggingfaceSecret: secretsmanager.ISecret;
  let mockInterviewsTable: dynamodb.ITable;

  beforeEach(() => {
    app = new cdk.App();

    // Create a prerequisite stack to hold mock resources
    const prereqStack = new cdk.Stack(app, "PrereqStack", {
      env: { account: "123456789012", region: "ap-northeast-1" },
    });

    mockInputBucket = new s3.Bucket(prereqStack, "MockInputBucket");
    mockOutputBucket = new s3.Bucket(prereqStack, "MockOutputBucket");
    mockOpenaiSecret = new secretsmanager.Secret(prereqStack, "MockOpenaiSecret");
    mockHuggingfaceSecret = new secretsmanager.Secret(prereqStack, "MockHuggingfaceSecret");
    mockInterviewsTable = new dynamodb.Table(prereqStack, "MockInterviewsTable", {
      tableName: "test-interviews-table",
      partitionKey: { name: "interview_id", type: dynamodb.AttributeType.STRING },
    });

    // Set HF_TOKEN for Docker build
    process.env.HF_TOKEN = "test-token";

    stack = new LambdaStack(app, "TestLambdaStack", {
      environment: "test",
      inputBucket: mockInputBucket,
      outputBucket: mockOutputBucket,
      openaiSecret: mockOpenaiSecret,
      huggingfaceSecret: mockHuggingfaceSecret,
      interviewsTable: mockInterviewsTable,
      env: { account: "123456789012", region: "ap-northeast-1" },
    });

    template = Template.fromStack(stack);
  });

  afterEach(() => {
    delete process.env.HF_TOKEN;
  });

  describe("LLMAnalysis Lambda DynamoDB Integration", () => {
    test("llmAnalysisFn has INTERVIEWS_TABLE_NAME environment variable", () => {
      template.hasResourceProperties("AWS::Lambda::Function", {
        FunctionName: "ek-transcript-llm-analysis-test",
        Environment: {
          Variables: Match.objectLike({
            // Cross-stack reference becomes Fn::ImportValue
            INTERVIEWS_TABLE_NAME: Match.anyValue(),
          }),
        },
      });
    });

    test("llmAnalysisFn has DynamoDB write permissions", () => {
      // Check that there's an IAM policy allowing DynamoDB PutItem
      template.hasResourceProperties("AWS::IAM::Policy", {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: Match.arrayWith(["dynamodb:PutItem"]),
              Effect: "Allow",
            }),
          ]),
        },
      });
    });
  });

  describe("Lambda Functions", () => {
    test("creates llmAnalysisFn with correct function name", () => {
      template.hasResourceProperties("AWS::Lambda::Function", {
        FunctionName: "ek-transcript-llm-analysis-test",
      });
    });

    test("creates extractAudioFn with correct function name", () => {
      template.hasResourceProperties("AWS::Lambda::Function", {
        FunctionName: "ek-transcript-extract-audio-test",
      });
    });
  });
});
