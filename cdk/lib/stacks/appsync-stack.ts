import * as cdk from "aws-cdk-lib";
import * as appsync from "aws-cdk-lib/aws-appsync";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambdaNodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as path from "path";
import { Construct } from "constructs";

export interface AppSyncStackProps extends cdk.StackProps {
  environment: string;
  userPool: cognito.IUserPool;
  interviewsTable: dynamodb.ITable;
  inputBucket: s3.IBucket;
  outputBucket: s3.IBucket;
  meetingsTable?: dynamodb.ITable;
  calendarSyncLambda?: lambda.IFunction;
  googleAuthLambda?: lambda.IFunction;
}

export class AppSyncStack extends cdk.Stack {
  public readonly graphqlApi: appsync.GraphqlApi;
  public readonly eventsApi: appsync.EventApi;

  constructor(scope: Construct, id: string, props: AppSyncStackProps) {
    super(scope, id, props);

    const { environment, userPool, interviewsTable, inputBucket, outputBucket, meetingsTable, calendarSyncLambda, googleAuthLambda } = props;

    // Presigned URL Lambda (Upload)
    const presignedUrlLambda = new lambdaNodejs.NodejsFunction(
      this,
      "PresignedUrlLambda",
      {
        functionName: `ek-transcript-presigned-url-${environment}`,
        runtime: lambda.Runtime.NODEJS_20_X,
        entry: path.join(__dirname, "../lambdas/presigned-url/index.ts"),
        handler: "handler",
        environment: {
          BUCKET_NAME: inputBucket.bucketName,
          TABLE_NAME: interviewsTable.tableName,
        },
        timeout: cdk.Duration.seconds(30),
        memorySize: 256,
        bundling: {
          minify: true,
          sourceMap: false,
          externalModules: [],
        },
      }
    );

    // Grant S3 permissions for upload
    inputBucket.grantPut(presignedUrlLambda);
    // Grant DynamoDB permissions for storing upload metadata
    interviewsTable.grantWriteData(presignedUrlLambda);

    // Video URL Lambda (Download/Playback)
    const videoUrlLambda = new lambdaNodejs.NodejsFunction(
      this,
      "VideoUrlLambda",
      {
        functionName: `ek-transcript-video-url-${environment}`,
        runtime: lambda.Runtime.NODEJS_20_X,
        entry: path.join(__dirname, "../lambdas/presigned-url/index.ts"),
        handler: "getVideoUrlHandler",
        environment: {
          BUCKET_NAME: inputBucket.bucketName,
          OUTPUT_BUCKET_NAME: outputBucket.bucketName,
        },
        timeout: cdk.Duration.seconds(30),
        memorySize: 256,
        bundling: {
          minify: true,
          sourceMap: false,
          externalModules: [],
        },
      }
    );

    // Grant S3 permissions for read (input bucket for videos, output bucket for analysis/transcripts)
    inputBucket.grantRead(videoUrlLambda);
    outputBucket.grantRead(videoUrlLambda);

    // GraphQL API with Cognito User Pool as default auth
    this.graphqlApi = new appsync.GraphqlApi(this, "GraphqlApi", {
      name: `ek-transcript-graphql-${environment}`,
      definition: appsync.Definition.fromFile(
        path.join(__dirname, "../graphql/schema.graphql")
      ),
      authorizationConfig: {
        defaultAuthorization: {
          authorizationType: appsync.AuthorizationType.USER_POOL,
          userPoolConfig: {
            userPool: userPool,
          },
        },
        additionalAuthorizationModes: [
          {
            authorizationType: appsync.AuthorizationType.IAM,
          },
        ],
      },
      xrayEnabled: true,
      logConfig: {
        fieldLogLevel: appsync.FieldLogLevel.ERROR,
      },
    });

    // DynamoDB Data Source
    const interviewsDataSource = this.graphqlApi.addDynamoDbDataSource(
      "InterviewsDataSource",
      interviewsTable
    );

    // Lambda Data Source for Presigned URL (Upload)
    const presignedUrlDataSource = this.graphqlApi.addLambdaDataSource(
      "PresignedUrlDataSource",
      presignedUrlLambda
    );

    // Lambda Data Source for Video URL (Playback)
    const videoUrlDataSource = this.graphqlApi.addLambdaDataSource(
      "VideoUrlDataSource",
      videoUrlLambda
    );

    // Resolvers using JavaScript runtime (2025 best practice)
    const resolversPath = path.join(__dirname, "../graphql/resolvers");

    // getInterview resolver
    new appsync.Resolver(this, "GetInterviewResolver", {
      api: this.graphqlApi,
      typeName: "Query",
      fieldName: "getInterview",
      dataSource: interviewsDataSource,
      runtime: appsync.FunctionRuntime.JS_1_0_0,
      code: appsync.Code.fromAsset(path.join(resolversPath, "getInterview.js")),
    });

    // listInterviews resolver
    new appsync.Resolver(this, "ListInterviewsResolver", {
      api: this.graphqlApi,
      typeName: "Query",
      fieldName: "listInterviews",
      dataSource: interviewsDataSource,
      runtime: appsync.FunctionRuntime.JS_1_0_0,
      code: appsync.Code.fromAsset(path.join(resolversPath, "listInterviews.js")),
    });

    // listInterviewsBySegment resolver
    new appsync.Resolver(this, "ListInterviewsBySegmentResolver", {
      api: this.graphqlApi,
      typeName: "Query",
      fieldName: "listInterviewsBySegment",
      dataSource: interviewsDataSource,
      runtime: appsync.FunctionRuntime.JS_1_0_0,
      code: appsync.Code.fromAsset(
        path.join(resolversPath, "listInterviewsBySegment.js")
      ),
    });

    // createInterview resolver
    new appsync.Resolver(this, "CreateInterviewResolver", {
      api: this.graphqlApi,
      typeName: "Mutation",
      fieldName: "createInterview",
      dataSource: interviewsDataSource,
      runtime: appsync.FunctionRuntime.JS_1_0_0,
      code: appsync.Code.fromAsset(
        path.join(resolversPath, "createInterview.js")
      ),
    });

    // updateInterview resolver
    new appsync.Resolver(this, "UpdateInterviewResolver", {
      api: this.graphqlApi,
      typeName: "Mutation",
      fieldName: "updateInterview",
      dataSource: interviewsDataSource,
      runtime: appsync.FunctionRuntime.JS_1_0_0,
      code: appsync.Code.fromAsset(
        path.join(resolversPath, "updateInterview.js")
      ),
    });

    // deleteInterview resolver
    new appsync.Resolver(this, "DeleteInterviewResolver", {
      api: this.graphqlApi,
      typeName: "Mutation",
      fieldName: "deleteInterview",
      dataSource: interviewsDataSource,
      runtime: appsync.FunctionRuntime.JS_1_0_0,
      code: appsync.Code.fromAsset(
        path.join(resolversPath, "deleteInterview.js")
      ),
    });

    // getUploadUrl resolver (Lambda)
    new appsync.Resolver(this, "GetUploadUrlResolver", {
      api: this.graphqlApi,
      typeName: "Query",
      fieldName: "getUploadUrl",
      dataSource: presignedUrlDataSource,
    });

    // getVideoUrl resolver (Lambda)
    new appsync.Resolver(this, "GetVideoUrlResolver", {
      api: this.graphqlApi,
      typeName: "Query",
      fieldName: "getVideoUrl",
      dataSource: videoUrlDataSource,
    });

    // ========================================
    // Google Meet Integration Resolvers
    // ========================================
    if (meetingsTable) {
      // Meetings DynamoDB Data Source
      const meetingsDataSource = this.graphqlApi.addDynamoDbDataSource(
        "MeetingsDataSource",
        meetingsTable
      );

      // getMeeting resolver
      new appsync.Resolver(this, "GetMeetingResolver", {
        api: this.graphqlApi,
        typeName: "Query",
        fieldName: "getMeeting",
        dataSource: meetingsDataSource,
        runtime: appsync.FunctionRuntime.JS_1_0_0,
        code: appsync.Code.fromAsset(path.join(resolversPath, "getMeeting.js")),
      });

      // listMeetings resolver
      new appsync.Resolver(this, "ListMeetingsResolver", {
        api: this.graphqlApi,
        typeName: "Query",
        fieldName: "listMeetings",
        dataSource: meetingsDataSource,
        runtime: appsync.FunctionRuntime.JS_1_0_0,
        code: appsync.Code.fromAsset(path.join(resolversPath, "listMeetings.js")),
      });

      // createMeeting resolver
      new appsync.Resolver(this, "CreateMeetingResolver", {
        api: this.graphqlApi,
        typeName: "Mutation",
        fieldName: "createMeeting",
        dataSource: meetingsDataSource,
        runtime: appsync.FunctionRuntime.JS_1_0_0,
        code: appsync.Code.fromAsset(path.join(resolversPath, "createMeeting.js")),
      });

      // updateMeeting resolver
      new appsync.Resolver(this, "UpdateMeetingResolver", {
        api: this.graphqlApi,
        typeName: "Mutation",
        fieldName: "updateMeeting",
        dataSource: meetingsDataSource,
        runtime: appsync.FunctionRuntime.JS_1_0_0,
        code: appsync.Code.fromAsset(path.join(resolversPath, "updateMeeting.js")),
      });

      // deleteMeeting resolver
      new appsync.Resolver(this, "DeleteMeetingResolver", {
        api: this.graphqlApi,
        typeName: "Mutation",
        fieldName: "deleteMeeting",
        dataSource: meetingsDataSource,
        runtime: appsync.FunctionRuntime.JS_1_0_0,
        code: appsync.Code.fromAsset(path.join(resolversPath, "deleteMeeting.js")),
      });
    }

    // Calendar Sync Lambda resolver
    if (calendarSyncLambda) {
      const calendarSyncDataSource = this.graphqlApi.addLambdaDataSource(
        "CalendarSyncDataSource",
        calendarSyncLambda
      );

      // syncCalendar resolver
      new appsync.Resolver(this, "SyncCalendarResolver", {
        api: this.graphqlApi,
        typeName: "Mutation",
        fieldName: "syncCalendar",
        dataSource: calendarSyncDataSource,
        runtime: appsync.FunctionRuntime.JS_1_0_0,
        code: appsync.Code.fromAsset(path.join(resolversPath, "syncCalendar.js")),
      });

      // syncMeetRecordings resolver
      new appsync.Resolver(this, "SyncMeetRecordingsResolver", {
        api: this.graphqlApi,
        typeName: "Mutation",
        fieldName: "syncMeetRecordings",
        dataSource: calendarSyncDataSource,
        runtime: appsync.FunctionRuntime.JS_1_0_0,
        code: appsync.Code.fromAsset(path.join(resolversPath, "syncMeetRecordings.js")),
      });

      // analyzeRecording resolver
      new appsync.Resolver(this, "AnalyzeRecordingResolver", {
        api: this.graphqlApi,
        typeName: "Mutation",
        fieldName: "analyzeRecording",
        dataSource: calendarSyncDataSource,
        runtime: appsync.FunctionRuntime.JS_1_0_0,
        code: appsync.Code.fromAsset(path.join(resolversPath, "analyzeRecording.js")),
      });

      // listRecordings resolver (キャッシュから高速取得)
      new appsync.Resolver(this, "ListRecordingsResolver", {
        api: this.graphqlApi,
        typeName: "Query",
        fieldName: "listRecordings",
        dataSource: calendarSyncDataSource,
        runtime: appsync.FunctionRuntime.JS_1_0_0,
        code: appsync.Code.fromAsset(path.join(resolversPath, "listRecordings.js")),
      });
    }

    // Google Auth Lambda resolvers
    if (googleAuthLambda) {
      const googleAuthDataSource = this.graphqlApi.addLambdaDataSource(
        "GoogleAuthDataSource",
        googleAuthLambda
      );

      // getGoogleAuthUrl resolver
      new appsync.Resolver(this, "GetGoogleAuthUrlResolver", {
        api: this.graphqlApi,
        typeName: "Query",
        fieldName: "getGoogleAuthUrl",
        dataSource: googleAuthDataSource,
        runtime: appsync.FunctionRuntime.JS_1_0_0,
        code: appsync.Code.fromAsset(path.join(resolversPath, "getGoogleAuthUrl.js")),
      });

      // getGoogleConnectionStatus resolver
      new appsync.Resolver(this, "GetGoogleConnectionStatusResolver", {
        api: this.graphqlApi,
        typeName: "Query",
        fieldName: "getGoogleConnectionStatus",
        dataSource: googleAuthDataSource,
        runtime: appsync.FunctionRuntime.JS_1_0_0,
        code: appsync.Code.fromAsset(path.join(resolversPath, "getGoogleConnectionStatus.js")),
      });

      // connectGoogle resolver
      new appsync.Resolver(this, "ConnectGoogleResolver", {
        api: this.graphqlApi,
        typeName: "Mutation",
        fieldName: "connectGoogle",
        dataSource: googleAuthDataSource,
        runtime: appsync.FunctionRuntime.JS_1_0_0,
        code: appsync.Code.fromAsset(path.join(resolversPath, "connectGoogle.js")),
      });

      // disconnectGoogle resolver
      new appsync.Resolver(this, "DisconnectGoogleResolver", {
        api: this.graphqlApi,
        typeName: "Mutation",
        fieldName: "disconnectGoogle",
        dataSource: googleAuthDataSource,
        runtime: appsync.FunctionRuntime.JS_1_0_0,
        code: appsync.Code.fromAsset(path.join(resolversPath, "disconnectGoogle.js")),
      });
    }

    // Events API for real-time pub/sub (2025 feature)
    this.eventsApi = new appsync.EventApi(this, "EventsApi", {
      apiName: `ek-transcript-events-${environment}`,
      authorizationConfig: {
        authProviders: [
          {
            authorizationType: appsync.AppSyncAuthorizationType.USER_POOL,
            cognitoConfig: {
              userPool: userPool,
            },
          },
          {
            authorizationType: appsync.AppSyncAuthorizationType.IAM,
          },
        ],
        connectionAuthModeTypes: [
          appsync.AppSyncAuthorizationType.USER_POOL,
          appsync.AppSyncAuthorizationType.IAM,
        ],
        defaultPublishAuthModeTypes: [
          appsync.AppSyncAuthorizationType.USER_POOL,
          appsync.AppSyncAuthorizationType.IAM,
        ],
        defaultSubscribeAuthModeTypes: [
          appsync.AppSyncAuthorizationType.USER_POOL,
        ],
      },
    });

    // Channel Namespaces for Events API
    new appsync.ChannelNamespace(this, "InterviewsNamespace", {
      api: this.eventsApi,
      channelNamespaceName: "interviews",
    });

    new appsync.ChannelNamespace(this, "ProgressNamespace", {
      api: this.eventsApi,
      channelNamespaceName: "progress",
    });

    // Meetings channel namespace for Google Meet events
    new appsync.ChannelNamespace(this, "MeetingsNamespace", {
      api: this.eventsApi,
      channelNamespaceName: "meetings",
    });

    // Outputs
    new cdk.CfnOutput(this, "GraphqlApiUrl", {
      value: this.graphqlApi.graphqlUrl,
      exportName: `${id}-GraphqlApiUrl`,
      description: "GraphQL API URL",
    });

    new cdk.CfnOutput(this, "GraphqlApiId", {
      value: this.graphqlApi.apiId,
      exportName: `${id}-GraphqlApiId`,
      description: "GraphQL API ID",
    });

    new cdk.CfnOutput(this, "EventsApiEndpoint", {
      value: `https://${this.eventsApi.httpDns}/event`,
      exportName: `${id}-EventsApiEndpoint`,
      description: "Events API HTTP endpoint",
    });

    new cdk.CfnOutput(this, "EventsApiRealtimeEndpoint", {
      value: `wss://${this.eventsApi.realtimeDns}/event/realtime`,
      exportName: `${id}-EventsApiRealtimeEndpoint`,
      description: "Events API WebSocket endpoint",
    });
  }
}
