import * as cdk from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { AuthStack } from "../lib/stacks/auth-stack";

describe("AuthStack", () => {
  let app: cdk.App;
  let stack: AuthStack;
  let template: Template;

  beforeEach(() => {
    app = new cdk.App();
    stack = new AuthStack(app, "TestAuthStack", {
      environment: "test",
      env: { account: "123456789012", region: "ap-northeast-1" },
    });
    template = Template.fromStack(stack);
  });

  describe("Cognito User Pool", () => {
    test("creates user pool with correct name", () => {
      template.hasResourceProperties("AWS::Cognito::UserPool", {
        UserPoolName: "ek-transcript-users-test",
      });
    });

    test("user pool allows self sign up", () => {
      template.hasResourceProperties("AWS::Cognito::UserPool", {
        AdminCreateUserConfig: {
          AllowAdminCreateUserOnly: false,
        },
      });
    });

    test("user pool uses email as sign-in alias", () => {
      template.hasResourceProperties("AWS::Cognito::UserPool", {
        UsernameAttributes: ["email"],
      });
    });

    test("user pool auto-verifies email", () => {
      template.hasResourceProperties("AWS::Cognito::UserPool", {
        AutoVerifiedAttributes: ["email"],
      });
    });

    test("user pool has password policy", () => {
      template.hasResourceProperties("AWS::Cognito::UserPool", {
        Policies: {
          PasswordPolicy: {
            MinimumLength: 8,
            RequireLowercase: true,
            RequireUppercase: true,
            RequireNumbers: true,
          },
        },
      });
    });
  });

  describe("Cognito User Pool Client", () => {
    test("creates user pool client", () => {
      template.resourceCountIs("AWS::Cognito::UserPoolClient", 1);
    });

    test("client enables SRP auth flow", () => {
      template.hasResourceProperties("AWS::Cognito::UserPoolClient", {
        ExplicitAuthFlows: Match.arrayWith([
          "ALLOW_USER_SRP_AUTH",
          "ALLOW_REFRESH_TOKEN_AUTH",
        ]),
      });
    });
  });

  describe("Outputs", () => {
    test("exports user pool id", () => {
      template.hasOutput("UserPoolId", {});
    });

    test("exports user pool client id", () => {
      template.hasOutput("UserPoolClientId", {});
    });
  });
});
