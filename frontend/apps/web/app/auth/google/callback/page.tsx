"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { graphqlClient } from "../../../../lib/graphql/client";
import { CONNECT_GOOGLE } from "../../../../lib/graphql/mutations";
import type { ConnectGoogleResponse } from "../../../../lib/graphql/types";

type CallbackStatus = "processing" | "success" | "error";

const styles = {
  pageContainer: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f3f4f6",
  } as React.CSSProperties,
  card: {
    maxWidth: "400px",
    width: "100%",
    padding: "32px",
    backgroundColor: "#ffffff",
    borderRadius: "8px",
    boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
  } as React.CSSProperties,
  textCenter: {
    textAlign: "center",
  } as React.CSSProperties,
  spinner: {
    width: "48px",
    height: "48px",
    margin: "0 auto 16px",
    border: "4px solid #d1d5db",
    borderTopColor: "#2563eb",
    borderRadius: "50%",
    animation: "spin 1s linear infinite",
  } as React.CSSProperties,
  iconContainer: {
    width: "48px",
    height: "48px",
    margin: "0 auto 16px",
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  } as React.CSSProperties,
  successIconContainer: {
    backgroundColor: "#dcfce7",
  } as React.CSSProperties,
  errorIconContainer: {
    backgroundColor: "#fee2e2",
  } as React.CSSProperties,
  successIcon: {
    width: "24px",
    height: "24px",
    color: "#16a34a",
  } as React.CSSProperties,
  errorIcon: {
    width: "24px",
    height: "24px",
    color: "#dc2626",
  } as React.CSSProperties,
  title: {
    fontSize: "20px",
    fontWeight: 600,
    color: "#111827",
    marginBottom: "8px",
  } as React.CSSProperties,
  description: {
    color: "#4b5563",
    marginBottom: "16px",
  } as React.CSSProperties,
  subText: {
    fontSize: "14px",
    color: "#6b7280",
  } as React.CSSProperties,
  errorText: {
    color: "#dc2626",
    marginBottom: "16px",
  } as React.CSSProperties,
  button: {
    padding: "8px 16px",
    backgroundColor: "#2563eb",
    color: "#ffffff",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: 500,
  } as React.CSSProperties,
};

// CSS animation for spinner
const spinnerKeyframes = `
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
`;

function GoogleCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<CallbackStatus>("processing");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const handleCallback = async () => {
      const code = searchParams.get("code");
      const state = searchParams.get("state");
      const error = searchParams.get("error");

      // エラーチェック
      if (error) {
        setStatus("error");
        setErrorMessage(
          error === "access_denied"
            ? "アクセスが拒否されました"
            : `エラー: ${error}`
        );
        return;
      }

      if (!code) {
        setStatus("error");
        setErrorMessage("認証コードが見つかりません");
        return;
      }

      // CSRF 対策: state の検証
      const savedState = localStorage.getItem("google_oauth_state");
      if (!state || state !== savedState) {
        setStatus("error");
        setErrorMessage("セキュリティ検証に失敗しました。もう一度お試しください。");
        return;
      }

      // state を削除
      localStorage.removeItem("google_oauth_state");

      try {
        const redirectUri = `${window.location.origin}/auth/google/callback`;

        const response = await graphqlClient.mutate<ConnectGoogleResponse>(
          CONNECT_GOOGLE,
          {
            input: {
              code,
              redirect_uri: redirectUri,
              state,
            },
          }
        );

        if (response.connectGoogle.success) {
          setStatus("success");
          // 2秒後にダッシュボードにリダイレクト
          setTimeout(() => {
            router.push("/dashboard");
          }, 2000);
        } else {
          setStatus("error");
          setErrorMessage(
            response.connectGoogle.error_message || "接続に失敗しました"
          );
        }
      } catch (err) {
        console.error("Failed to connect Google:", err);
        setStatus("error");
        setErrorMessage("Google アカウントの接続に失敗しました");
      }
    };

    handleCallback();
  }, [searchParams, router]);

  return (
    <div style={styles.card}>
      <style>{spinnerKeyframes}</style>
      {status === "processing" && (
        <div style={styles.textCenter as React.CSSProperties}>
          <div style={styles.spinner} />
          <h1 style={styles.title}>Google アカウントを接続中...</h1>
          <p style={styles.subText}>しばらくお待ちください</p>
        </div>
      )}

      {status === "success" && (
        <div style={styles.textCenter as React.CSSProperties}>
          <div style={{ ...styles.iconContainer, ...styles.successIconContainer }}>
            <svg
              style={styles.successIcon}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <h1 style={styles.title}>接続が完了しました</h1>
          <p style={styles.description}>
            Google アカウントが正常に接続されました
          </p>
          <p style={styles.subText}>ダッシュボードにリダイレクトします...</p>
        </div>
      )}

      {status === "error" && (
        <div style={styles.textCenter as React.CSSProperties}>
          <div style={{ ...styles.iconContainer, ...styles.errorIconContainer }}>
            <svg
              style={styles.errorIcon}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </div>
          <h1 style={styles.title}>接続に失敗しました</h1>
          <p style={styles.errorText}>{errorMessage}</p>
          <button
            onClick={() => router.push("/dashboard")}
            style={styles.button}
          >
            ダッシュボードに戻る
          </button>
        </div>
      )}
    </div>
  );
}

function LoadingFallback() {
  return (
    <div style={styles.card}>
      <style>{spinnerKeyframes}</style>
      <div style={styles.textCenter as React.CSSProperties}>
        <div style={styles.spinner} />
        <h1 style={styles.title}>読み込み中...</h1>
      </div>
    </div>
  );
}

export default function GoogleCallbackPage() {
  return (
    <div style={styles.pageContainer}>
      <Suspense fallback={<LoadingFallback />}>
        <GoogleCallbackContent />
      </Suspense>
    </div>
  );
}
