"use client";

/**
 * Login Page - Sign In / Sign Up (US-1.1, US-1.2)
 */
import { useState, useEffect, type FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../../../lib/auth-context";
import styles from "./page.module.css";

type AuthMode = "signin" | "signup" | "confirm" | "forgot" | "reset";

export default function LoginPage() {
  const router = useRouter();
  const {
    isAuthenticated,
    isLoading,
    signIn,
    signUp,
    confirmSignUp,
    resetPassword,
    confirmResetPassword,
  } = useAuth();

  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmCode, setConfirmCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Redirect if already authenticated
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.push("/dashboard");
    }
  }, [isLoading, isAuthenticated, router]);

  const handleSignIn = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await signIn(email, password);
      router.push("/dashboard");
    } catch (err) {
      const message = err instanceof Error ? err.message : "サインインに失敗しました";
      // Handle common Amplify auth errors
      if (
        message.includes("UserNotFoundException") ||
        message.includes("NotAuthorizedException") ||
        message.includes("Incorrect username or password")
      ) {
        setError("メールアドレスまたはパスワードが正しくありません");
      } else if (
        message.includes("UserNotConfirmedException") ||
        message.includes("not confirmed")
      ) {
        setError("アカウントが確認されていません。確認コードを入力してください。");
        setMode("confirm");
      } else {
        setError(message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignUp = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    // Password validation
    if (password.length < 8) {
      setError("パスワードは8文字以上必要です");
      setSubmitting(false);
      return;
    }

    try {
      const result = await signUp(email, password);
      if (result.needsConfirmation) {
        setSuccess("確認コードをメールで送信しました");
        setMode("confirm");
      } else {
        router.push("/dashboard");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "アカウント作成に失敗しました";
      if (message.includes("UsernameExistsException")) {
        setError("このメールアドレスは既に登録されています");
      } else if (message.includes("InvalidPasswordException")) {
        setError("パスワードは8文字以上で、大文字・小文字・数字を含む必要があります");
      } else {
        setError(message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirm = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await confirmSignUp(email, confirmCode);
      setSuccess("アカウントが確認されました。サインインしてください。");
      setMode("signin");
      setConfirmCode("");
    } catch (err) {
      const message = err instanceof Error ? err.message : "確認に失敗しました";
      if (message.includes("CodeMismatchException")) {
        setError("確認コードが正しくありません");
      } else if (message.includes("ExpiredCodeException")) {
        setError("確認コードの有効期限が切れています");
      } else {
        setError(message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleForgotPassword = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await resetPassword(email);
      setSuccess("パスワードリセットコードをメールで送信しました");
      setMode("reset");
    } catch (err) {
      const message = err instanceof Error ? err.message : "リセットに失敗しました";
      if (message.includes("UserNotFoundException")) {
        setError("このメールアドレスは登録されていません");
      } else if (message.includes("LimitExceededException")) {
        setError("リクエスト回数の上限に達しました。しばらくしてからお試しください");
      } else {
        setError(message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetPassword = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    if (newPassword.length < 8) {
      setError("パスワードは8文字以上必要です");
      setSubmitting(false);
      return;
    }

    try {
      await confirmResetPassword(email, confirmCode, newPassword);
      setSuccess("パスワードがリセットされました。サインインしてください。");
      setMode("signin");
      setConfirmCode("");
      setNewPassword("");
    } catch (err) {
      const message = err instanceof Error ? err.message : "リセットに失敗しました";
      if (message.includes("CodeMismatchException")) {
        setError("確認コードが正しくありません");
      } else if (message.includes("ExpiredCodeException")) {
        setError("確認コードの有効期限が切れています");
      } else if (message.includes("InvalidPasswordException")) {
        setError("パスワードは8文字以上で、大文字・小文字・数字を含む必要があります");
      } else {
        setError(message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const switchMode = (newMode: AuthMode) => {
    setMode(newMode);
    setError(null);
    setSuccess(null);
  };

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <p style={{ textAlign: "center", color: "var(--text-secondary)" }}>
            Loading...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.header}>
          <Image
            src="/characters/woman1.svg"
            alt="EK Transcript"
            width={64}
            height={64}
            className={styles.logo}
          />
          <h1 className={styles.title}>
            {mode === "signin" && "サインイン"}
            {mode === "signup" && "アカウント作成"}
            {mode === "confirm" && "メール確認"}
            {mode === "forgot" && "パスワードをお忘れですか？"}
            {mode === "reset" && "パスワードリセット"}
          </h1>
          <p className={styles.subtitle}>
            {mode === "signin" && "EK Transcriptにサインイン"}
            {mode === "signup" && "新しいアカウントを作成"}
            {mode === "confirm" && "メールに送信された確認コードを入力"}
            {mode === "forgot" && "登録したメールアドレスを入力"}
            {mode === "reset" && "確認コードと新しいパスワードを入力"}
          </p>
        </div>

        {error && <div className={styles.error}>{error}</div>}
        {success && <div className={styles.success}>{success}</div>}

        {/* Sign In Form */}
        {mode === "signin" && (
          <form onSubmit={handleSignIn} className={styles.form}>
            <div className={styles.inputGroup}>
              <label htmlFor="email" className={styles.label}>
                メールアドレス
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                className={styles.input}
                autoComplete="email"
              />
            </div>
            <div className={styles.inputGroup}>
              <label htmlFor="password" className={styles.label}>
                パスワード
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className={styles.input}
                autoComplete="current-password"
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className={styles.submitButton}
            >
              {submitting ? "サインイン中..." : "サインイン"}
            </button>
          </form>
        )}

        {/* Sign Up Form */}
        {mode === "signup" && (
          <form onSubmit={handleSignUp} className={styles.form}>
            <div className={styles.inputGroup}>
              <label htmlFor="email" className={styles.label}>
                メールアドレス
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                className={styles.input}
                autoComplete="email"
              />
            </div>
            <div className={styles.inputGroup}>
              <label htmlFor="password" className={styles.label}>
                パスワード
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="8文字以上"
                required
                minLength={8}
                className={styles.input}
                autoComplete="new-password"
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className={styles.submitButton}
            >
              {submitting ? "作成中..." : "アカウント作成"}
            </button>
          </form>
        )}

        {/* Confirmation Form */}
        {mode === "confirm" && (
          <form onSubmit={handleConfirm} className={styles.form}>
            <div className={styles.inputGroup}>
              <label htmlFor="code" className={styles.label}>
                確認コード
              </label>
              <input
                id="code"
                type="text"
                value={confirmCode}
                onChange={(e) => setConfirmCode(e.target.value)}
                placeholder="123456"
                required
                className={`${styles.input} ${styles.codeInput}`}
                autoComplete="one-time-code"
                maxLength={6}
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className={styles.submitButton}
            >
              {submitting ? "確認中..." : "確認"}
            </button>
          </form>
        )}

        {/* Forgot Password Form */}
        {mode === "forgot" && (
          <form onSubmit={handleForgotPassword} className={styles.form}>
            <div className={styles.inputGroup}>
              <label htmlFor="email" className={styles.label}>
                メールアドレス
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                className={styles.input}
                autoComplete="email"
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className={styles.submitButton}
            >
              {submitting ? "送信中..." : "リセットコードを送信"}
            </button>
          </form>
        )}

        {/* Reset Password Form */}
        {mode === "reset" && (
          <form onSubmit={handleResetPassword} className={styles.form}>
            <div className={styles.inputGroup}>
              <label htmlFor="code" className={styles.label}>
                確認コード
              </label>
              <input
                id="code"
                type="text"
                value={confirmCode}
                onChange={(e) => setConfirmCode(e.target.value)}
                placeholder="123456"
                required
                className={`${styles.input} ${styles.codeInput}`}
                autoComplete="one-time-code"
                maxLength={6}
              />
            </div>
            <div className={styles.inputGroup}>
              <label htmlFor="newPassword" className={styles.label}>
                新しいパスワード
              </label>
              <input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="8文字以上"
                required
                minLength={8}
                className={styles.input}
                autoComplete="new-password"
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className={styles.submitButton}
            >
              {submitting ? "リセット中..." : "パスワードをリセット"}
            </button>
          </form>
        )}

        {/* Mode Toggle */}
        <div className={styles.toggle}>
          {mode === "signin" && (
            <>
              <p className={styles.toggleText}>
                <button
                  type="button"
                  onClick={() => switchMode("forgot")}
                  className={styles.toggleLink}
                >
                  パスワードをお忘れですか？
                </button>
              </p>
              <p className={styles.toggleText}>
                アカウントをお持ちでない方は{" "}
                <button
                  type="button"
                  onClick={() => switchMode("signup")}
                  className={styles.toggleLink}
                >
                  新規登録
                </button>
              </p>
            </>
          )}
          {mode === "signup" && (
            <p className={styles.toggleText}>
              既にアカウントをお持ちの方は{" "}
              <button
                type="button"
                onClick={() => switchMode("signin")}
                className={styles.toggleLink}
              >
                サインイン
              </button>
            </p>
          )}
          {mode === "confirm" && (
            <p className={styles.toggleText}>
              <button
                type="button"
                onClick={() => switchMode("signin")}
                className={styles.toggleLink}
              >
                サインインに戻る
              </button>
            </p>
          )}
          {mode === "forgot" && (
            <p className={styles.toggleText}>
              <button
                type="button"
                onClick={() => switchMode("signin")}
                className={styles.toggleLink}
              >
                サインインに戻る
              </button>
            </p>
          )}
          {mode === "reset" && (
            <p className={styles.toggleText}>
              <button
                type="button"
                onClick={() => switchMode("signin")}
                className={styles.toggleLink}
              >
                サインインに戻る
              </button>
            </p>
          )}
        </div>

        <Link href="/" className={styles.backLink}>
          ← ホームに戻る
        </Link>
      </div>
    </div>
  );
}
