/**
 * createInterviewProject resolver
 * Create new interview project
 */

import { util } from "@aws-appsync/utils";

export function request(ctx) {
  const input = ctx.args.input;
  const now = util.time.nowISO8601();
  const projectId = util.autoId();

  const item = {
    project_id: projectId,
    user_id: ctx.identity.sub,
    title: input.title,
    status: "ACTIVE",
    interview_count: 0,
    created_at: now,
    updated_at: now,
  };

  // Optional fields
  if (input.description) {
    item.description = input.description;
  }
  if (input.recruitment_criteria) {
    item.recruitment_criteria = input.recruitment_criteria;
  }
  if (input.research_questions) {
    item.research_questions = input.research_questions;
  }
  if (input.target_persona) {
    item.target_persona = input.target_persona;
  }

  return {
    operation: "PutItem",
    key: util.dynamodb.toMapValues({
      project_id: projectId,
    }),
    attributeValues: util.dynamodb.toMapValues(item),
  };
}

export function response(ctx) {
  if (ctx.error) {
    util.error(ctx.error.message, ctx.error.type);
  }
  return ctx.result;
}
