/**
 * getGoogleAuthUrl リゾルバー
 * Google OAuth 認証 URL を取得（Lambda 経由）
 */

import { util } from "@aws-appsync/utils";

export function request(ctx) {
  const redirectUri = ctx.args.redirect_uri;
  const userId = ctx.identity.sub;

  // CSRF 防止用の state を生成
  const state = util.autoId();

  // state を stash に保存して response で使用
  ctx.stash.state = state;

  return {
    operation: "Invoke",
    payload: {
      action: "get_auth_url",
      user_id: userId,
      redirect_uri: redirectUri,
      state: state,
    },
  };
}

export function response(ctx) {
  if (ctx.error) {
    util.error(ctx.error.message, ctx.error.type);
  }

  const result = ctx.result;

  if (result.error) {
    util.error(result.error, "GoogleAuthError");
  }

  // stash に保存した state を返す（Lambda に送信した state と同じ）
  return {
    auth_url: result.auth_url,
    state: ctx.stash.state,
  };
}
