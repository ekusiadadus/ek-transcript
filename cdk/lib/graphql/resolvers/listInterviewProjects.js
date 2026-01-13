/**
 * listInterviewProjects resolver
 * List interview projects with pagination
 */

import { util } from "@aws-appsync/utils";

export function request(ctx) {
  const limit = ctx.args.limit ?? 20;
  const request = {
    operation: "Scan",
    limit: limit,
  };

  // Filter by status if provided
  if (ctx.args.status) {
    request.filter = {
      expression: "#status = :status",
      expressionNames: { "#status": "status" },
      expressionValues: util.dynamodb.toMapValues({
        ":status": ctx.args.status,
      }),
    };
  }

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
