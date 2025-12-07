#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { StorageStack } from "../lib/stacks/storage-stack";
import { LambdaStack } from "../lib/stacks/lambda-stack";
import { StepFunctionsStack } from "../lib/stacks/stepfunctions-stack";
import { AuthStack } from "../lib/stacks/auth-stack";
import { AppSyncStack } from "../lib/stacks/appsync-stack";

const app = new cdk.App();

// Get environment from context or default to 'dev'
const environment = app.node.tryGetContext("environment") || "dev";

// Common props
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION || "ap-northeast-1",
};

// Storage Stack
const storageStack = new StorageStack(app, `EkTranscriptStorage-${environment}`, {
  env,
  environment,
  description: "S3 buckets and Secrets Manager for ek-transcript",
});

// Lambda Stack
const lambdaStack = new LambdaStack(app, `EkTranscriptLambda-${environment}`, {
  env,
  environment,
  inputBucket: storageStack.inputBucket,
  outputBucket: storageStack.outputBucket,
  openaiSecret: storageStack.openaiSecret,
  huggingfaceSecret: storageStack.huggingfaceSecret,
  interviewsTable: storageStack.interviewsTable,
  description: "Lambda functions for ek-transcript pipeline",
});
lambdaStack.addDependency(storageStack);

// Step Functions Stack
const stepFunctionsStack = new StepFunctionsStack(
  app,
  `EkTranscriptStepFunctions-${environment}`,
  {
    env,
    environment,
    inputBucket: storageStack.inputBucket,
    outputBucket: storageStack.outputBucket,
    extractAudioFn: lambdaStack.extractAudioFn,
    chunkAudioFn: lambdaStack.chunkAudioFn,
    diarizeFn: lambdaStack.diarizeFn,
    mergeSpeakersFn: lambdaStack.mergeSpeakersFn,
    splitBySpeakerFn: lambdaStack.splitBySpeakerFn,
    transcribeFn: lambdaStack.transcribeFn,
    aggregateResultsFn: lambdaStack.aggregateResultsFn,
    llmAnalysisFn: lambdaStack.llmAnalysisFn,
    description: "Step Functions state machine for ek-transcript pipeline",
  }
);
stepFunctionsStack.addDependency(lambdaStack);

// Auth Stack (Cognito User Pool)
const authStack = new AuthStack(app, `EkTranscriptAuth-${environment}`, {
  env,
  environment,
  description: "Cognito User Pool for ek-transcript authentication",
});

// AppSync Stack (GraphQL + Events API)
const appSyncStack = new AppSyncStack(app, `EkTranscriptAppSync-${environment}`, {
  env,
  environment,
  userPool: authStack.userPool,
  interviewsTable: storageStack.interviewsTable,
  inputBucket: storageStack.inputBucket,
  description: "AppSync GraphQL and Events API for ek-transcript",
});
appSyncStack.addDependency(authStack);
appSyncStack.addDependency(storageStack);

// Tags
cdk.Tags.of(app).add("Project", "ek-transcript");
cdk.Tags.of(app).add("Environment", environment);
cdk.Tags.of(app).add("ManagedBy", "CDK");
