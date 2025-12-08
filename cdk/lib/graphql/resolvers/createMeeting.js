/**
 * createMeeting リゾルバー
 * 会議を作成（DynamoDB）
 * Lambda 経由で Google Calendar + Meet Space も作成
 */

import { util } from "@aws-appsync/utils";

export function request(ctx) {
  const input = ctx.args.input;
  const userId = ctx.identity.sub;
  const now = util.time.nowISO8601();
  const meetingId = util.autoId();

  const item = {
    meeting_id: meetingId,
    user_id: userId,
    title: input.title,
    description: input.description || null,
    start_time: input.start_time,
    end_time: input.end_time,
    status: "SCHEDULED",
    auto_recording: input.auto_recording !== false,
    auto_transcription: input.auto_transcription !== false,
    created_at: now,
    updated_at: now,
  };

  return {
    operation: "PutItem",
    key: util.dynamodb.toMapValues({
      meeting_id: meetingId,
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
