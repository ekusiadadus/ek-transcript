/**
 * getMeeting リゾルバー
 * 単一会議を meeting_id で取得
 */

import { util } from "@aws-appsync/utils";

export function request(ctx) {
  return {
    operation: "GetItem",
    key: util.dynamodb.toMapValues({
      meeting_id: ctx.args.meeting_id,
    }),
  };
}

export function response(ctx) {
  if (ctx.error) {
    util.error(ctx.error.message, ctx.error.type);
  }
  return ctx.result;
}
