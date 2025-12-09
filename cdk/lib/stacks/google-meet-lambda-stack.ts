import * as cdk from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as iam from "aws-cdk-lib/aws-iam";
import * as kms from "aws-cdk-lib/aws-kms";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";
import * as path from "path";

export interface GoogleMeetLambdaStackProps extends cdk.StackProps {
  environment: string;
  meetingsTable: dynamodb.ITable;
  tokensTable: dynamodb.ITable;
  subscriptionsTable: dynamodb.ITable;
  recordingsTable: dynamodb.ITable;
  tokenEncryptionKey: kms.IKey;
  recordingsBucket: s3.IBucket;
  googleOAuthSecret: secretsmanager.ISecret;
}

/**
 * Google Meet 連携用 Lambda スタック
 *
 * 以下の Lambda 関数を作成:
 * - Google Auth Lambda: OAuth 認証フロー
 * - Calendar Sync Lambda: カレンダーイベント同期
 * - Meet Config Lambda: Meet Space 設定
 * - Event Handler Lambda: Pub/Sub Webhook 処理
 * - Download Recording Lambda: 録画ダウンロード
 */
export class GoogleMeetLambdaStack extends cdk.Stack {
  public readonly googleAuthLambda: lambda.Function;
  public readonly calendarSyncLambda: lambda.Function;
  public readonly meetConfigLambda: lambda.Function;
  public readonly eventHandlerLambda: lambda.Function;
  public readonly downloadRecordingLambda: lambda.Function;

  constructor(scope: Construct, id: string, props: GoogleMeetLambdaStackProps) {
    super(scope, id, props);

    const {
      environment,
      meetingsTable,
      tokensTable,
      subscriptionsTable,
      recordingsTable,
      tokenEncryptionKey,
      recordingsBucket,
      googleOAuthSecret,
    } = props;

    // ========================================
    // Shared Lambda Layer
    // ========================================
    const sharedLayerPath = path.join(__dirname, "../../..", "lambdas/shared");
    const sharedLayer = new lambda.LayerVersion(this, "GoogleMeetSharedLayer", {
      layerVersionName: `ek-transcript-google-shared-${environment}`,
      description: "Shared Google API dependencies for Google Meet integration",
      code: lambda.Code.fromAsset(sharedLayerPath, {
        bundling: {
          image: lambda.Runtime.PYTHON_3_12.bundlingImage,
          command: [
            "bash",
            "-c",
            [
              "pip install -r requirements.txt -t /asset-output/python",
              "cp -r *.py /asset-output/python/ 2>/dev/null || true",
            ].join(" && "),
          ],
          // Local bundling with pip install
          local: {
            tryBundle(outputDir: string): boolean {
              const { execSync } = require("child_process");
              try {
                execSync(`mkdir -p ${outputDir}/python`);
                // Install pip packages to the output directory
                execSync(`pip install -r ${sharedLayerPath}/requirements.txt -t ${outputDir}/python --platform manylinux2014_x86_64 --only-binary=:all: --upgrade 2>/dev/null || pip install -r ${sharedLayerPath}/requirements.txt -t ${outputDir}/python --upgrade`, { stdio: "inherit" });
                // Copy source files
                execSync(`cp -r ${sharedLayerPath}/*.py ${outputDir}/python/ 2>/dev/null || true`);
                return true;
              } catch (e) {
                console.error("Local bundling failed:", e);
                return false;
              }
            },
          },
        },
      }),
      compatibleRuntimes: [lambda.Runtime.PYTHON_3_12],
    });

    // ========================================
    // Common environment variables
    // ========================================
    const commonEnv = {
      MEETINGS_TABLE: meetingsTable.tableName,
      TOKENS_TABLE: tokensTable.tableName,
      SUBSCRIPTIONS_TABLE: subscriptionsTable.tableName,
      RECORDINGS_TABLE: recordingsTable.tableName,
      KMS_KEY_ID: tokenEncryptionKey.keyId,
      GOOGLE_OAUTH_SECRET_ARN: googleOAuthSecret.secretArn,
    };

    // ========================================
    // Google Auth Lambda
    // ========================================
    this.googleAuthLambda = new lambda.Function(this, "GoogleAuthLambda", {
      functionName: `ek-transcript-google-auth-${environment}`,
      description: "Google OAuth 認証フロー処理",
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: "lambda_function.lambda_handler",
      code: lambda.Code.fromAsset(
        path.join(__dirname, "../../..", "lambdas/google_auth")
      ),
      layers: [sharedLayer],
      memorySize: 256,
      timeout: cdk.Duration.seconds(30),
      environment: {
        ...commonEnv,
      },
    });

    // ========================================
    // Calendar Sync Lambda
    // ========================================
    this.calendarSyncLambda = new lambda.Function(this, "CalendarSyncLambda", {
      functionName: `ek-transcript-calendar-sync-${environment}`,
      description: "Google Calendar イベント同期",
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: "lambda_function.lambda_handler",
      code: lambda.Code.fromAsset(
        path.join(__dirname, "../../..", "lambdas/calendar_sync")
      ),
      layers: [sharedLayer],
      memorySize: 512,
      timeout: cdk.Duration.seconds(300), // 5 minutes
      environment: {
        ...commonEnv,
      },
    });

    // ========================================
    // Meet Config Lambda
    // ========================================
    this.meetConfigLambda = new lambda.Function(this, "MeetConfigLambda", {
      functionName: `ek-transcript-meet-config-${environment}`,
      description: "Google Meet Space 設定管理",
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: "lambda_function.lambda_handler",
      code: lambda.Code.fromAsset(
        path.join(__dirname, "../../..", "lambdas/meet_config")
      ),
      layers: [sharedLayer],
      memorySize: 256,
      timeout: cdk.Duration.seconds(30),
      environment: {
        ...commonEnv,
      },
    });

    // ========================================
    // Event Handler Lambda
    // ========================================
    this.eventHandlerLambda = new lambda.Function(this, "EventHandlerLambda", {
      functionName: `ek-transcript-event-handler-${environment}`,
      description: "Google Workspace Events (Pub/Sub) Webhook 処理",
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: "lambda_function.lambda_handler",
      code: lambda.Code.fromAsset(
        path.join(__dirname, "../../..", "lambdas/event_handler")
      ),
      layers: [sharedLayer],
      memorySize: 256,
      timeout: cdk.Duration.seconds(30),
      environment: {
        ...commonEnv,
        DOWNLOAD_LAMBDA_NAME: `ek-transcript-download-recording-${environment}`,
      },
    });

    // ========================================
    // Download Recording Lambda
    // ========================================
    this.downloadRecordingLambda = new lambda.Function(
      this,
      "DownloadRecordingLambda",
      {
        functionName: `ek-transcript-download-recording-${environment}`,
        description: "Google Drive から録画ファイルをダウンロードして S3 に保存",
        runtime: lambda.Runtime.PYTHON_3_12,
        handler: "lambda_function.lambda_handler",
        code: lambda.Code.fromAsset(
          path.join(__dirname, "../../..", "lambdas/download_recording")
        ),
        layers: [sharedLayer],
        memorySize: 3008, // High memory for large file processing
        timeout: cdk.Duration.seconds(900), // 15 minutes
        ephemeralStorageSize: cdk.Size.gibibytes(10), // 10 GB ephemeral storage
        environment: {
          ...commonEnv,
          RECORDINGS_BUCKET: recordingsBucket.bucketName,
        },
      }
    );

    // ========================================
    // IAM Permissions
    // ========================================

    // DynamoDB permissions
    const lambdas = [
      this.googleAuthLambda,
      this.calendarSyncLambda,
      this.meetConfigLambda,
      this.eventHandlerLambda,
      this.downloadRecordingLambda,
    ];

    for (const fn of lambdas) {
      // Meetings table
      meetingsTable.grantReadWriteData(fn);

      // Tokens table
      tokensTable.grantReadWriteData(fn);

      // Recordings table
      recordingsTable.grantReadWriteData(fn);

      // KMS key for encryption/decryption
      tokenEncryptionKey.grantEncryptDecrypt(fn);

      // Google OAuth secret
      googleOAuthSecret.grantRead(fn);
    }

    // Subscriptions table (only needed by specific lambdas)
    subscriptionsTable.grantReadWriteData(this.meetConfigLambda);
    subscriptionsTable.grantReadWriteData(this.eventHandlerLambda);

    // S3 permissions for Download Recording Lambda
    recordingsBucket.grantReadWrite(this.downloadRecordingLambda);

    // Event Handler can invoke Download Recording Lambda
    this.downloadRecordingLambda.grantInvoke(this.eventHandlerLambda);

    // ========================================
    // Reserved Concurrency (as per architecture doc)
    // ========================================
    // Set reserved concurrency directly on the Lambda function
    const cfnEventHandler = this.eventHandlerLambda.node.defaultChild as lambda.CfnFunction;
    cfnEventHandler.addPropertyOverride("ReservedConcurrentExecutions", 100);

    // ========================================
    // Outputs
    // ========================================
    new cdk.CfnOutput(this, "GoogleAuthLambdaArn", {
      value: this.googleAuthLambda.functionArn,
      exportName: `${id}-GoogleAuthLambdaArn`,
    });

    new cdk.CfnOutput(this, "CalendarSyncLambdaArn", {
      value: this.calendarSyncLambda.functionArn,
      exportName: `${id}-CalendarSyncLambdaArn`,
    });

    new cdk.CfnOutput(this, "MeetConfigLambdaArn", {
      value: this.meetConfigLambda.functionArn,
      exportName: `${id}-MeetConfigLambdaArn`,
    });

    new cdk.CfnOutput(this, "EventHandlerLambdaArn", {
      value: this.eventHandlerLambda.functionArn,
      exportName: `${id}-EventHandlerLambdaArn`,
    });

    new cdk.CfnOutput(this, "DownloadRecordingLambdaArn", {
      value: this.downloadRecordingLambda.functionArn,
      exportName: `${id}-DownloadRecordingLambdaArn`,
    });

    new cdk.CfnOutput(this, "SharedLayerArn", {
      value: sharedLayer.layerVersionArn,
      exportName: `${id}-SharedLayerArn`,
    });
  }
}
