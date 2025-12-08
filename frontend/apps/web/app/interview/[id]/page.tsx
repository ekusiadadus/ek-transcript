"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "../../../lib/auth-context";
import { getInterview, getVideoUrl, type Interview } from "../../../lib/graphql";
import { TranscriptViewer } from "../../../components/TranscriptViewer";
import { AnalysisViewer } from "../../../components/AnalysisViewer";
import styles from "./page.module.css";

type ProcessingStatus = "pending" | "processing" | "completed" | "failed";

const STEP_LABELS: Record<string, string> = {
  queued: "キューに追加されました",
  extracting_audio: "音声を抽出中...",
  chunking_audio: "音声を分割中...",
  diarizing: "話者分離中...",
  merging_speakers: "話者情報を統合中...",
  splitting_by_speaker: "話者ごとに分割中...",
  transcribing: "文字起こし中...",
  aggregating_results: "結果を集約中...",
  analyzing: "LLM分析中...",
  completed: "処理完了",
  failed: "処理失敗",
};

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

function StatusBadge({ status, progress }: { status: ProcessingStatus; progress?: number | null }) {
  const statusConfig = {
    pending: { label: "待機中", className: styles.statusPending },
    processing: { label: "処理中", className: styles.statusProcessing },
    completed: { label: "完了", className: styles.statusCompleted },
    failed: { label: "失敗", className: styles.statusFailed },
  };

  const config = statusConfig[status];
  const showProgress = status === "processing" && progress !== null && progress !== undefined;

  return (
    <span className={`${styles.statusBadge} ${config.className}`}>
      {config.label}
      {showProgress && ` ${progress}%`}
    </span>
  );
}

function VideoPlayer({ videoKey }: { videoKey: string }) {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadVideoUrl() {
      try {
        setLoading(true);
        setError(null);
        const response = await getVideoUrl(videoKey);
        setVideoUrl(response.videoUrl);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load video");
      } finally {
        setLoading(false);
      }
    }

    if (videoKey) {
      loadVideoUrl();
    }
  }, [videoKey]);

  if (loading) {
    return (
      <div className={styles.videoContainer}>
        <div className={styles.videoLoading}>Loading video...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.videoContainer}>
        <div className={styles.videoError}>{error}</div>
      </div>
    );
  }

  if (!videoUrl) {
    return null;
  }

  return (
    <div className={styles.videoContainer}>
      <video
        className={styles.videoPlayer}
        controls
        preload="metadata"
        src={videoUrl}
      >
        Your browser does not support the video tag.
      </video>
    </div>
  );
}

function InterviewContent({ interview }: { interview: Interview }) {
  return (
    <div className={styles.content}>
      {/* Video Player Section */}
      {interview.video_key && (
        <div className={styles.videoSection}>
          <h2 className={styles.sectionTitle}>
            動画{interview.file_name && ` - ${interview.file_name}`}
          </h2>
          <VideoPlayer videoKey={interview.video_key} />
        </div>
      )}

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
          {interview.status && (
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>ステータス</span>
              <StatusBadge status={interview.status as ProcessingStatus} progress={interview.progress} />
            </div>
          )}
          {interview.file_name && (
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>ファイル名</span>
              <span className={styles.metaValue}>{interview.file_name}</span>
            </div>
          )}
          {interview.file_size && (
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>ファイルサイズ</span>
              <span className={styles.metaValue}>
                {(interview.file_size / 1024 / 1024).toFixed(2)} MB
              </span>
            </div>
          )}
          {interview.total_score !== null && interview.total_score !== undefined && (
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>スコア</span>
              <span className={styles.metaValue}>{interview.total_score}点</span>
            </div>
          )}
        </div>
      </div>

      {interview.analysis_key && (
        <div className={styles.resultSection}>
          <h2 className={styles.sectionTitle}>LLM分析結果</h2>
          <AnalysisViewer analysisKey={interview.analysis_key} />
        </div>
      )}

      {interview.transcript_key && (
        <div className={styles.resultSection}>
          <h2 className={styles.sectionTitle}>文字起こし</h2>
          <TranscriptViewer transcriptKey={interview.transcript_key} />
        </div>
      )}
    </div>
  );
}

function ProcessingView({ interview }: { interview: Interview }) {
  const progress = interview.progress ?? 0;
  const currentStep = interview.current_step
    ? STEP_LABELS[interview.current_step] || interview.current_step
    : "処理を開始しています...";

  return (
    <div className={styles.processingContainer}>
      <div className={styles.processingIcon}>⏳</div>
      <h2 className={styles.processingTitle}>処理中</h2>
      <p className={styles.currentStepText}>{currentStep}</p>
      <div className={styles.progressBar}>
        <div
          className={styles.progressFill}
          style={{ width: `${progress}%` }}
        />
      </div>
      <p className={styles.progressText}>{progress}%</p>
      <p className={styles.processingNote}>
        処理には数分かかる場合があります。このページは自動的に更新されます。
      </p>
    </div>
  );
}

function FailedView({ interview, onRetry }: { interview: Interview; onRetry: () => void }) {
  const failedStep = interview.current_step
    ? STEP_LABELS[interview.current_step] || interview.current_step
    : "不明なステップ";

  return (
    <div className={styles.failedContainer}>
      <div className={styles.failedIcon}>❌</div>
      <h2 className={styles.failedTitle}>処理に失敗しました</h2>
      <p className={styles.currentStepText}>失敗したステップ: {failedStep}</p>
      {interview.error_message && (
        <p className={styles.failedMessage}>{interview.error_message}</p>
      )}
      <button className={styles.retryButton} onClick={onRetry}>
        ダッシュボードに戻る
      </button>
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

  const loadInterview = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getInterview(interviewId);
      setInterview(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load interview");
    } finally {
      setLoading(false);
    }
  }, [interviewId]);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push("/dashboard");
      return;
    }

    if (!authLoading && isAuthenticated && interviewId) {
      loadInterview();
    }
  }, [authLoading, isAuthenticated, interviewId, loadInterview, router]);

  // 処理中の場合は5秒ごとにポーリング
  useEffect(() => {
    const status = interview?.status;
    if (status === "pending" || status === "processing") {
      const interval = setInterval(() => {
        loadInterview();
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [interview?.status, loadInterview]);

  const handleBackToDashboard = () => {
    router.push("/dashboard");
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

  const status = (interview?.status as ProcessingStatus) || "pending";

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

      {!error && interview && status === "failed" && (
        <FailedView interview={interview} onRetry={handleBackToDashboard} />
      )}

      {!error && interview && (status === "pending" || status === "processing") && (
        <ProcessingView interview={interview} />
      )}

      {!error && interview && status === "completed" && (
        <InterviewContent interview={interview} />
      )}
    </div>
  );
}
