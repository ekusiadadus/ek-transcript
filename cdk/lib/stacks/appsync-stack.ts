import * as cdk from "aws-cdk-lib";
import * as appsync from "aws-cdk-lib/aws-appsync";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as path from "path";
import { Construct } from "constructs";

export interface AppSyncStackProps extends cdk.StackProps {
  environment: string;
  userPool: cognito.IUserPool;
  interviewsTable: dynamodb.ITable;
}

export class AppSyncStack extends cdk.Stack {
  public readonly graphqlApi: appsync.GraphqlApi;
  public readonly eventsApi: appsync.EventApi;

  constructor(scope: Construct, id: string, props: AppSyncStackProps) {
    super(scope, id, props);

    const { environment, userPool, interviewsTable } = props;

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
