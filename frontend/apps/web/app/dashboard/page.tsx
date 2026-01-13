"use client";

import { useState, useEffect, useMemo, useCallback, type FormEvent } from "react";
import Link from "next/link";
import { useAuth } from "../../lib/auth-context";
import { listInterviews, getVideoUrl, type Interview, type AnalysisData } from "../../lib/graphql";
import {
  InterviewFilter,
  defaultFilterState,
  type InterviewFilterState,
} from "../../components/InterviewFilter";
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
  segmentCounts: { A: number; B: number; C: number; D: number; other: number };
  scoreDistribution: number[];
  priorityTargetCount: number; // 25点以上
  promisingTargetCount: number; // 18-24点
  reviewTargetCount: number; // 12-17点
  outsideTargetCount: number; // 11点以下
  // 3スコア別平均
  avgElectricityScore: number;
  avgEngagementScore: number;
  avgCrowdfundingScore: number;
  // Good Signal集計
  goodSignals: {
    pastActions: number; // 電気代削減に過去お金/時間を使った
    weeklyAppUsers: number; // アプリ週1回以上
    crowdfundingExp: number; // クラファン経験あり
    immediateRebuy: number; // 即買い直す意向
  };
  // Bad Signal集計
  badSignals: {
    noActions: number; // 過去に行動なし
    noBillCheck: number; // 明細6ヶ月以上見ていない
    rarelyUseDevice: number; // デバイスほとんど使っていない
  };
}

function calculateStats(interviews: InterviewWithAnalysis[]): DashboardStats {
  const completed = interviews.filter(i => i.status === "completed");
  const withScores = completed.filter(i => i.total_score !== null && i.total_score !== undefined);
  const withAnalysis = completed.filter(i => i.analysisData);

  const avgScore = withScores.length > 0
    ? withScores.reduce((sum, i) => sum + (i.total_score || 0), 0) / withScores.length
    : 0;

  // 3スコア別平均
  let totalElectricityScore = 0, totalEngagementScore = 0, totalCrowdfundingScore = 0;
  let scoreCount = 0;
  withAnalysis.forEach(i => {
    const scoring = i.analysisData?.scoring;
    if (scoring) {
      totalElectricityScore += scoring.electricity_interest_score || 0;
      totalEngagementScore += scoring.engagement_score || 0;
      totalCrowdfundingScore += scoring.crowdfunding_fit_score || 0;
      scoreCount++;
    }
  });

  // セグメント分類 (A: 省エネ意識高, B: ガジェット好き, C: 便利さ追求, D: ライト層)
  const segmentCounts = { A: 0, B: 0, C: 0, D: 0, other: 0 };
  completed.forEach(i => {
    const seg = i.analysisData?.scoring?.segment;
    if (seg === "A") segmentCounts.A++;
    else if (seg === "B") segmentCounts.B++;
    else if (seg === "C") segmentCounts.C++;
    else if (seg === "D") segmentCounts.D++;
    else segmentCounts.other++;
  });

  // Score distribution (0-5, 6-10, 11-15, 16-20, 21-25, 26-30)
  const scoreDistribution = [0, 0, 0, 0, 0, 0];
  let priorityTargetCount = 0; // 25-30点: 最優先ターゲット
  let promisingTargetCount = 0; // 18-24点: 有望ターゲット
  let reviewTargetCount = 0; // 12-17点: 要検討
  let outsideTargetCount = 0; // 11点以下: ターゲット外

  withScores.forEach(i => {
    const score = i.total_score || 0;
    const bucket = Math.min(Math.floor(score / 5), 5);
    if (scoreDistribution[bucket] !== undefined) {
      scoreDistribution[bucket]++;
    }

    // 判定基準によるカウント
    if (score >= 25) priorityTargetCount++;
    else if (score >= 18) promisingTargetCount++;
    else if (score >= 12) reviewTargetCount++;
    else outsideTargetCount++;
  });

  // Good Signal / Bad Signal 集計
  const goodSignals = { pastActions: 0, weeklyAppUsers: 0, crowdfundingExp: 0, immediateRebuy: 0 };
  const badSignals = { noActions: 0, noBillCheck: 0, rarelyUseDevice: 0 };

  withAnalysis.forEach(i => {
    const analysis = i.analysisData;
    if (!analysis) return;

    // Good Signals
    const pastActions = analysis.electricity_cost?.past_year_actions;
    if (pastActions && pastActions.length > 0) goodSignals.pastActions++;

    const appFreq = analysis.device_info?.app_usage_frequency;
    if (appFreq === "毎日開く" || appFreq?.includes("週")) goodSignals.weeklyAppUsers++;

    if (analysis.crowdfunding_experience?.has_crowdfunding_experience) goodSignals.crowdfundingExp++;

    const rebuyIntent = analysis.device_info?.replacement_intention;
    if (rebuyIntent?.includes("即") || rebuyIntent?.includes("すぐ")) goodSignals.immediateRebuy++;

    // Bad Signals
    if (!pastActions || pastActions.length === 0) badSignals.noActions++;

    const billFreq = analysis.electricity_cost?.bill_check_frequency;
    if (billFreq === "ほぼ見ない" || billFreq?.includes("見ない")) badSignals.noBillCheck++;

    if (appFreq === "ほぼ開かない" || appFreq?.includes("月数回")) badSignals.rarelyUseDevice++;
  });

  return {
    totalInterviews: interviews.length,
    completedInterviews: completed.length,
    averageScore: Math.round(avgScore * 10) / 10,
    segmentCounts,
    scoreDistribution,
    priorityTargetCount,
    promisingTargetCount,
    reviewTargetCount,
    outsideTargetCount,
    avgElectricityScore: scoreCount > 0 ? Math.round((totalElectricityScore / scoreCount) * 10) / 10 : 0,
    avgEngagementScore: scoreCount > 0 ? Math.round((totalEngagementScore / scoreCount) * 10) / 10 : 0,
    avgCrowdfundingScore: scoreCount > 0 ? Math.round((totalCrowdfundingScore / scoreCount) * 10) / 10 : 0,
    goodSignals,
    badSignals,
  };
}

// 判定基準に基づくラベル取得
function getScoreJudgment(score: number): { label: string; className: string } {
  if (score >= 25) return { label: "最優先ターゲット", className: styles.judgmentPriority ?? "" };
  if (score >= 18) return { label: "有望ターゲット", className: styles.judgmentPromising ?? "" };
  if (score >= 12) return { label: "要検討", className: styles.judgmentReview ?? "" };
  return { label: "ターゲット外", className: styles.judgmentOutside ?? "" };
}

// Campfire 500名目標に対するKPIサマリー
function KPISummary({ stats }: { stats: DashboardStats }) {
  const TARGET_SUPPORTERS = 500;
  const priorityRate = stats.completedInterviews > 0
    ? (stats.priorityTargetCount / stats.completedInterviews) * 100 : 0;
  const promisingRate = stats.completedInterviews > 0
    ? (stats.promisingTargetCount / stats.completedInterviews) * 100 : 0;

  return (
    <div className={styles.kpiSummary}>
      <h2 className={styles.sectionTitle}>Campfire 500名目標</h2>
      <div className={styles.kpiGrid}>
        <div className={styles.kpiCard}>
          <p className={styles.kpiLabel}>目標進捗</p>
          <p className={styles.kpiValue}>
            {stats.completedInterviews}
            <span className={styles.kpiUnit}>/ {TARGET_SUPPORTERS}</span>
          </p>
          <div className={styles.progressBar}>
            <div
              className={styles.progressFill}
              style={{ width: `${Math.min((stats.completedInterviews / TARGET_SUPPORTERS) * 100, 100)}%` }}
            />
          </div>
          <p className={styles.kpiSubLabel}>
            {Math.round((stats.completedInterviews / TARGET_SUPPORTERS) * 100)}% 達成
          </p>
        </div>
        <div className={styles.kpiCard}>
          <p className={styles.kpiLabel}>最優先ターゲット率</p>
          <p className={styles.kpiValue}>
            {Math.round(priorityRate)}
            <span className={styles.kpiUnit}>%</span>
          </p>
          <p className={styles.kpiSubLabel}>目標: 20%以上</p>
        </div>
        <div className={styles.kpiCard}>
          <p className={styles.kpiLabel}>有望ターゲット率</p>
          <p className={styles.kpiValue}>
            {Math.round(promisingRate)}
            <span className={styles.kpiUnit}>%</span>
          </p>
          <p className={styles.kpiSubLabel}>最優先+有望: {Math.round(priorityRate + promisingRate)}%</p>
        </div>
      </div>
    </div>
  );
}

// 判定基準別集計
function JudgmentBreakdown({ stats }: { stats: DashboardStats }) {
  const total = stats.priorityTargetCount + stats.promisingTargetCount + stats.reviewTargetCount + stats.outsideTargetCount;
  const items = [
    { label: "最優先ターゲット", count: stats.priorityTargetCount, range: "25-30点", className: styles.judgmentPriority },
    { label: "有望ターゲット", count: stats.promisingTargetCount, range: "18-24点", className: styles.judgmentPromising },
    { label: "要検討", count: stats.reviewTargetCount, range: "12-17点", className: styles.judgmentReview },
    { label: "ターゲット外", count: stats.outsideTargetCount, range: "0-11点", className: styles.judgmentOutside },
  ];

  return (
    <div className={styles.chartCard}>
      <h3 className={styles.chartTitle}>判定基準別集計</h3>
      <div className={styles.judgmentGrid}>
        {items.map((item) => (
          <div key={item.label} className={styles.judgmentRow}>
            <span className={`${styles.judgmentBadge} ${item.className}`}>{item.label}</span>
            <span className={styles.judgmentRange}>{item.range}</span>
            <span className={styles.judgmentCount}>{item.count}件</span>
            <span className={styles.judgmentPercent}>
              {total > 0 ? Math.round((item.count / total) * 100) : 0}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// 3スコア詳細分析
function ScoreAnalysis({ stats }: { stats: DashboardStats }) {
  const scores = [
    { label: "電気代関心度", avg: stats.avgElectricityScore, description: "電力切替・料金意識" },
    { label: "エンゲージメント", avg: stats.avgEngagementScore, description: "デバイス活用度" },
    { label: "クラファン適合度", avg: stats.avgCrowdfundingScore, description: "支援経験・意欲" },
  ];

  return (
    <div className={styles.chartCard}>
      <h3 className={styles.chartTitle}>3スコア詳細分析</h3>
      <div className={styles.scoreAnalysisGrid}>
        {scores.map((score) => (
          <div key={score.label} className={styles.scoreAnalysisItem}>
            <p className={styles.scoreAnalysisLabel}>{score.label}</p>
            <p className={styles.scoreAnalysisValue}>
              {score.avg}
              <span className={styles.scoreAnalysisMax}>/10</span>
            </p>
            <div className={styles.scoreAnalysisBar}>
              <div
                className={styles.scoreAnalysisBarFill}
                style={{ width: `${score.avg * 10}%` }}
              />
            </div>
            <p className={styles.scoreAnalysisDesc}>{score.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// Good/Bad Signal集計
function SignalsGrid({ stats }: { stats: DashboardStats }) {
  const goodSignals = [
    { label: "電気代削減に行動", count: stats.goodSignals.pastActions },
    { label: "アプリ週1回以上", count: stats.goodSignals.weeklyAppUsers },
    { label: "クラファン経験あり", count: stats.goodSignals.crowdfundingExp },
    { label: "即買い直す意向", count: stats.goodSignals.immediateRebuy },
  ];
  const badSignals = [
    { label: "過去に行動なし", count: stats.badSignals.noActions },
    { label: "明細6ヶ月以上未確認", count: stats.badSignals.noBillCheck },
    { label: "デバイス未活用", count: stats.badSignals.rarelyUseDevice },
  ];

  return (
    <div className={styles.signalsSection}>
      <div className={styles.signalCard}>
        <h3 className={styles.signalTitle}>Good Signals</h3>
        <div className={styles.signalList}>
          {goodSignals.map((signal) => (
            <div key={signal.label} className={styles.signalItem}>
              <span className={styles.signalLabel}>{signal.label}</span>
              <span className={styles.signalCount}>{signal.count}件</span>
            </div>
          ))}
        </div>
      </div>
      <div className={styles.signalCard}>
        <h3 className={styles.signalTitleBad}>Bad Signals</h3>
        <div className={styles.signalList}>
          {badSignals.map((signal) => (
            <div key={signal.label} className={styles.signalItemBad}>
              <span className={styles.signalLabel}>{signal.label}</span>
              <span className={styles.signalCount}>{signal.count}件</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatsGrid({ stats }: { stats: DashboardStats }) {
  const judgment = getScoreJudgment(stats.averageScore);

  return (
    <div className={styles.statsGrid}>
      <div className={styles.statCard}>
        <p className={styles.statLabel}>完了インタビュー数</p>
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
        <p className={`${styles.judgment} ${judgment.className}`}>{judgment.label}</p>
      </div>
      <div className={styles.statCard}>
        <p className={styles.statLabel}>最優先ターゲット</p>
        <p className={styles.statValue}>
          {stats.priorityTargetCount}
          <span className={styles.statUnit}>件</span>
        </p>
        <p className={styles.statSubLabel}>25点以上</p>
      </div>
      <div className={styles.statCard}>
        <p className={styles.statLabel}>セグメントA率</p>
        <p className={styles.statValue}>
          {stats.completedInterviews > 0
            ? Math.round((stats.segmentCounts.A / stats.completedInterviews) * 100)
            : 0}
          <span className={styles.statUnit}>%</span>
        </p>
        <p className={styles.statSubLabel}>省エネ意識高</p>
      </div>
    </div>
  );
}

// セグメント定義
const SEGMENT_DEFINITIONS: Record<string, { label: string; description: string }> = {
  A: { label: "省エネ意識高", description: "電気代関心度7点以上 + 電力切替経験あり" },
  B: { label: "ガジェット好き", description: "クラファン経験あり + 連携家電5台以上" },
  C: { label: "便利さ追求", description: "エンゲージメント7点以上 + 電気代関心度4点以下" },
  D: { label: "ライト層", description: "アプリ月数回以下 + オートメーション1つ以下" },
};

function ChartsSection({ stats }: { stats: DashboardStats }) {
  const total = stats.segmentCounts.A + stats.segmentCounts.B + stats.segmentCounts.C + stats.segmentCounts.D + stats.segmentCounts.other;
  const maxScoreCount = Math.max(...stats.scoreDistribution, 1);

  return (
    <div className={styles.chartsGrid}>
      <div className={styles.chartCard}>
        <h3 className={styles.chartTitle}>セグメント分布</h3>
        <div className={styles.barChart}>
          {["A", "B", "C", "D"].map((seg) => {
            const count = stats.segmentCounts[seg as keyof typeof stats.segmentCounts];
            const percentage = total > 0 ? (count / total) * 100 : 0;
            const definition = SEGMENT_DEFINITIONS[seg];
            return (
              <div key={seg} className={styles.barRow}>
                <span className={styles.barLabel} title={definition?.description}>
                  {seg}: {definition?.label}
                </span>
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

/**
 * Filter interviews based on filter state
 */
function filterInterviews(
  interviews: InterviewWithAnalysis[],
  filters: InterviewFilterState
): InterviewWithAnalysis[] {
  return interviews.filter((interview) => {
    // Product segment filter (uses interview.segment field)
    if (filters.productSegment && interview.segment !== filters.productSegment) {
      return false;
    }

    // User segment filter (uses analysisData.scoring.segment)
    if (filters.userSegment) {
      const userSeg = interview.analysisData?.scoring?.segment;
      if (userSeg !== filters.userSegment) {
        return false;
      }
    }

    // Processing status filter
    if (filters.status) {
      const status = interview.status || "pending";
      if (status !== filters.status) {
        return false;
      }
    }

    // Judgment filter
    if (filters.judgment) {
      const score = interview.total_score;
      if (score === null || score === undefined) {
        return false;
      }
      const judgmentMap: Record<string, [number, number]> = {
        priority: [25, 30],
        promising: [18, 24],
        review: [12, 17],
        outside: [0, 11],
      };
      const [min, max] = judgmentMap[filters.judgment] || [0, 30];
      if (score < min || score > max) {
        return false;
      }
    }

    // Score range filter
    if (filters.scoreMin !== null) {
      const score = interview.total_score;
      if (score === null || score === undefined || score < filters.scoreMin) {
        return false;
      }
    }
    if (filters.scoreMax !== null) {
      const score = interview.total_score;
      if (score === null || score === undefined || score > filters.scoreMax) {
        return false;
      }
    }

    // Date range filter
    if (filters.dateFrom) {
      const interviewDate = new Date(interview.created_at);
      const fromDate = new Date(filters.dateFrom);
      if (interviewDate < fromDate) {
        return false;
      }
    }
    if (filters.dateTo) {
      const interviewDate = new Date(interview.created_at);
      const toDate = new Date(filters.dateTo);
      toDate.setHours(23, 59, 59, 999); // End of day
      if (interviewDate > toDate) {
        return false;
      }
    }

    // Keyword search (file name, summary)
    if (filters.keyword) {
      const keyword = filters.keyword.toLowerCase();
      const fileName = (interview.file_name || "").toLowerCase();
      const summary = (interview.analysisData?.summary || "").toLowerCase();
      const interviewId = interview.interview_id.toLowerCase();
      if (
        !fileName.includes(keyword) &&
        !summary.includes(keyword) &&
        !interviewId.includes(keyword)
      ) {
        return false;
      }
    }

    return true;
  });
}

function Dashboard() {
  const [interviews, setInterviews] = useState<InterviewWithAnalysis[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<InterviewFilterState>(defaultFilterState);

  // Filter change handler
  const handleFilterChange = useCallback((newFilters: InterviewFilterState) => {
    setFilters(newFilters);
  }, []);

  // Filter reset handler
  const handleFilterReset = useCallback(() => {
    setFilters(defaultFilterState);
  }, []);

  // Filtered interviews
  const filteredInterviews = useMemo(
    () => filterInterviews(interviews, filters),
    [interviews, filters]
  );

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
        const firstInterview = interviewsWithAnalysis[0];
        if (firstInterview) {
          setSelectedId(firstInterview.interview_id);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load interviews");
      } finally {
        setLoading(false);
      }
    }
    fetchInterviews();
  }, []);

  const stats = useMemo(() => calculateStats(filteredInterviews), [filteredInterviews]);
  const selectedInterview = filteredInterviews.find(i => i.interview_id === selectedId);

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
        <h2 className={styles.sidebarTitle}>
          インタビュー履歴 ({filteredInterviews.length}
          {filteredInterviews.length !== interviews.length && (
            <span className={styles.totalCount}> / {interviews.length}</span>
          )}
          )
        </h2>
        <InterviewFilter
          filters={filters}
          onChange={handleFilterChange}
          onReset={handleFilterReset}
          collapsible
          defaultExpanded={false}
        />
        <div className={styles.interviewList}>
          {filteredInterviews.map((interview) => (
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
                  <>
                    <span className={styles.interviewItemScore}>{interview.total_score}点</span>
                    <span className={`${styles.judgmentMini} ${getScoreJudgment(interview.total_score).className}`}>
                      {getScoreJudgment(interview.total_score).label}
                    </span>
                  </>
                )}
                <SegmentBadge segment={interview.analysisData?.scoring?.segment} />
              </div>
              {interview.status === "completed" && (
                <Link
                  href={`/interview/${interview.interview_id}`}
                  className={styles.interviewItemLink}
                  onClick={(e) => e.stopPropagation()}
                >
                  詳細を見る →
                </Link>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Right main area */}
      <div className={styles.mainArea}>
        <KPISummary stats={stats} />
        <StatsGrid stats={stats} />
        <div className={styles.analysisRow}>
          <JudgmentBreakdown stats={stats} />
          <ScoreAnalysis stats={stats} />
        </div>
        <SignalsGrid stats={stats} />
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
          <Link href="/meetings" className={styles.uploadLink}>
            Meetings
          </Link>
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
