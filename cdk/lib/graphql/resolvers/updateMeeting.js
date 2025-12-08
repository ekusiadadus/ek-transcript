/**
 * updateMeeting リゾルバー
 * 会議を更新
 */

import { util } from "@aws-appsync/utils";

export function request(ctx) {
  const input = ctx.args.input;
  const now = util.time.nowISO8601();

  const expressionParts = [];
  const expressionNames = {};
  const expressionValues = {};

  // 更新可能なフィールド
  const fields = [
    "title",
    "description",
    "start_time",
    "end_time",
    "status",
    "auto_recording",
    "auto_transcription",
    "google_calendar_event_id",
    "google_meet_space_id",
    "google_meet_uri",
    "recording_file_id",
    "recording_s3_key",
    "interview_id",
  ];

  fields.forEach((field) => {
    if (input[field] !== undefined && input[field] !== null) {
      expressionParts.push(`#${field} = :${field}`);
      expressionNames[`#${field}`] = field;
      expressionValues[`:${field}`] = input[field];
    }
  });

  // updated_at は常に更新
  expressionParts.push("#updated_at = :updated_at");
  expressionNames["#updated_at"] = "updated_at";
  expressionValues[":updated_at"] = now;

  return {
    operation: "UpdateItem",
    key: util.dynamodb.toMapValues({
      meeting_id: input.meeting_id,
    }),
    update: {
      expression: `SET ${expressionParts.join(", ")}`,
      expressionNames,
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
