/**
 * listRecordings resolver
 *
 * キャッシュから録画一覧を高速取得
 */
import { util } from "@aws-appsync/utils";

export function request(ctx) {
  const status = ctx.args.status;
  const userId = ctx.identity.sub;

  return {
    operation: "Invoke",
    payload: {
      action: "list_recordings",
      user_id: userId,
      status: status,
    },
  };
}

export function response(ctx) {
  if (ctx.error) {
    util.error(ctx.error.message, ctx.error.type);
  }

  const result = ctx.result;

  if (result.error) {
    util.error(result.error, "LambdaError");
  }

  return {
    items: result.recordings || [],
    nextToken: null,
  };
}
