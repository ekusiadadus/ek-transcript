/**
 * updateInterview リゾルバー
 * インタビュー情報更新
 */

import { util } from "@aws-appsync/utils";

export function request(ctx) {
  const input = ctx.args.input;

  // 更新式を動的に構築
  const expressionNames = {};
  const expressionValues = {};
  const updateExpressions = [];

  const fields = [
    "segment",
    "analysis_key",
    "transcript_key",
    "video_key",
    "diarization_key",
    "total_score",
  ];

  fields.forEach((field) => {
    if (input[field] !== null && input[field] !== undefined) {
      expressionNames[`#${field}`] = field;
      expressionValues[`:${field}`] = input[field];
      updateExpressions.push(`#${field} = :${field}`);
    }
  });

  // 更新日時を追加
  expressionNames["#updated_at"] = "updated_at";
  expressionValues[":updated_at"] = util.time.nowISO8601();
  updateExpressions.push("#updated_at = :updated_at");

  return {
    operation: "UpdateItem",
    key: util.dynamodb.toMapValues({
      interview_id: input.interview_id,
    }),
    update: {
      expression: `SET ${updateExpressions.join(", ")}`,
      expressionNames: expressionNames,
      expressionValues: util.dynamodb.toMapValues(expressionValues),
    },
  };
}

export function response(ctx) {
  if (ctx.error) {
    util.error(ctx.error.message, ctx.error.type);
  }
  return ctx.result;
}
