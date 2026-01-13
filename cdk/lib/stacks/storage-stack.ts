import * as cdk from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";

export interface StorageStackProps extends cdk.StackProps {
  environment: string;
}

export class StorageStack extends cdk.Stack {
  public readonly inputBucket: s3.Bucket;
  public readonly outputBucket: s3.Bucket;
  public readonly openaiSecret: secretsmanager.ISecret;
  public readonly huggingfaceSecret: secretsmanager.ISecret;
  public readonly interviewsTable: dynamodb.Table;
  public readonly interviewProjectsTable: dynamodb.Table;

  constructor(scope: Construct, id: string, props: StorageStackProps) {
    super(scope, id, props);

    const { environment } = props;

    // Input bucket for video uploads
    this.inputBucket = new s3.Bucket(this, "InputBucket", {
      bucketName: `ek-transcript-input-${environment}-${this.account}`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      versioned: false,
      eventBridgeEnabled: true, // Enable EventBridge for S3 events
      removalPolicy:
        environment === "prod"
          ? cdk.RemovalPolicy.RETAIN
          : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: environment !== "prod",
      cors: [
        {
          allowedMethods: [s3.HttpMethods.PUT, s3.HttpMethods.POST],
          allowedOrigins: ["*"],
          allowedHeaders: ["*"],
        },
      ],
      lifecycleRules: [
        {
          id: "DeleteIncompleteMultipartUploads",
          abortIncompleteMultipartUploadAfter: cdk.Duration.days(7),
        },
        {
          id: "TransitionToIA",
          transitions: [
            {
              storageClass: s3.StorageClass.INFREQUENT_ACCESS,
              transitionAfter: cdk.Duration.days(30),
            },
          ],
        },
      ],
    });

    // Output bucket for processed results
    this.outputBucket = new s3.Bucket(this, "OutputBucket", {
      bucketName: `ek-transcript-output-${environment}-${this.account}`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      versioned: false,
      removalPolicy:
        environment === "prod"
          ? cdk.RemovalPolicy.RETAIN
          : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: environment !== "prod",
      cors: [
        {
          allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.HEAD],
          allowedOrigins: ["*"],
          allowedHeaders: ["*"],
          exposedHeaders: ["ETag"],
        },
      ],
      lifecycleRules: [
        {
          id: "DeleteOldResults",
          expiration: cdk.Duration.days(90),
        },
      ],
    });

    // OpenAI API Key secret
    this.openaiSecret = new secretsmanager.Secret(this, "OpenAISecret", {
      secretName: `ek-transcript/${environment}/openai-api-key`,
      description: "OpenAI API Key for LLM analysis",
    });

    // HuggingFace Token secret
    this.huggingfaceSecret = new secretsmanager.Secret(
      this,
      "HuggingFaceSecret",
      {
        secretName: `ek-transcript/${environment}/huggingface-token`,
        description: "HuggingFace Token for pyannote.audio",
      }
    );

    // DynamoDB table for interview data
    // Note: Always RETAIN to prevent accidental data loss during deployments
    this.interviewsTable = new dynamodb.Table(this, "InterviewsTable", {
      tableName: `ek-transcript-interviews-${environment}`,
      partitionKey: {
        name: "interview_id",
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      timeToLiveAttribute: "expires_at",
      pointInTimeRecovery: environment === "prod",
    });

    // GSI for segment-based queries
    this.interviewsTable.addGlobalSecondaryIndex({
      indexName: "segment-index",
      partitionKey: {
        name: "segment",
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: "created_at",
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // GSI for project-based queries
    this.interviewsTable.addGlobalSecondaryIndex({
      indexName: "project-index",
      partitionKey: {
        name: "project_id",
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: "created_at",
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // DynamoDB table for interview projects
    this.interviewProjectsTable = new dynamodb.Table(this, "InterviewProjectsTable", {
      tableName: `ek-transcript-interview-projects-${environment}`,
      partitionKey: {
        name: "project_id",
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      pointInTimeRecovery: environment === "prod",
    });

    // GSI for user-based queries on projects
    this.interviewProjectsTable.addGlobalSecondaryIndex({
      indexName: "user-index",
      partitionKey: {
        name: "user_id",
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: "created_at",
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Outputs
    new cdk.CfnOutput(this, "InputBucketName", {
      value: this.inputBucket.bucketName,
      exportName: `${id}-InputBucketName`,
    });

    new cdk.CfnOutput(this, "OutputBucketName", {
      value: this.outputBucket.bucketName,
      exportName: `${id}-OutputBucketName`,
    });

    new cdk.CfnOutput(this, "OpenAISecretArn", {
      value: this.openaiSecret.secretArn,
      exportName: `${id}-OpenAISecretArn`,
    });

    new cdk.CfnOutput(this, "HuggingFaceSecretArn", {
      value: this.huggingfaceSecret.secretArn,
      exportName: `${id}-HuggingFaceSecretArn`,
    });

    new cdk.CfnOutput(this, "InterviewsTableName", {
      value: this.interviewsTable.tableName,
      exportName: `${id}-InterviewsTableName`,
    });

    new cdk.CfnOutput(this, "InterviewsTableArn", {
      value: this.interviewsTable.tableArn,
      exportName: `${id}-InterviewsTableArn`,
    });

    new cdk.CfnOutput(this, "InterviewProjectsTableName", {
      value: this.interviewProjectsTable.tableName,
      exportName: `${id}-InterviewProjectsTableName`,
    });

    new cdk.CfnOutput(this, "InterviewProjectsTableArn", {
      value: this.interviewProjectsTable.tableArn,
      exportName: `${id}-InterviewProjectsTableArn`,
    });
  }
}
