"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "../../../lib/auth-context";
import { getInterview, type Interview } from "../../../lib/graphql";
import styles from "./page.module.css";

type ProcessingStatus = "pending" | "processing" | "completed" | "failed";

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StatusBadge({ status }: { status: ProcessingStatus }) {
  const statusConfig = {
    pending: { label: "待機中", className: styles.statusPending },
    processing: { label: "処理中", className: styles.statusProcessing },
    completed: { label: "完了", className: styles.statusCompleted },
    failed: { label: "失敗", className: styles.statusFailed },
  };

  const config = statusConfig[status];
  return <span className={`${styles.statusBadge} ${config.className}`}>{config.label}</span>;
}

function InterviewContent({ interview }: { interview: Interview }) {
  return (
    <div className={styles.content}>
      <div className={styles.metaSection}>
        <h2 className={styles.sectionTitle}>基本情報</h2>
        <div className={styles.metaGrid}>
          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>インタビューID</span>
            <span className={styles.metaValue}>{interview.interview_id}</span>
          </div>
          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>セグメント</span>
            <span className={styles.metaValue}>{interview.segment}</span>
          </div>
          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>作成日時</span>
            <span className={styles.metaValue}>{formatDate(interview.created_at)}</span>
          </div>
          {interview.total_score !== null && interview.total_score !== undefined && (
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>スコア</span>
              <span className={styles.metaValue}>{interview.total_score}点</span>
            </div>
          )}
        </div>
      </div>

      {interview.transcript_key && (
        <div className={styles.resultSection}>
          <h2 className={styles.sectionTitle}>文字起こし</h2>
          <div className={styles.resultBox}>
            <p className={styles.resultPlaceholder}>
              文字起こし結果: {interview.transcript_key}
            </p>
          </div>
        </div>
      )}

      {interview.analysis_key && (
        <div className={styles.resultSection}>
          <h2 className={styles.sectionTitle}>LLM分析結果</h2>
          <div className={styles.resultBox}>
            <p className={styles.resultPlaceholder}>
              分析結果: {interview.analysis_key}
            </p>
          </div>
        </div>
      )}

      {interview.diarization_key && (
        <div className={styles.resultSection}>
          <h2 className={styles.sectionTitle}>話者分離</h2>
          <div className={styles.resultBox}>
            <p className={styles.resultPlaceholder}>
              話者分離結果: {interview.diarization_key}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function ProcessingView({ interviewId }: { interviewId: string }) {
  const [status, setStatus] = useState<ProcessingStatus>("processing");
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState("処理を開始しています...");

  const steps = [
    "音声抽出中...",
    "音声分割中...",
    "話者分離中...",
    "文字起こし中...",
    "結果集約中...",
    "LLM分析中...",
  ];

  useEffect(() => {
    // TODO: AppSync Events API subscription を実装
    // 現在はシミュレーション
    let stepIndex = 0;
    const interval = setInterval(() => {
      if (stepIndex < steps.length) {
        setCurrentStep(steps[stepIndex]);
        setProgress(Math.min(((stepIndex + 1) / steps.length) * 100, 95));
        stepIndex++;
      }
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className={styles.processingContainer}>
      <div className={styles.processingIcon}>...</div>
      <h2 className={styles.processingTitle}>処理中</h2>
      <p className={styles.processingStep}>{currentStep}</p>
      <div className={styles.progressBar}>
        <div
          className={styles.progressFill}
          style={{ width: `${progress}%` }}
        />
      </div>
      <p className={styles.progressText}>{Math.round(progress)}%</p>
      <p className={styles.processingNote}>
        処理には数分かかる場合があります。このページを開いたままお待ちください。
      </p>
    </div>
  );
}

export default function InterviewPage() {
  const params = useParams();
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [interview, setInterview] = useState<Interview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const interviewId = params.id as string;

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push("/dashboard");
      return;
    }

    if (!authLoading && isAuthenticated && interviewId) {
      loadInterview();
    }
  }, [authLoading, isAuthenticated, interviewId]);

  const loadInterview = async () => {
    try {
      setLoading(true);
      const data = await getInterview(interviewId);
      setInterview(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load interview");
    } finally {
      setLoading(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className={styles.page}>
        <div className={styles.loadingContainer}>
          <div className={styles.loading}>Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Interview Result</h1>
        <div className={styles.headerActions}>
          <Link href="/upload" className={styles.headerLink}>
            Upload
          </Link>
          <Link href="/dashboard" className={styles.headerLink}>
            Dashboard
          </Link>
        </div>
      </header>

      {error && (
        <div className={styles.errorContainer}>
          <p className={styles.errorText}>{error}</p>
          <button className={styles.retryButton} onClick={loadInterview}>
            再試行
          </button>
        </div>
      )}

      {!interview && !error && (
        <ProcessingView interviewId={interviewId} />
      )}

      {interview && <InterviewContent interview={interview} />}
    </div>
  );
}
