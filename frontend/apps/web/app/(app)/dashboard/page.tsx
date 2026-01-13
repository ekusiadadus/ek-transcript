"use client";

/**
 * Dashboard page - Interview list and overview (US-10, US-12)
 */
import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../../../lib/auth-context";
import { listInterviews, type Interview } from "../../../lib/graphql";
import styles from "./page.module.css";

type FilterStatus = "ALL" | "COMPLETED" | "PROCESSING" | "PENDING" | "FAILED";

/**
 * Normalize status to uppercase for consistent comparison.
 * API may return lowercase (e.g., "completed") but UI expects uppercase.
 */
const normalizeStatus = (status: string | null | undefined): string => {
  return status?.toUpperCase() ?? "PENDING";
};

const STATUS_LABELS: Record<string, string> = {
  COMPLETED: "完了",
  PROCESSING: "処理中",
  PENDING: "待機中",
  FAILED: "失敗",
  TRANSCRIBING: "文字起こし中",
  ANALYZING: "分析中",
};

function StatusBadge({ status }: { status: string }) {
  const normalized = normalizeStatus(status);
  const getStatusClass = () => {
    switch (normalized) {
      case "COMPLETED":
        return styles.statusCompleted;
      case "PROCESSING":
      case "TRANSCRIBING":
      case "ANALYZING":
        return styles.statusProcessing;
      case "FAILED":
        return styles.statusFailed;
      default:
        return styles.statusPending;
    }
  };

  return (
    <span className={`${styles.statusBadge} ${getStatusClass()}`}>
      {STATUS_LABELS[normalized] || normalized}
    </span>
  );
}

function InterviewCard({ interview }: { interview: Interview }) {
  const router = useRouter();
  const status = normalizeStatus(interview.status);
  const isCompleted = status === "COMPLETED";
  const isProcessing = ["PROCESSING", "TRANSCRIBING", "ANALYZING"].includes(status);

  const handleClick = () => {
    if (isCompleted) {
      router.push(`/interview/${interview.interview_id}`);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("ja-JP", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div
      className={`${styles.interviewCard} ${
        isCompleted ? styles.interviewCardClickable : ""
      }`}
      onClick={handleClick}
      role={isCompleted ? "button" : undefined}
      tabIndex={isCompleted ? 0 : undefined}
    >
      <div className={styles.interviewHeader}>
        <h3 className={styles.interviewTitle}>
          {interview.file_name || `Interview ${interview.interview_id.slice(0, 8)}`}
        </h3>
        <StatusBadge status={interview.status ?? "PENDING"} />
      </div>

      <div className={styles.interviewMeta}>
        <span className={styles.interviewDate}>
          {formatDate(interview.created_at)}
        </span>
        {interview.segment && (
          <span className={styles.interviewSegment}>{interview.segment}</span>
        )}
      </div>

      {isProcessing && interview.progress !== undefined && (
        <div className={styles.progressBar}>
          <div
            className={styles.progressFill}
            style={{ width: `${interview.progress}%` }}
          />
        </div>
      )}

      {isCompleted && (
        <div className={styles.interviewActions}>
          <Link
            href={`/interview/${interview.interview_id}`}
            className={styles.viewButton}
            onClick={(e) => e.stopPropagation()}
          >
            詳細を見る
          </Link>
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterStatus>("ALL");

  useEffect(() => {
    if (!isAuthenticated || authLoading) return;

    const fetchInterviews = async () => {
      try {
        setLoading(true);
        const result = await listInterviews(50);
        const sorted = [...result.items].sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        setInterviews(sorted);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load interviews");
      } finally {
        setLoading(false);
      }
    };

    fetchInterviews();
  }, [isAuthenticated, authLoading]);

  if (authLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className={styles.container}>
        <div className={styles.authPrompt}>
          <h1 className={styles.authTitle}>サインインが必要です</h1>
          <p className={styles.authDescription}>
            ダッシュボードを表示するにはサインインしてください。
          </p>
          <button onClick={() => router.push("/login")} className={styles.signInButton}>
            サインイン
          </button>
        </div>
      </div>
    );
  }

  const filteredInterviews =
    filter === "ALL"
      ? interviews
      : interviews.filter((i) => normalizeStatus(i.status) === filter);

  const filterOptions: { value: FilterStatus; label: string }[] = [
    { value: "ALL", label: "すべて" },
    { value: "COMPLETED", label: "完了" },
    { value: "PROCESSING", label: "処理中" },
    { value: "PENDING", label: "待機中" },
    { value: "FAILED", label: "失敗" },
  ];

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Dashboard</h1>
        <Link href="/upload" className={styles.uploadButton}>
          + アップロード
        </Link>
      </div>

      {/* Stats */}
      <div className={styles.stats}>
        <div className={styles.statCard}>
          <span className={styles.statValue}>{interviews.length}</span>
          <span className={styles.statLabel}>総インタビュー数</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statValue}>
            {interviews.filter((i) => normalizeStatus(i.status) === "COMPLETED").length}
          </span>
          <span className={styles.statLabel}>分析完了</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statValue}>
            {interviews.filter((i) =>
              ["PROCESSING", "TRANSCRIBING", "ANALYZING"].includes(normalizeStatus(i.status))
            ).length}
          </span>
          <span className={styles.statLabel}>処理中</span>
        </div>
      </div>

      {/* Filter */}
      <div className={styles.filters}>
        {filterOptions.map((option) => (
          <button
            key={option.value}
            className={`${styles.filterButton} ${
              filter === option.value ? styles.filterButtonActive : ""
            }`}
            onClick={() => setFilter(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className={styles.loading}>読み込み中...</div>
      ) : error ? (
        <div className={styles.error}>{error}</div>
      ) : filteredInterviews.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyText}>
            {filter === "ALL"
              ? "インタビューがありません。動画をアップロードして始めましょう。"
              : `「${filterOptions.find((o) => o.value === filter)?.label}」のインタビューはありません。`}
          </p>
          {filter === "ALL" && (
            <Link href="/upload" className={styles.uploadButtonSecondary}>
              動画をアップロード
            </Link>
          )}
        </div>
      ) : (
        <div className={styles.interviewList}>
          {filteredInterviews.map((interview) => (
            <InterviewCard key={interview.interview_id} interview={interview} />
          ))}
        </div>
      )}
    </div>
  );
}
