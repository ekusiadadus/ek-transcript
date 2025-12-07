"use client";

import { useState, useEffect, type FormEvent } from "react";
import Link from "next/link";
import { useAuth } from "../../lib/auth-context";
import { listInterviews, type Interview } from "../../lib/graphql";
import styles from "./page.module.css";

function AuthForm() {
  const { signIn, signUp, confirmSignUp, isLoading } = useAuth();
  const [mode, setMode] = useState<"signIn" | "signUp" | "confirm">("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmCode, setConfirmCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      if (mode === "signIn") {
        await signIn(email, password);
      } else if (mode === "signUp") {
        const result = await signUp(email, password);
        if (result.needsConfirmation) {
          setMode("confirm");
        }
      } else if (mode === "confirm") {
        await confirmSignUp(email, confirmCode);
        await signIn(email, password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className={styles.authContainer}>
        <div className={styles.loading}>Loading...</div>
      </div>
    );
  }

  return (
    <div className={styles.authContainer}>
      <div className={styles.authBox}>
        <h1 className={styles.authTitle}>
          {mode === "signIn"
            ? "Sign In"
            : mode === "signUp"
              ? "Sign Up"
              : "Confirm Email"}
        </h1>
        <form className={styles.form} onSubmit={handleSubmit}>
          {mode !== "confirm" ? (
            <>
              <div className={styles.inputGroup}>
                <label className={styles.label} htmlFor="email">
                  Email
                </label>
                <input
                  className={styles.input}
                  type="email"
                  id="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className={styles.inputGroup}>
                <label className={styles.label} htmlFor="password">
                  Password
                </label>
                <input
                  className={styles.input}
                  type="password"
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                />
              </div>
            </>
          ) : (
            <div className={styles.inputGroup}>
              <label className={styles.label} htmlFor="code">
                Confirmation Code
              </label>
              <input
                className={styles.input}
                type="text"
                id="code"
                value={confirmCode}
                onChange={(e) => setConfirmCode(e.target.value)}
                required
              />
            </div>
          )}
          {error && <div className={styles.error}>{error}</div>}
          <button
            className={styles.submitButton}
            type="submit"
            disabled={submitting}
          >
            {submitting
              ? "Processing..."
              : mode === "signIn"
                ? "Sign In"
                : mode === "signUp"
                  ? "Sign Up"
                  : "Confirm"}
          </button>
        </form>
        {mode !== "confirm" && (
          <div className={styles.switchAuth}>
            {mode === "signIn" ? (
              <>
                Don&apos;t have an account?{" "}
                <button type="button" onClick={() => setMode("signUp")}>
                  Sign Up
                </button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <button type="button" onClick={() => setMode("signIn")}>
                  Sign In
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function InterviewList() {
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchInterviews() {
      try {
        const result = await listInterviews(20);
        setInterviews(result.items);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load interviews");
      } finally {
        setLoading(false);
      }
    }
    fetchInterviews();
  }, []);

  if (loading) {
    return <div className={styles.loading}>Loading interviews...</div>;
  }

  if (error) {
    return <div className={styles.error}>{error}</div>;
  }

  if (interviews.length === 0) {
    return (
      <div className={styles.empty}>
        No interviews found. Process a video to get started.
      </div>
    );
  }

  return (
    <div className={styles.interviewList}>
      {interviews.map((interview) => (
        <Link
          key={interview.interview_id}
          href={`/interview/${interview.interview_id}`}
          className={styles.interviewCard}
        >
          <div className={styles.cardHeader}>
            <h3 className={styles.cardTitle}>
              Interview {interview.interview_id.substring(0, 8)}
            </h3>
            <span className={styles.segment}>{interview.segment}</span>
          </div>
          <div className={styles.cardMeta}>
            {new Date(interview.created_at).toLocaleString("ja-JP")}
          </div>
          {interview.total_score !== null && (
            <span className={styles.score}>Score: {interview.total_score}</span>
          )}
        </Link>
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const { isAuthenticated, isLoading, user, signOut } = useAuth();

  if (isLoading) {
    return (
      <div className={styles.page}>
        <div className={styles.loading}>Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <AuthForm />;
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Interview Dashboard</h1>
        <div className={styles.userInfo}>
          <Link href="/upload" className={styles.uploadLink}>
            Upload
          </Link>
          <span className={styles.email}>{user?.email || user?.username}</span>
          <button className={styles.signOutButton} onClick={signOut}>
            Sign Out
          </button>
        </div>
      </header>
      <main className={styles.content}>
        <InterviewList />
      </main>
    </div>
  );
}
