/**
 * listMeetings リゾルバー
 * 会議一覧を取得（ページネーション対応）
 * user_id-start_time-index を使用
 */

import { util } from "@aws-appsync/utils";

export function request(ctx) {
  const { limit, nextToken, status } = ctx.args;
  const userId = ctx.identity.sub;

  const queryArgs = {
    operation: "Query",
    index: "user_id-start_time-index",
    query: {
      expression: "user_id = :userId",
      expressionValues: util.dynamodb.toMapValues({
        ":userId": userId,
      }),
    },
    scanIndexForward: false,
    limit: limit || 20,
  };

  if (nextToken) {
    queryArgs.nextToken = nextToken;
  }

  if (status) {
    queryArgs.filter = {
      expression: "#status = :status",
      expressionNames: {
        "#status": "status",
      },
      expressionValues: util.dynamodb.toMapValues({
        ":status": status,
      }),
    };
  }

  return queryArgs;
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
