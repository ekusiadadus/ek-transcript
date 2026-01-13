"use client";

/**
 * Dashboard page - Interview list and overview (US-10, US-12)
 *
 * Enhanced with rich interview cards showing:
 * - Total score and judgment label
 * - Segment classification with color coding
 * - Visual priority indicators
 */
import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../../../lib/auth-context";
import { listInterviews, type Interview } from "../../../lib/graphql";
import { InterviewCard } from "../../../components/InterviewCard";
import { computeJudgmentLabel } from "../../../lib/analysis-compute";
import type { Segment } from "../../../lib/graphql/types";
import styles from "./page.module.css";

type FilterStatus = "ALL" | "COMPLETED" | "PROCESSING" | "PENDING" | "FAILED";
type FilterSegment = "ALL" | "A" | "B" | "C" | "D";

/**
 * Normalize status to uppercase for consistent comparison.
 */
const normalizeStatus = (status: string | null | undefined): string => {
  return status?.toUpperCase() ?? "PENDING";
};

/**
 * Get segment counts from interviews.
 */
function getSegmentCounts(interviews: Interview[]): Record<Segment, number> {
  const counts: Record<Segment, number> = { A: 0, B: 0, C: 0, D: 0 };
  interviews.forEach((i) => {
    const seg = (i.segment as Segment) || "D";
    if (seg in counts) {
      counts[seg]++;
    }
  });
  return counts;
}

/**
 * Get average score of completed interviews.
 */
function getAverageScore(interviews: Interview[]): number | null {
  const completed = interviews.filter(
    (i) => normalizeStatus(i.status) === "COMPLETED" && i.total_score !== null
  );
  if (completed.length === 0) return null;
  const sum = completed.reduce((acc, i) => acc + (i.total_score ?? 0), 0);
  return Math.round(sum / completed.length);
}

/**
 * Get priority target count (score >= 25).
 */
function getPriorityCount(interviews: Interview[]): number {
  return interviews.filter(
    (i) =>
      normalizeStatus(i.status) === "COMPLETED" &&
      i.total_score !== null &&
      i.total_score >= 25
  ).length;
}

export default function DashboardPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<FilterStatus>("ALL");
  const [segmentFilter, setSegmentFilter] = useState<FilterSegment>("ALL");

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

  // Computed values
  const completedInterviews = useMemo(
    () => interviews.filter((i) => normalizeStatus(i.status) === "COMPLETED"),
    [interviews]
  );

  const segmentCounts = useMemo(
    () => getSegmentCounts(completedInterviews),
    [completedInterviews]
  );

  const averageScore = useMemo(
    () => getAverageScore(interviews),
    [interviews]
  );

  const priorityCount = useMemo(
    () => getPriorityCount(interviews),
    [interviews]
  );

  // Filtered interviews
  const filteredInterviews = useMemo(() => {
    let result = interviews;

    // Status filter
    if (statusFilter !== "ALL") {
      result = result.filter((i) => normalizeStatus(i.status) === statusFilter);
    }

    // Segment filter (only for completed)
    if (segmentFilter !== "ALL") {
      result = result.filter((i) => i.segment === segmentFilter);
    }

    return result;
  }, [interviews, statusFilter, segmentFilter]);

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

  const statusFilterOptions: { value: FilterStatus; label: string }[] = [
    { value: "ALL", label: "すべて" },
    { value: "COMPLETED", label: "完了" },
    { value: "PROCESSING", label: "処理中" },
    { value: "PENDING", label: "待機中" },
    { value: "FAILED", label: "失敗" },
  ];

  const segmentFilterOptions: { value: FilterSegment; label: string; count: number }[] = [
    { value: "ALL", label: "全セグメント", count: completedInterviews.length },
    { value: "A", label: "A: 省エネ意識高", count: segmentCounts.A },
    { value: "B", label: "B: ガジェット好き", count: segmentCounts.B },
    { value: "C", label: "C: 便利さ追求", count: segmentCounts.C },
    { value: "D", label: "D: ライト層", count: segmentCounts.D },
  ];

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Dashboard</h1>
        <Link href="/upload" className={styles.uploadButton}>
          + アップロード
        </Link>
      </div>

      {/* Enhanced Stats */}
      <div className={styles.stats}>
        <div className={styles.statCard}>
          <span className={styles.statValue}>{interviews.length}</span>
          <span className={styles.statLabel}>総インタビュー</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statValue}>{completedInterviews.length}</span>
          <span className={styles.statLabel}>分析完了</span>
        </div>
        <div className={`${styles.statCard} ${styles.statHighlight}`}>
          <span className={styles.statValue}>{priorityCount}</span>
          <span className={styles.statLabel}>最優先ターゲット</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statValue}>
            {averageScore !== null ? averageScore : "-"}
          </span>
          <span className={styles.statLabel}>平均スコア</span>
        </div>
      </div>

      {/* Filters */}
      <div className={styles.filterSection}>
        {/* Status Filter */}
        <div className={styles.filterGroup}>
          <span className={styles.filterLabel}>ステータス</span>
          <div className={styles.filters}>
            {statusFilterOptions.map((option) => (
              <button
                key={option.value}
                className={`${styles.filterButton} ${
                  statusFilter === option.value ? styles.filterButtonActive : ""
                }`}
                onClick={() => setStatusFilter(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* Segment Filter */}
        <div className={styles.filterGroup}>
          <span className={styles.filterLabel}>セグメント</span>
          <div className={styles.filters}>
            {segmentFilterOptions.map((option) => (
              <button
                key={option.value}
                className={`${styles.filterButton} ${styles.segmentFilter} ${
                  segmentFilter === option.value ? styles.filterButtonActive : ""
                } ${option.value !== "ALL" ? styles[`segment${option.value}`] : ""}`}
                onClick={() => setSegmentFilter(option.value)}
              >
                {option.label}
                <span className={styles.filterCount}>({option.count})</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className={styles.loading}>読み込み中...</div>
      ) : error ? (
        <div className={styles.error}>{error}</div>
      ) : filteredInterviews.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyText}>
            {statusFilter === "ALL" && segmentFilter === "ALL"
              ? "インタビューがありません。動画をアップロードして始めましょう。"
              : "条件に一致するインタビューがありません。"}
          </p>
          {statusFilter === "ALL" && segmentFilter === "ALL" && (
            <Link href="/upload" className={styles.uploadButtonSecondary}>
              動画をアップロード
            </Link>
          )}
        </div>
      ) : (
        <div className={styles.interviewGrid}>
          {filteredInterviews.map((interview) => (
            <InterviewCard key={interview.interview_id} interview={interview} />
          ))}
        </div>
      )}
    </div>
  );
}
