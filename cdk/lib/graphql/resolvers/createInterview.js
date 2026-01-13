/**
 * createInterview リゾルバー
 * 新規インタビュー作成（Step Functions / IAM 認証用）
 */

import { util } from "@aws-appsync/utils";

export function request(ctx) {
  const input = ctx.args.input;
  const now = util.time.nowISO8601();

  const item = {
    interview_id: input.interview_id,
    segment: input.segment,
    created_at: now,
    analysis_key: input.analysis_key,
    transcript_key: input.transcript_key,
  };

  // オプションフィールド
  if (input.project_id) {
    item.project_id = input.project_id;
  }
  if (input.video_key) {
    item.video_key = input.video_key;
  }
  if (input.diarization_key) {
    item.diarization_key = input.diarization_key;
  }
  if (input.total_score !== null && input.total_score !== undefined) {
    item.total_score = input.total_score;
  }
  if (input.user_id) {
    item.user_id = input.user_id;
  }

  return {
    operation: "PutItem",
    key: util.dynamodb.toMapValues({
      interview_id: input.interview_id,
    }),
    attributeValues: util.dynamodb.toMapValues(item),
  };
}

export function response(ctx) {
  if (ctx.error) {
    util.error(ctx.error.message, ctx.error.type);
  }
  return ctx.result;
}
