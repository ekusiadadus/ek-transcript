"use client";

import { useState, useEffect, useMemo, type FormEvent } from "react";
import Link from "next/link";
import { useAuth } from "../../lib/auth-context";
import { listInterviews, getVideoUrl, type Interview, type AnalysisData } from "../../lib/graphql";
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

type ProcessingStatus = "pending" | "processing" | "completed" | "failed";

function StatusBadge({ status, progress }: { status: ProcessingStatus; progress?: number | null }) {
  const statusConfig = {
    pending: { label: "待機", className: styles.statusPending },
    processing: { label: "処理中", className: styles.statusProcessing },
    completed: { label: "完了", className: styles.statusCompleted },
    failed: { label: "失敗", className: styles.statusFailed },
  };

  const config = statusConfig[status];
  const showProgress = status === "processing" && progress !== null && progress !== undefined;

  return (
    <span className={`${styles.statusBadge} ${config.className}`}>
      {config.label}
      {showProgress && <span className={styles.progressText}>{progress}%</span>}
    </span>
  );
}

function SegmentBadge({ segment }: { segment: string | null | undefined }) {
  if (!segment) return null;

  const segmentClass = segment === "A"
    ? styles.segmentA
    : segment === "B"
      ? styles.segmentB
      : styles.segmentC;

  return (
    <span className={`${styles.segment} ${segmentClass}`}>
      {segment}
    </span>
  );
}

interface InterviewWithAnalysis extends Interview {
  analysisData?: AnalysisData | null;
}

function formatShortDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("ja-JP", { month: "short", day: "numeric" });
}

function formatFullDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Stats calculation
interface DashboardStats {
  totalInterviews: number;
  completedInterviews: number;
  averageScore: number;
  segmentCounts: { A: number; B: number; C: number; other: number };
  scoreDistribution: number[];
}

function calculateStats(interviews: InterviewWithAnalysis[]): DashboardStats {
  const completed = interviews.filter(i => i.status === "completed");
  const withScores = completed.filter(i => i.total_score !== null && i.total_score !== undefined);

  const avgScore = withScores.length > 0
    ? withScores.reduce((sum, i) => sum + (i.total_score || 0), 0) / withScores.length
    : 0;

  const segmentCounts = { A: 0, B: 0, C: 0, other: 0 };
  completed.forEach(i => {
    const seg = i.analysisData?.scoring?.segment;
    if (seg === "A") segmentCounts.A++;
    else if (seg === "B") segmentCounts.B++;
    else if (seg === "C") segmentCounts.C++;
    else segmentCounts.other++;
  });

  // Score distribution (0-5, 6-10, 11-15, 16-20, 21-25, 26-30)
  const scoreDistribution = [0, 0, 0, 0, 0, 0];
  withScores.forEach(i => {
    const score = i.total_score || 0;
    const bucket = Math.min(Math.floor(score / 5), 5);
    scoreDistribution[bucket]++;
  });

  return {
    totalInterviews: interviews.length,
    completedInterviews: completed.length,
    averageScore: Math.round(avgScore * 10) / 10,
    segmentCounts,
    scoreDistribution,
  };
}

function StatsGrid({ stats }: { stats: DashboardStats }) {
  return (
    <div className={styles.statsGrid}>
      <div className={styles.statCard}>
        <p className={styles.statLabel}>総インタビュー数</p>
        <p className={styles.statValue}>
          {stats.totalInterviews}
          <span className={styles.statUnit}>件</span>
        </p>
      </div>
      <div className={styles.statCard}>
        <p className={styles.statLabel}>完了</p>
        <p className={styles.statValue}>
          {stats.completedInterviews}
          <span className={styles.statUnit}>件</span>
        </p>
      </div>
      <div className={styles.statCard}>
        <p className={styles.statLabel}>平均スコア</p>
        <p className={styles.statValue}>
          {stats.averageScore}
          <span className={styles.statUnit}>/30</span>
        </p>
      </div>
      <div className={styles.statCard}>
        <p className={styles.statLabel}>セグメントA率</p>
        <p className={styles.statValue}>
          {stats.completedInterviews > 0
            ? Math.round((stats.segmentCounts.A / stats.completedInterviews) * 100)
            : 0}
          <span className={styles.statUnit}>%</span>
        </p>
      </div>
    </div>
  );
}

function ChartsSection({ stats }: { stats: DashboardStats }) {
  const total = stats.segmentCounts.A + stats.segmentCounts.B + stats.segmentCounts.C + stats.segmentCounts.other;
  const maxScoreCount = Math.max(...stats.scoreDistribution, 1);

  return (
    <div className={styles.chartsGrid}>
      <div className={styles.chartCard}>
        <h3 className={styles.chartTitle}>セグメント分布</h3>
        <div className={styles.barChart}>
          {["A", "B", "C"].map((seg) => {
            const count = stats.segmentCounts[seg as keyof typeof stats.segmentCounts];
            const percentage = total > 0 ? (count / total) * 100 : 0;
            return (
              <div key={seg} className={styles.barRow}>
                <span className={styles.barLabel}>セグメント{seg}</span>
                <div className={styles.barContainer}>
                  <div
                    className={`${styles.barFill} ${styles[`barFill${seg}`]}`}
                    style={{ width: `${percentage}%` }}
                  />
                </div>
                <span className={styles.barValue}>{count}件</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className={styles.chartCard}>
        <h3 className={styles.chartTitle}>スコア分布</h3>
        <div className={styles.scoreDistribution}>
          {stats.scoreDistribution.map((count, i) => (
            <div
              key={i}
              className={styles.scoreBar}
              style={{ height: `${(count / maxScoreCount) * 100}%` }}
              data-tooltip={`${i * 5}-${i * 5 + 5}点: ${count}件`}
            />
          ))}
        </div>
        <div className={styles.scoreLabels}>
          <span className={styles.scoreLabel}>0</span>
          <span className={styles.scoreLabel}>15</span>
          <span className={styles.scoreLabel}>30</span>
        </div>
      </div>
    </div>
  );
}

function InterviewDetailPanel({ interview }: { interview: InterviewWithAnalysis }) {
  const analysis = interview.analysisData;

  return (
    <div className={styles.detailPanel}>
      <div className={styles.detailHeader}>
        <div>
          <h3 className={styles.detailTitle}>
            {interview.file_name || `Interview ${interview.interview_id.substring(0, 8)}`}
          </h3>
          <p className={styles.detailDate}>{formatFullDate(interview.created_at)}</p>
        </div>
        <Link href={`/interview/${interview.interview_id}`} className={styles.detailLink}>
          詳細を見る →
        </Link>
      </div>

      <div className={styles.detailGrid}>
        <div className={styles.detailItem}>
          <p className={styles.detailLabel}>年齢</p>
          <p className={styles.detailValue}>
            {analysis?.basic_attributes?.age ?? "-"}歳
          </p>
        </div>
        <div className={styles.detailItem}>
          <p className={styles.detailLabel}>住居</p>
          <p className={styles.detailValue}>
            {analysis?.basic_attributes?.residence_type?.substring(0, 12) ?? "-"}
          </p>
        </div>
        <div className={styles.detailItem}>
          <p className={styles.detailLabel}>電気代(月)</p>
          <p className={styles.detailValue}>
            ¥{analysis?.electricity_cost?.recent_monthly_cost?.toLocaleString() ?? "-"}
          </p>
        </div>
        <div className={styles.detailItem}>
          <p className={styles.detailLabel}>世帯人数</p>
          <p className={styles.detailValue}>
            {analysis?.basic_attributes?.household_size ?? "-"}人
          </p>
        </div>
        <div className={styles.detailItem}>
          <p className={styles.detailLabel}>接続デバイス数</p>
          <p className={styles.detailValue}>
            {analysis?.device_info?.connected_devices_count ?? "-"}台
          </p>
        </div>
        <div className={styles.detailItem}>
          <p className={styles.detailLabel}>セグメント</p>
          <p className={styles.detailValue}>
            {analysis?.scoring?.segment ?? "-"}
          </p>
        </div>
      </div>

      <div className={styles.detailScores}>
        <div className={styles.scoreItem}>
          <p className={styles.scoreItemLabel}>電気代関心度</p>
          <p className={styles.scoreItemValue}>
            {analysis?.scoring?.electricity_interest_score ?? "-"}
            <span className={styles.scoreItemMax}>/10</span>
          </p>
        </div>
        <div className={styles.scoreItem}>
          <p className={styles.scoreItemLabel}>エンゲージメント</p>
          <p className={styles.scoreItemValue}>
            {analysis?.scoring?.engagement_score ?? "-"}
            <span className={styles.scoreItemMax}>/10</span>
          </p>
        </div>
        <div className={styles.scoreItem}>
          <p className={styles.scoreItemLabel}>クラファン適合度</p>
          <p className={styles.scoreItemValue}>
            {analysis?.scoring?.crowdfunding_fit_score ?? "-"}
            <span className={styles.scoreItemMax}>/10</span>
          </p>
        </div>
      </div>
    </div>
  );
}

function Dashboard() {
  const [interviews, setInterviews] = useState<InterviewWithAnalysis[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchInterviews() {
      try {
        const result = await listInterviews(50);
        const sortedItems = [...result.items].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );

        // Fetch analysis data for completed interviews
        const interviewsWithAnalysis: InterviewWithAnalysis[] = await Promise.all(
          sortedItems.map(async (interview) => {
            if (interview.analysis_key && interview.status === "completed") {
              try {
                const { videoUrl } = await getVideoUrl(interview.analysis_key);
                const response = await fetch(videoUrl);
                if (response.ok) {
                  const analysisData = await response.json();
                  return { ...interview, analysisData };
                }
              } catch {
                // Ignore fetch errors, just return without analysis
              }
            }
            return interview;
          })
        );

        setInterviews(interviewsWithAnalysis);
        if (interviewsWithAnalysis.length > 0) {
          setSelectedId(interviewsWithAnalysis[0].interview_id);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load interviews");
      } finally {
        setLoading(false);
      }
    }
    fetchInterviews();
  }, []);

  const stats = useMemo(() => calculateStats(interviews), [interviews]);
  const selectedInterview = interviews.find(i => i.interview_id === selectedId);

  if (loading) {
    return <div className={styles.loading}>Loading interviews...</div>;
  }

  if (error) {
    return <div className={styles.error}>{error}</div>;
  }

  if (interviews.length === 0) {
    return (
      <div className={styles.emptyState}>
        <div className={styles.emptyIcon}>📊</div>
        <p className={styles.emptyText}>インタビューがありません。動画をアップロードして開始してください。</p>
      </div>
    );
  }

  return (
    <div className={styles.content}>
      {/* Left sidebar - Interview list */}
      <div className={styles.sidebar}>
        <h2 className={styles.sidebarTitle}>インタビュー履歴 ({interviews.length})</h2>
        <div className={styles.interviewList}>
          {interviews.map((interview) => (
            <div
              key={interview.interview_id}
              className={`${styles.interviewItem} ${selectedId === interview.interview_id ? styles.interviewItemSelected : ""}`}
              onClick={() => setSelectedId(interview.interview_id)}
            >
              <div className={styles.interviewItemHeader}>
                <h4 className={styles.interviewItemTitle}>
                  {interview.file_name || `Interview ${interview.interview_id.substring(0, 8)}`}
                </h4>
                <StatusBadge
                  status={(interview.status as ProcessingStatus) || "pending"}
                  progress={interview.progress}
                />
              </div>
              <span className={styles.interviewItemDate}>
                {formatShortDate(interview.created_at)}
              </span>
              <div className={styles.interviewItemMeta}>
                {interview.total_score !== null && interview.total_score !== undefined && (
                  <span className={styles.interviewItemScore}>{interview.total_score}点</span>
                )}
                <SegmentBadge segment={interview.analysisData?.scoring?.segment} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right main area */}
      <div className={styles.mainArea}>
        <StatsGrid stats={stats} />
        <ChartsSection stats={stats} />
        {selectedInterview && <InterviewDetailPanel interview={selectedInterview} />}
      </div>
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
      <main>
        <Dashboard />
      </main>
    </div>
  );
}
