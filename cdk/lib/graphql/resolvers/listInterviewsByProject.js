/**
 * listInterviewsByProject resolver
 * List interviews within a project (GSI query)
 */

import { util } from "@aws-appsync/utils";

export function request(ctx) {
  const limit = ctx.args.limit ?? 20;
  const request = {
    operation: "Query",
    index: "project-index",
    query: {
      expression: "project_id = :project_id",
      expressionValues: util.dynamodb.toMapValues({
        ":project_id": ctx.args.project_id,
      }),
    },
    limit: limit,
    scanIndexForward: false, // Newest first
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
