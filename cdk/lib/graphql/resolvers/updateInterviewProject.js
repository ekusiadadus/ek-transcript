/**
 * updateInterviewProject resolver
 * Update interview project
 */

import { util } from "@aws-appsync/utils";

export function request(ctx) {
  const input = ctx.args.input;

  // Build update expression dynamically
  const expressionNames = {};
  const expressionValues = {};
  const updateExpressions = [];

  const fields = [
    "title",
    "description",
    "recruitment_criteria",
    "research_questions",
    "target_persona",
    "status",
  ];

  fields.forEach((field) => {
    if (input[field] !== null && input[field] !== undefined) {
      expressionNames[`#${field}`] = field;
      expressionValues[`:${field}`] = input[field];
      updateExpressions.push(`#${field} = :${field}`);
    }
  });

  // Add updated_at
  expressionNames["#updated_at"] = "updated_at";
  expressionValues[":updated_at"] = util.time.nowISO8601();
  updateExpressions.push("#updated_at = :updated_at");

  return {
    operation: "UpdateItem",
    key: util.dynamodb.toMapValues({
      project_id: input.project_id,
    }),
    update: {
      expression: `SET ${updateExpressions.join(", ")}`,
      expressionNames: expressionNames,
      expressionValues: util.dynamodb.toMapValues(expressionValues),
    },
  };
}

export function response(ctx) {
  if (ctx.error) {
    util.error(ctx.error.message, ctx.error.type);
  }
  return ctx.result;
}
