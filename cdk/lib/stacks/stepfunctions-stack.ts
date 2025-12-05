import * as cdk from "aws-cdk-lib";
import * as sfn from "aws-cdk-lib/aws-stepfunctions";
import * as tasks from "aws-cdk-lib/aws-stepfunctions-tasks";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3n from "aws-cdk-lib/aws-s3-notifications";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as logs from "aws-cdk-lib/aws-logs";
import { Construct } from "constructs";

export interface StepFunctionsStackProps extends cdk.StackProps {
  environment: string;
  inputBucket: s3.IBucket;
  outputBucket: s3.IBucket;
  extractAudioFn: lambda.IFunction;
  diarizeFn: lambda.IFunction;
  splitBySpeakerFn: lambda.IFunction;
  transcribeFn: lambda.IFunction;
  aggregateResultsFn: lambda.IFunction;
  llmAnalysisFn: lambda.IFunction;
}

export class StepFunctionsStack extends cdk.Stack {
  public readonly stateMachine: sfn.StateMachine;

  constructor(scope: Construct, id: string, props: StepFunctionsStackProps) {
    super(scope, id, props);

    const {
      environment,
      inputBucket,
      outputBucket,
      extractAudioFn,
      diarizeFn,
      splitBySpeakerFn,
      transcribeFn,
      aggregateResultsFn,
      llmAnalysisFn,
    } = props;

    // Log group for state machine
    const logGroup = new logs.LogGroup(this, "StateMachineLogGroup", {
      logGroupName: `/aws/stepfunctions/ek-transcript-${environment}`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy:
        environment === "prod"
          ? cdk.RemovalPolicy.RETAIN
          : cdk.RemovalPolicy.DESTROY,
    });

    // Error handler state
    const handleError = new sfn.Pass(this, "HandleError", {
      parameters: {
        "error.$": "$.error",
        "cause.$": "$.cause",
        status: "FAILED",
      },
    });

    // ExtractAudio Task
    const extractAudioTask = new tasks.LambdaInvoke(this, "ExtractAudio", {
      lambdaFunction: extractAudioFn,
      outputPath: "$.Payload",
      retryOnServiceExceptions: true,
    });
    extractAudioTask.addRetry({
      errors: ["States.ALL"],
      maxAttempts: 2,
      interval: cdk.Duration.seconds(5),
      backoffRate: 2,
    });
    extractAudioTask.addCatch(handleError, {
      errors: ["States.ALL"],
      resultPath: "$.error",
    });

    // Diarize Task
    const diarizeTask = new tasks.LambdaInvoke(this, "Diarize", {
      lambdaFunction: diarizeFn,
      outputPath: "$.Payload",
      retryOnServiceExceptions: true,
    });
    diarizeTask.addRetry({
      errors: ["States.ALL"],
      maxAttempts: 2,
      interval: cdk.Duration.seconds(10),
      backoffRate: 2,
    });
    diarizeTask.addCatch(handleError, {
      errors: ["States.ALL"],
      resultPath: "$.error",
    });

    // SplitBySpeaker Task
    const splitBySpeakerTask = new tasks.LambdaInvoke(this, "SplitBySpeaker", {
      lambdaFunction: splitBySpeakerFn,
      outputPath: "$.Payload",
      retryOnServiceExceptions: true,
    });
    splitBySpeakerTask.addRetry({
      errors: ["States.ALL"],
      maxAttempts: 2,
      interval: cdk.Duration.seconds(5),
      backoffRate: 2,
    });
    splitBySpeakerTask.addCatch(handleError, {
      errors: ["States.ALL"],
      resultPath: "$.error",
    });

    // Transcribe Task (single segment)
    const transcribeTask = new tasks.LambdaInvoke(this, "Transcribe", {
      lambdaFunction: transcribeFn,
      outputPath: "$.Payload",
      retryOnServiceExceptions: true,
    });
    transcribeTask.addRetry({
      errors: ["States.ALL"],
      maxAttempts: 3,
      interval: cdk.Duration.seconds(5),
      backoffRate: 2,
    });

    // Map state for parallel transcription
    const transcribeSegments = new sfn.Map(this, "TranscribeSegments", {
      itemsPath: "$.segment_files",
      maxConcurrency: 10,
      parameters: {
        "bucket.$": "$.bucket",
        "segment_file.$": "$$.Map.Item.Value",
      },
      resultPath: "$.transcription_results",
    });
    transcribeSegments.itemProcessor(transcribeTask);
    transcribeSegments.addCatch(handleError, {
      errors: ["States.ALL"],
      resultPath: "$.error",
    });

    // AggregateResults Task
    const aggregateResultsTask = new tasks.LambdaInvoke(
      this,
      "AggregateResults",
      {
        lambdaFunction: aggregateResultsFn,
        outputPath: "$.Payload",
        retryOnServiceExceptions: true,
      }
    );
    aggregateResultsTask.addRetry({
      errors: ["States.ALL"],
      maxAttempts: 2,
      interval: cdk.Duration.seconds(5),
      backoffRate: 2,
    });
    aggregateResultsTask.addCatch(handleError, {
      errors: ["States.ALL"],
      resultPath: "$.error",
    });

    // LLMAnalysis Task
    const llmAnalysisTask = new tasks.LambdaInvoke(this, "LLMAnalysis", {
      lambdaFunction: llmAnalysisFn,
      outputPath: "$.Payload",
      retryOnServiceExceptions: true,
    });
    llmAnalysisTask.addRetry({
      errors: ["States.ALL"],
      maxAttempts: 3,
      interval: cdk.Duration.seconds(10),
      backoffRate: 2,
    });
    llmAnalysisTask.addCatch(handleError, {
      errors: ["States.ALL"],
      resultPath: "$.error",
    });

    // Success state
    const succeed = new sfn.Succeed(this, "ProcessingComplete", {
      comment: "Transcription pipeline completed successfully",
    });

    // Define workflow
    const definition = extractAudioTask
      .next(diarizeTask)
      .next(splitBySpeakerTask)
      .next(transcribeSegments)
      .next(aggregateResultsTask)
      .next(llmAnalysisTask)
      .next(succeed);

    // Create state machine
    this.stateMachine = new sfn.StateMachine(this, "TranscriptPipeline", {
      stateMachineName: `ek-transcript-pipeline-${environment}`,
      definitionBody: sfn.DefinitionBody.fromChainable(definition),
      timeout: cdk.Duration.hours(12),
      tracingEnabled: true,
      logs: {
        destination: logGroup,
        level: sfn.LogLevel.ALL,
        includeExecutionData: true,
      },
    });

    // S3 trigger for new video uploads
    // Note: This requires additional setup - Lambda trigger to start Step Functions
    // For now, we'll use EventBridge rule

    // EventBridge rule for completion notification
    const completionRule = new events.Rule(this, "CompletionRule", {
      ruleName: `ek-transcript-completion-${environment}`,
      eventPattern: {
        source: ["aws.states"],
        detailType: ["Step Functions Execution Status Change"],
        detail: {
          stateMachineArn: [this.stateMachine.stateMachineArn],
          status: ["SUCCEEDED", "FAILED", "TIMED_OUT"],
        },
      },
    });

    // Outputs
    new cdk.CfnOutput(this, "StateMachineArn", {
      value: this.stateMachine.stateMachineArn,
      exportName: `${id}-StateMachineArn`,
    });

    new cdk.CfnOutput(this, "StateMachineName", {
      value: this.stateMachine.stateMachineName!,
      exportName: `${id}-StateMachineName`,
    });
  }
}
