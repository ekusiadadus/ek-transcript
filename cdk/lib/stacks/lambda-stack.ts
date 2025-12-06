import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as iam from "aws-cdk-lib/aws-iam";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as ecr_assets from "aws-cdk-lib/aws-ecr-assets";
import * as path from "path";
import { Construct } from "constructs";

export interface LambdaStackProps extends cdk.StackProps {
  environment: string;
  inputBucket: s3.IBucket;
  outputBucket: s3.IBucket;
  openaiSecret: secretsmanager.ISecret;
  huggingfaceSecret: secretsmanager.ISecret;
}

export class LambdaStack extends cdk.Stack {
  public readonly extractAudioFn: lambda.Function;
  public readonly diarizeFn: lambda.Function;
  public readonly splitBySpeakerFn: lambda.Function;
  public readonly transcribeFn: lambda.Function;
  public readonly aggregateResultsFn: lambda.Function;
  public readonly llmAnalysisFn: lambda.Function;

  constructor(scope: Construct, id: string, props: LambdaStackProps) {
    super(scope, id, props);

    const {
      environment,
      inputBucket,
      outputBucket,
      openaiSecret,
      huggingfaceSecret,
    } = props;

    const lambdasPath = path.join(__dirname, "../../../lambdas");

    // Common Lambda execution role
    const lambdaRole = new iam.Role(this, "LambdaExecutionRole", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AWSLambdaBasicExecutionRole"
        ),
      ],
    });

    // Grant S3 permissions
    inputBucket.grantRead(lambdaRole);
    outputBucket.grantReadWrite(lambdaRole);

    // ExtractAudio Lambda
    this.extractAudioFn = new lambda.DockerImageFunction(
      this,
      "ExtractAudioFn",
      {
        functionName: `ek-transcript-extract-audio-${environment}`,
        code: lambda.DockerImageCode.fromImageAsset(
          path.join(lambdasPath, "extract_audio")
        ),
        memorySize: 3008,
        timeout: cdk.Duration.minutes(15),
        ephemeralStorageSize: cdk.Size.mebibytes(10240),
        environment: {
          INPUT_BUCKET: inputBucket.bucketName,
          OUTPUT_BUCKET: outputBucket.bucketName,
          ENVIRONMENT: environment,
        },
        role: lambdaRole,
        architecture: lambda.Architecture.X86_64,
      }
    );

    // Diarize Lambda (larger memory for pyannote)
    // HF_TOKEN is required at build time - set via environment variable
    const hfToken = process.env.HF_TOKEN || "";
    this.diarizeFn = new lambda.DockerImageFunction(this, "DiarizeFn", {
      functionName: `ek-transcript-diarize-${environment}`,
      code: lambda.DockerImageCode.fromImageAsset(
        path.join(lambdasPath, "diarize"),
        {
          buildArgs: {
            HF_TOKEN: hfToken,
          },
        }
      ),
      memorySize: 10240, // Max Lambda memory for pyannote
      timeout: cdk.Duration.minutes(15),
      ephemeralStorageSize: cdk.Size.mebibytes(10240),
      environment: {
        INPUT_BUCKET: inputBucket.bucketName,
        OUTPUT_BUCKET: outputBucket.bucketName,
        HF_TOKEN_SECRET_ARN: huggingfaceSecret.secretArn,
        HF_HOME: "/opt/huggingface", // Pre-downloaded model location
        ENVIRONMENT: environment,
      },
      role: lambdaRole,
      architecture: lambda.Architecture.X86_64,
    });
    huggingfaceSecret.grantRead(this.diarizeFn);

    // SplitBySpeaker Lambda
    this.splitBySpeakerFn = new lambda.DockerImageFunction(
      this,
      "SplitBySpeakerFn",
      {
        functionName: `ek-transcript-split-by-speaker-${environment}`,
        code: lambda.DockerImageCode.fromImageAsset(
          path.join(lambdasPath, "split_by_speaker")
        ),
        memorySize: 3008,
        timeout: cdk.Duration.minutes(15),
        ephemeralStorageSize: cdk.Size.mebibytes(10240),
        environment: {
          INPUT_BUCKET: inputBucket.bucketName,
          OUTPUT_BUCKET: outputBucket.bucketName,
          ENVIRONMENT: environment,
        },
        role: lambdaRole,
        architecture: lambda.Architecture.X86_64,
      }
    );

    // Transcribe Lambda - model pre-downloaded in Docker image
    const whisperModel = "medium";
    this.transcribeFn = new lambda.DockerImageFunction(this, "TranscribeFn", {
      functionName: `ek-transcript-transcribe-${environment}`,
      code: lambda.DockerImageCode.fromImageAsset(
        path.join(lambdasPath, "transcribe"),
        {
          buildArgs: {
            WHISPER_MODEL: whisperModel,
          },
        }
      ),
      memorySize: 6144, // For faster-whisper medium model
      timeout: cdk.Duration.minutes(15),
      environment: {
        INPUT_BUCKET: inputBucket.bucketName,
        OUTPUT_BUCKET: outputBucket.bucketName,
        WHISPER_MODEL: whisperModel,
        WHISPER_MODEL_DIR: "/opt/whisper-models", // Pre-downloaded model location
        ENVIRONMENT: environment,
      },
      role: lambdaRole,
      architecture: lambda.Architecture.X86_64,
    });

    // AggregateResults Lambda
    this.aggregateResultsFn = new lambda.DockerImageFunction(
      this,
      "AggregateResultsFn",
      {
        functionName: `ek-transcript-aggregate-results-${environment}`,
        code: lambda.DockerImageCode.fromImageAsset(
          path.join(lambdasPath, "aggregate_results")
        ),
        memorySize: 1024,
        timeout: cdk.Duration.minutes(5),
        environment: {
          INPUT_BUCKET: inputBucket.bucketName,
          OUTPUT_BUCKET: outputBucket.bucketName,
          ENVIRONMENT: environment,
        },
        role: lambdaRole,
        architecture: lambda.Architecture.X86_64,
      }
    );

    // LLMAnalysis Lambda
    this.llmAnalysisFn = new lambda.DockerImageFunction(this, "LLMAnalysisFn", {
      functionName: `ek-transcript-llm-analysis-${environment}`,
      code: lambda.DockerImageCode.fromImageAsset(
        path.join(lambdasPath, "llm_analysis")
      ),
      memorySize: 1024,
      timeout: cdk.Duration.minutes(10),
      environment: {
        INPUT_BUCKET: inputBucket.bucketName,
        OUTPUT_BUCKET: outputBucket.bucketName,
        OPENAI_SECRET_ARN: openaiSecret.secretArn,
        OPENAI_MODEL: "gpt-5-mini",
        ENVIRONMENT: environment,
      },
      role: lambdaRole,
      architecture: lambda.Architecture.X86_64,
    });
    openaiSecret.grantRead(this.llmAnalysisFn);

    // Outputs
    new cdk.CfnOutput(this, "ExtractAudioFnArn", {
      value: this.extractAudioFn.functionArn,
      exportName: `${id}-ExtractAudioFnArn`,
    });

    new cdk.CfnOutput(this, "DiarizeFnArn", {
      value: this.diarizeFn.functionArn,
      exportName: `${id}-DiarizeFnArn`,
    });

    new cdk.CfnOutput(this, "SplitBySpeakerFnArn", {
      value: this.splitBySpeakerFn.functionArn,
      exportName: `${id}-SplitBySpeakerFnArn`,
    });

    new cdk.CfnOutput(this, "TranscribeFnArn", {
      value: this.transcribeFn.functionArn,
      exportName: `${id}-TranscribeFnArn`,
    });

    new cdk.CfnOutput(this, "AggregateResultsFnArn", {
      value: this.aggregateResultsFn.functionArn,
      exportName: `${id}-AggregateResultsFnArn`,
    });

    new cdk.CfnOutput(this, "LLMAnalysisFnArn", {
      value: this.llmAnalysisFn.functionArn,
      exportName: `${id}-LLMAnalysisFnArn`,
    });
  }
}
