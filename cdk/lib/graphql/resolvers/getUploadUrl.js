/**
 * getUploadUrl リゾルバー
 * Lambda経由でS3 Presigned URLを取得
 */

import { util } from "@aws-appsync/utils";

export function request(ctx) {
  return {
    operation: "Invoke",
    payload: {
      arguments: ctx.args,
      identity: ctx.identity,
    },
  };
}

export function response(ctx) {
  if (ctx.error) {
    util.error(ctx.error.message, ctx.error.type);
  }
  return ctx.result;
}
