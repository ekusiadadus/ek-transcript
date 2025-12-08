/**
 * deleteMeeting リゾルバー
 * 会議を削除
 */

import { util } from "@aws-appsync/utils";

export function request(ctx) {
  return {
    operation: "DeleteItem",
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
