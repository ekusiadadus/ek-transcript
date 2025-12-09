/**
 * syncCalendar リゾルバー
 * Google Calendar から会議を同期（Lambda 経由）
 */

import { util } from "@aws-appsync/utils";

export function request(ctx) {
  const input = ctx.args.input || {};
  const userId = ctx.identity.sub;

  return {
    operation: "Invoke",
    payload: {
      action: "sync_events",
      user_id: userId,
      start_date: input.start_date,
      end_date: input.end_date,
      days_ahead: input.max_results || 30,
    },
  };
}

export function response(ctx) {
  if (ctx.error) {
    util.error(ctx.error.message, ctx.error.type);
  }
  return ctx.result;
}
