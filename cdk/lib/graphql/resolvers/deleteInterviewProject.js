/**
 * deleteInterviewProject resolver
 * Delete interview project
 */

import { util } from "@aws-appsync/utils";

export function request(ctx) {
  return {
    operation: "DeleteItem",
    key: util.dynamodb.toMapValues({
      project_id: ctx.args.project_id,
    }),
  };
}

export function response(ctx) {
  if (ctx.error) {
    util.error(ctx.error.message, ctx.error.type);
  }
  return ctx.result;
}
