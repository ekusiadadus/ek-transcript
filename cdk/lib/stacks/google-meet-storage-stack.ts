import * as cdk from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as kms from "aws-cdk-lib/aws-kms";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";

export interface GoogleMeetStorageStackProps extends cdk.StackProps {
  environment: string;
}

/**
 * Google Meet 連携用ストレージスタック
 *
 * 以下のリソースを作成:
 * - Meetings テーブル: 会議情報の管理
 * - GoogleTokens テーブル: OAuth トークンの暗号化保存
 * - EventSubscriptions テーブル: Workspace Events 購読の管理
 * - KMS キー: トークン暗号化用
 */
export class GoogleMeetStorageStack extends cdk.Stack {
  public readonly meetingsTable: dynamodb.Table;
  public readonly googleTokensTable: dynamodb.Table;
  public readonly subscriptionsTable: dynamodb.Table;
  public readonly recordingsTable: dynamodb.Table;
  public readonly tokenEncryptionKey: kms.Key;
  public readonly googleOAuthSecret: secretsmanager.Secret;

  constructor(scope: Construct, id: string, props: GoogleMeetStorageStackProps) {
    super(scope, id, props);

    const { environment } = props;

    // ========================================
    // KMS Key for token encryption
    // ========================================
    this.tokenEncryptionKey = new kms.Key(this, "TokenEncryptionKey", {
      alias: `alias/ek-transcript-google-tokens-${environment}`,
      description: "Key for encrypting Google OAuth tokens",
      enableKeyRotation: true,
      removalPolicy:
        environment === "prod"
          ? cdk.RemovalPolicy.RETAIN
          : cdk.RemovalPolicy.DESTROY,
    });

    // ========================================
    // Google OAuth Secret
    // ========================================
    this.googleOAuthSecret = new secretsmanager.Secret(this, "GoogleOAuthSecret", {
      secretName: `ek-transcript/${environment}/google-oauth`,
      description: "Google OAuth Client ID and Secret for Google Meet integration",
    });

    // ========================================
    // Meetings Table
    // ========================================
    this.meetingsTable = new dynamodb.Table(this, "MeetingsTable", {
      tableName: `ek-transcript-meetings-${environment}`,
      partitionKey: {
        name: "meeting_id",
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true,
      },
      removalPolicy:
        environment === "prod"
          ? cdk.RemovalPolicy.RETAIN
          : cdk.RemovalPolicy.DESTROY,
    });

    // GSI: user_id + start_time (ユーザーの会議一覧取得用)
    this.meetingsTable.addGlobalSecondaryIndex({
      indexName: "user_id-start_time-index",
      partitionKey: {
        name: "user_id",
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: "start_time",
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // GSI: calendar_event_id (カレンダーイベントIDからの検索用)
    this.meetingsTable.addGlobalSecondaryIndex({
      indexName: "calendar_event_id-index",
      partitionKey: {
        name: "calendar_event_id",
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // ========================================
    // Google Tokens Table (with KMS encryption)
    // ========================================
    this.googleTokensTable = new dynamodb.Table(this, "GoogleTokensTable", {
      tableName: `ek-transcript-google-tokens-${environment}`,
      partitionKey: {
        name: "user_id",
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.CUSTOMER_MANAGED,
      encryptionKey: this.tokenEncryptionKey,
      removalPolicy:
        environment === "prod"
          ? cdk.RemovalPolicy.RETAIN
          : cdk.RemovalPolicy.DESTROY,
    });

    // ========================================
    // Event Subscriptions Table
    // ========================================
    this.subscriptionsTable = new dynamodb.Table(this, "SubscriptionsTable", {
      tableName: `ek-transcript-event-subscriptions-${environment}`,
      partitionKey: {
        name: "subscription_id",
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: "expire_time",
      removalPolicy:
        environment === "prod"
          ? cdk.RemovalPolicy.RETAIN
          : cdk.RemovalPolicy.DESTROY,
    });

    // GSI: space_id (Space からの購読検索用)
    this.subscriptionsTable.addGlobalSecondaryIndex({
      indexName: "space_id-index",
      partitionKey: {
        name: "space_id",
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // ========================================
    // Recordings Table (録画キャッシュ)
    // ========================================
    this.recordingsTable = new dynamodb.Table(this, "RecordingsTable", {
      tableName: `ek-transcript-recordings-${environment}`,
      partitionKey: {
        name: "user_id",
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: "recording_name",
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy:
        environment === "prod"
          ? cdk.RemovalPolicy.RETAIN
          : cdk.RemovalPolicy.DESTROY,
    });

    // GSI: drive_file_id (Drive ファイル ID からの検索用)
    this.recordingsTable.addGlobalSecondaryIndex({
      indexName: "drive_file_id-index",
      partitionKey: {
        name: "drive_file_id",
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // GSI: status (ステータスでの検索用)
    this.recordingsTable.addGlobalSecondaryIndex({
      indexName: "user_id-status-index",
      partitionKey: {
        name: "user_id",
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: "status",
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // ========================================
    // Outputs
    // ========================================
    new cdk.CfnOutput(this, "MeetingsTableName", {
      value: this.meetingsTable.tableName,
      exportName: `${id}-MeetingsTableName`,
    });

    new cdk.CfnOutput(this, "MeetingsTableArn", {
      value: this.meetingsTable.tableArn,
      exportName: `${id}-MeetingsTableArn`,
    });

    new cdk.CfnOutput(this, "GoogleTokensTableName", {
      value: this.googleTokensTable.tableName,
      exportName: `${id}-GoogleTokensTableName`,
    });

    new cdk.CfnOutput(this, "GoogleTokensTableArn", {
      value: this.googleTokensTable.tableArn,
      exportName: `${id}-GoogleTokensTableArn`,
    });

    new cdk.CfnOutput(this, "SubscriptionsTableName", {
      value: this.subscriptionsTable.tableName,
      exportName: `${id}-SubscriptionsTableName`,
    });

    new cdk.CfnOutput(this, "SubscriptionsTableArn", {
      value: this.subscriptionsTable.tableArn,
      exportName: `${id}-SubscriptionsTableArn`,
    });

    new cdk.CfnOutput(this, "TokenEncryptionKeyArn", {
      value: this.tokenEncryptionKey.keyArn,
      exportName: `${id}-TokenEncryptionKeyArn`,
    });

    new cdk.CfnOutput(this, "GoogleOAuthSecretArn", {
      value: this.googleOAuthSecret.secretArn,
      exportName: `${id}-GoogleOAuthSecretArn`,
    });

    new cdk.CfnOutput(this, "RecordingsTableName", {
      value: this.recordingsTable.tableName,
      exportName: `${id}-RecordingsTableName`,
    });

    new cdk.CfnOutput(this, "RecordingsTableArn", {
      value: this.recordingsTable.tableArn,
      exportName: `${id}-RecordingsTableArn`,
    });
  }
}
