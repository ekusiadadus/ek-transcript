import * as cdk from "aws-cdk-lib";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as s3 from "aws-cdk-lib/aws-s3";
import { Match, Template } from "aws-cdk-lib/assertions";
import { AppSyncStack } from "../lib/stacks/appsync-stack";

describe("AppSyncStack", () => {
  let app: cdk.App;
  let stack: AppSyncStack;
  let template: Template;

  // Mock dependencies
  let mockUserPool: cognito.IUserPool;
  let mockInterviewsTable: dynamodb.ITable;
  let mockInputBucket: s3.IBucket;

  beforeEach(() => {
    app = new cdk.App();

    // Create a prerequisite stack to hold mock resources
    const prereqStack = new cdk.Stack(app, "PrereqStack", {
      env: { account: "123456789012", region: "ap-northeast-1" },
    });

    mockUserPool = new cognito.UserPool(prereqStack, "MockUserPool", {
      userPoolName: "test-user-pool",
    });

    mockInterviewsTable = new dynamodb.Table(prereqStack, "MockInterviewsTable", {
      tableName: "test-interviews-table",
      partitionKey: { name: "interview_id", type: dynamodb.AttributeType.STRING },
    });

    mockInputBucket = new s3.Bucket(prereqStack, "MockInputBucket", {
      bucketName: "test-input-bucket",
    });

    stack = new AppSyncStack(app, "TestAppSyncStack", {
      environment: "test",
      userPool: mockUserPool,
      interviewsTable: mockInterviewsTable,
      inputBucket: mockInputBucket,
      env: { account: "123456789012", region: "ap-northeast-1" },
    });

    template = Template.fromStack(stack);
  });

  describe("GraphQL API", () => {
    test("creates GraphQL API with correct name", () => {
      template.hasResourceProperties("AWS::AppSync::GraphQLApi", {
        Name: "ek-transcript-graphql-test",
      });
    });

    test("GraphQL API uses Cognito User Pool as default auth", () => {
      template.hasResourceProperties("AWS::AppSync::GraphQLApi", {
        AuthenticationType: "AMAZON_COGNITO_USER_POOLS",
      });
    });

    test("GraphQL API has IAM as additional auth mode", () => {
      template.hasResourceProperties("AWS::AppSync::GraphQLApi", {
        AdditionalAuthenticationProviders: Match.arrayWith([
          Match.objectLike({
            AuthenticationType: "AWS_IAM",
          }),
        ]),
      });
    });

    test("GraphQL API has X-Ray enabled", () => {
      template.hasResourceProperties("AWS::AppSync::GraphQLApi", {
        XrayEnabled: true,
      });
    });
  });

  describe("Events API", () => {
    test("creates Events API with correct name", () => {
      template.hasResourceProperties("AWS::AppSync::Api", {
        Name: "ek-transcript-events-test",
      });
    });
  });

  describe("Data Sources", () => {
    test("creates DynamoDB data source for GraphQL API", () => {
      template.hasResourceProperties("AWS::AppSync::DataSource", {
        Type: "AMAZON_DYNAMODB",
      });
    });

    test("creates Lambda data source for Presigned URL", () => {
      template.hasResourceProperties("AWS::AppSync::DataSource", {
        Type: "AWS_LAMBDA",
      });
    });
  });

  describe("Presigned URL Lambda", () => {
    test("creates Presigned URL Lambda function", () => {
      template.hasResourceProperties("AWS::Lambda::Function", {
        FunctionName: "ek-transcript-presigned-url-test",
        Runtime: "nodejs20.x",
      });
    });
  });

  describe("Resolvers", () => {
    test("creates resolver for getInterview query", () => {
      template.hasResourceProperties("AWS::AppSync::Resolver", {
        TypeName: "Query",
        FieldName: "getInterview",
      });
    });

    test("creates resolver for listInterviews query", () => {
      template.hasResourceProperties("AWS::AppSync::Resolver", {
        TypeName: "Query",
        FieldName: "listInterviews",
      });
    });

    test("creates resolver for listInterviewsBySegment query", () => {
      template.hasResourceProperties("AWS::AppSync::Resolver", {
        TypeName: "Query",
        FieldName: "listInterviewsBySegment",
      });
    });

    test("creates resolver for getUploadUrl query", () => {
      template.hasResourceProperties("AWS::AppSync::Resolver", {
        TypeName: "Query",
        FieldName: "getUploadUrl",
      });
    });
  });

  describe("Channel Namespaces", () => {
    test("creates interviews channel namespace", () => {
      template.hasResourceProperties("AWS::AppSync::ChannelNamespace", {
        Name: "interviews",
      });
    });

    test("creates progress channel namespace", () => {
      template.hasResourceProperties("AWS::AppSync::ChannelNamespace", {
        Name: "progress",
      });
    });
  });

  describe("Outputs", () => {
    test("exports GraphQL API URL", () => {
      template.hasOutput("GraphqlApiUrl", {});
    });

    test("exports Events API endpoint", () => {
      template.hasOutput("EventsApiEndpoint", {});
    });
  });
});
