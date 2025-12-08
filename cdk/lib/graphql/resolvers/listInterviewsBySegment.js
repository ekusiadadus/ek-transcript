/**
 * listInterviewsBySegment リゾルバー
 * セグメント別インタビュー取得（GSI 使用）
 */

import { util } from "@aws-appsync/utils";

export function request(ctx) {
  const limit = ctx.args.limit ?? 20;
  const request = {
    operation: "Query",
    index: "segment-index",
    query: {
      expression: "segment = :segment",
      expressionValues: util.dynamodb.toMapValues({
        ":segment": ctx.args.segment,
      }),
    },
    limit: limit,
    scanIndexForward: false, // 新しい順
  };

  if (ctx.args.nextToken) {
    request.nextToken = ctx.args.nextToken;
  }

  return request;
}

export function response(ctx) {
  if (ctx.error) {
    util.error(ctx.error.message, ctx.error.type);
  }

  return {
    items: ctx.result.items,
    nextToken: ctx.result.nextToken,
  };
}
