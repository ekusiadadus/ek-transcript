import * as cdk from "aws-cdk-lib";
import * as cognito from "aws-cdk-lib/aws-cognito";
import { Construct } from "constructs";

export interface AuthStackProps extends cdk.StackProps {
  environment: string;
}

export class AuthStack extends cdk.Stack {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;

  constructor(scope: Construct, id: string, props: AuthStackProps) {
    super(scope, id, props);

    const { environment } = props;

    // Cognito User Pool with Managed Login (2025 recommended)
    this.userPool = new cognito.UserPool(this, "InterviewUserPool", {
      userPoolName: `ek-transcript-users-${environment}`,
      selfSignUpEnabled: true,
      signInAliases: {
        email: true,
      },
      autoVerify: {
        email: true,
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy:
        environment === "prod"
          ? cdk.RemovalPolicy.RETAIN
          : cdk.RemovalPolicy.DESTROY,
      // Standard attributes
      standardAttributes: {
        email: {
          required: true,
          mutable: true,
        },
      },
      // MFA configuration
      mfa: cognito.Mfa.OPTIONAL,
      mfaSecondFactor: {
        sms: false,
        otp: true,
      },
    });

    // User Pool Client for web application
    this.userPoolClient = this.userPool.addClient("WebClient", {
      userPoolClientName: `ek-transcript-web-client-${environment}`,
      authFlows: {
        userSrp: true,
        userPassword: false,
        custom: true,
      },
      oAuth: {
        flows: {
          authorizationCodeGrant: true,
          implicitCodeGrant: false,
        },
        scopes: [
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.PROFILE,
        ],
        callbackUrls:
          environment === "prod"
            ? ["https://your-production-domain.com/callback"]
            : ["http://localhost:3000/callback", "http://localhost:5173/callback"],
        logoutUrls:
          environment === "prod"
            ? ["https://your-production-domain.com/logout"]
            : ["http://localhost:3000/logout", "http://localhost:5173/logout"],
      },
      preventUserExistenceErrors: true,
      generateSecret: false, // For SPA clients
      accessTokenValidity: cdk.Duration.hours(1),
      idTokenValidity: cdk.Duration.hours(1),
      refreshTokenValidity: cdk.Duration.days(30),
    });

    // Outputs
    new cdk.CfnOutput(this, "UserPoolId", {
      value: this.userPool.userPoolId,
      exportName: `${id}-UserPoolId`,
      description: "Cognito User Pool ID",
    });

    new cdk.CfnOutput(this, "UserPoolClientId", {
      value: this.userPoolClient.userPoolClientId,
      exportName: `${id}-UserPoolClientId`,
      description: "Cognito User Pool Client ID",
    });

    new cdk.CfnOutput(this, "UserPoolArn", {
      value: this.userPool.userPoolArn,
      exportName: `${id}-UserPoolArn`,
      description: "Cognito User Pool ARN",
    });
  }
}
