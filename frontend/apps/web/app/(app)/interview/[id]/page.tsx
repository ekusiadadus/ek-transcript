"use client";

/**
 * Interview Detail Page - Video-Transcript Sync (US-7, US-8, US-9)
 *
 * Core features:
 * - Video playback with seek functionality
 * - Transcript viewer with timestamp sync
 * - Analysis results display
 * - Evidence jump (click transcript to seek video)
 */
import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "../../../../lib/auth-context";
import {
  getInterview,
  getVideoUrl,
  type Interview,
  type AnalysisData,
} from "../../../../lib/graphql";
import { VideoPlayer, type VideoPlayerRef } from "../../../../components/VideoPlayer";
import {
  TranscriptViewer,
  type TranscriptViewerRef,
} from "../../../../components/TranscriptViewer";
import styles from "./page.module.css";

type ProcessingStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";

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

/**
 * Get judgment label and style based on total score
 */
function getScoreJudgment(score: number): {
  label: string;
  className: string;
} {
  if (score >= 25)
    return { label: "最優先ターゲット", className: styles.judgmentPriority ?? "" };
  if (score >= 18)
    return { label: "有望ターゲット", className: styles.judgmentPromising ?? "" };
  if (score >= 12)
    return { label: "要検討", className: styles.judgmentReview ?? "" };
  return { label: "ターゲット外", className: styles.judgmentOutside ?? "" };
}

/**
 * Get segment style class
 */
function getSegmentClass(segment: string | null): string {
  switch (segment) {
    case "A":
      return styles.segmentA ?? "";
    case "B":
      return styles.segmentB ?? "";
    case "C":
      return styles.segmentC ?? "";
    default:
      return styles.segmentD ?? "";
  }
}

/**
 * Analysis Summary Component
 */
function AnalysisSummary({ analysis }: { analysis: AnalysisData }) {
  const scoring = analysis.scoring;
  const totalScore = scoring?.total_score ?? 0;
  const judgment = getScoreJudgment(totalScore);
  const segment = scoring?.segment;

  return (
    <div className={styles.analysisSection}>
      <h2 className={styles.sectionTitle}>分析結果</h2>

      {/* Summary */}
      {analysis.summary && (
        <div className={styles.summaryCard}>
          <p className={styles.summaryText}>{analysis.summary}</p>
        </div>
      )}

      {/* Score Grid */}
      <div className={styles.scoreGrid}>
        <div className={styles.scoreCard}>
          <p className={styles.scoreLabel}>総合スコア</p>
          <p className={styles.scoreValue}>
            {totalScore}
            <span className={styles.scoreMax}>/30</span>
          </p>
          <div className={`${styles.judgmentBadge} ${judgment.className}`}>
            {judgment.label}
          </div>
        </div>
        <div className={styles.scoreCard}>
          <p className={styles.scoreLabel}>セグメント</p>
          {segment && (
            <span className={`${styles.segmentBadge} ${getSegmentClass(segment)}`}>
              {segment}
            </span>
          )}
          {scoring?.segment_reason && (
            <p
              className={styles.scoreLabel}
              style={{ marginTop: 8, fontSize: 12 }}
            >
              {scoring.segment_reason}
            </p>
          )}
        </div>
        <div className={styles.scoreCard}>
          <p className={styles.scoreLabel}>インタビュー時間</p>
          <p className={styles.scoreValue}>
            {analysis.interview_duration_minutes ?? "-"}
            <span className={styles.scoreMax}>分</span>
          </p>
        </div>
      </div>

      {/* Signals */}
      <SignalsSection analysis={analysis} />

      {/* Insights */}
      <InsightsSection analysis={analysis} />

      {/* Action Items */}
      {analysis.action_items && analysis.action_items.length > 0 && (
        <ActionItemsSection actionItems={analysis.action_items} />
      )}
    </div>
  );
}

/**
 * Signals Section - Good/Bad indicators
 */
function SignalsSection({ analysis }: { analysis: AnalysisData }) {
  const signals = analysis.signal_details;
  if (!signals) return null;

  const goodSignals: string[] = [];
  const badSignals: string[] = [];

  // Fixed signals
  if (signals.good_took_cost_action) goodSignals.push("過去にコスト削減行動をとった");
  if (signals.good_uses_app_weekly) goodSignals.push("アプリを週次で利用");
  if (signals.good_has_crowdfunding_exp) goodSignals.push("クラファン経験あり");
  if (signals.good_would_replace_immediately) goodSignals.push("故障時すぐに買い直す");

  if (signals.bad_no_past_action) badSignals.push("過去の行動なし");
  if (signals.bad_no_bill_check_6months) badSignals.push("6ヶ月以上明細を確認していない");
  if (signals.bad_device_barely_used) badSignals.push("デバイスをほとんど使っていない");
  if (signals.bad_said_will_consider) badSignals.push("「検討します」と発言");

  // Additional signals
  if (signals.additional_good_signals) {
    goodSignals.push(...signals.additional_good_signals);
  }
  if (signals.additional_bad_signals) {
    badSignals.push(...signals.additional_bad_signals);
  }

  if (goodSignals.length === 0 && badSignals.length === 0) return null;

  return (
    <div className={styles.signalsSection}>
      <h3 className={styles.sectionTitleSmall}>シグナル分析</h3>
      <div className={styles.signalsGrid}>
        {goodSignals.length > 0 && (
          <div className={`${styles.signalGroup} ${styles.signalGroupGood}`}>
            <h4
              className={`${styles.signalGroupTitle} ${styles.signalGroupTitleGood}`}
            >
              Good Signals ({goodSignals.length})
            </h4>
            <ul className={styles.signalList}>
              {goodSignals.map((signal, i) => (
                <li key={i} className={styles.signalItem}>
                  <span className={`${styles.signalIcon} ${styles.signalIconGood}`}>
                    ✓
                  </span>
                  <span>{signal}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {badSignals.length > 0 && (
          <div className={`${styles.signalGroup} ${styles.signalGroupBad}`}>
            <h4
              className={`${styles.signalGroupTitle} ${styles.signalGroupTitleBad}`}
            >
              Bad Signals ({badSignals.length})
            </h4>
            <ul className={styles.signalList}>
              {badSignals.map((signal, i) => (
                <li key={i} className={styles.signalItem}>
                  <span className={`${styles.signalIcon} ${styles.signalIconBad}`}>
                    ✗
                  </span>
                  <span>{signal}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Insights Section
 */
function InsightsSection({ analysis }: { analysis: AnalysisData }) {
  const insights = analysis.insights;
  if (!insights) return null;

  const hasInsights =
    insights.most_impressive_quote ||
    insights.unexpected_findings ||
    insights.non_negotiable_value ||
    insights.reason_not_to_pay;

  if (!hasInsights) return null;

  return (
    <div className={styles.insightsSection}>
      <h3 className={styles.sectionTitleSmall}>インサイト</h3>
      <div className={styles.insightsList}>
        {insights.most_impressive_quote && (
          <div className={styles.insightCard}>
            <p className={styles.insightLabel}>印象的な発言</p>
            <p className={`${styles.insightText} ${styles.insightQuote}`}>
              &ldquo;{insights.most_impressive_quote}&rdquo;
            </p>
          </div>
        )}
        {insights.unexpected_findings && (
          <div className={styles.insightCard}>
            <p className={styles.insightLabel}>予想外の発見</p>
            <p className={styles.insightText}>{insights.unexpected_findings}</p>
          </div>
        )}
        {insights.non_negotiable_value && (
          <div className={styles.insightCard}>
            <p className={styles.insightLabel}>譲れない価値</p>
            <p className={styles.insightText}>{insights.non_negotiable_value}</p>
          </div>
        )}
        {insights.reason_not_to_pay && (
          <div className={styles.insightCard}>
            <p className={styles.insightLabel}>支払わない理由</p>
            <p className={styles.insightText}>{insights.reason_not_to_pay}</p>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Action Items Section
 */
function ActionItemsSection({ actionItems }: { actionItems: string[] }) {
  if (actionItems.length === 0) return null;

  return (
    <div className={styles.actionItems}>
      <h3 className={styles.sectionTitleSmall}>アクション項目</h3>
      <ul className={styles.actionList}>
        {actionItems.map((item, i) => (
          <li key={i} className={styles.actionItem}>
            <span className={styles.actionIcon}>→</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Main Interview Content with Video-Transcript Sync
 */
function InterviewContent({
  interview,
  analysis,
}: {
  interview: Interview;
  analysis: AnalysisData | null;
}) {
  const videoRef = useRef<VideoPlayerRef>(null);
  const transcriptRef = useRef<TranscriptViewerRef>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [syncEnabled, setSyncEnabled] = useState(true);

  // Handle video time update - sync transcript position
  const handleTimeUpdate = useCallback(
    (time: number) => {
      setCurrentTime(time);
      if (syncEnabled && transcriptRef.current) {
        transcriptRef.current.scrollToTime(time);
      }
    },
    [syncEnabled]
  );

  // Handle transcript timestamp click - seek video
  const handleTimestampClick = useCallback((seconds: number) => {
    if (videoRef.current) {
      videoRef.current.seekTo(seconds);
      videoRef.current.play();
    }
  }, []);

  return (
    <div className={styles.content}>
      {/* Main Column - Video & Analysis */}
      <div className={styles.mainColumn}>
        {/* Video Section */}
        {interview.video_key && (
          <div className={styles.videoSection}>
            <div className={styles.videoContainer}>
              <VideoPlayer
                ref={videoRef}
                videoKey={interview.video_key}
                onTimeUpdate={handleTimeUpdate}
              />
            </div>
          </div>
        )}

        {/* Analysis Section */}
        {analysis ? (
          <AnalysisSummary analysis={analysis} />
        ) : (
          <div className={styles.analysisSection}>
            <div className={styles.noAnalysis}>
              <p className={styles.noAnalysisText}>分析データがありません</p>
            </div>
          </div>
        )}

        {/* Meta Info */}
        <div className={styles.metaSection}>
          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>作成日:</span>
            <span>{formatDate(interview.created_at)}</span>
          </div>
          {interview.file_name && (
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>ファイル:</span>
              <span>{interview.file_name}</span>
            </div>
          )}
          {interview.segment && (
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>セグメント:</span>
              <span>{interview.segment}</span>
            </div>
          )}
        </div>
      </div>

      {/* Side Column - Transcript */}
      <div className={styles.sideColumn}>
        <div className={styles.transcriptSection}>
          <div className={styles.transcriptHeader}>
            <h3 className={styles.transcriptTitle}>文字起こし</h3>
            <label className={styles.syncToggle}>
              <input
                type="checkbox"
                checked={syncEnabled}
                onChange={(e) => setSyncEnabled(e.target.checked)}
              />
              <span>同期</span>
            </label>
          </div>
          <div className={styles.transcriptContent}>
            {interview.transcript_key ? (
              <TranscriptViewer
                ref={transcriptRef}
                transcriptKey={interview.transcript_key}
                currentTime={currentTime}
                syncEnabled={syncEnabled}
                onTimestampClick={handleTimestampClick}
              />
            ) : (
              <div className={styles.emptyTranscript}>
                <span className={styles.emptyIcon}>📝</span>
                <p className={styles.emptyText}>文字起こしがありません</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Processing View - Shows progress while interview is being processed
 */
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

/**
 * Failed View - Shows error when processing failed
 */
function FailedView({
  interview,
  onRetry,
}: {
  interview: Interview;
  onRetry: () => void;
}) {
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

/**
 * Main Interview Page Component
 */
export default function InterviewPage() {
  const params = useParams();
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [interview, setInterview] = useState<Interview | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const interviewId = params.id as string;

  const loadInterview = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getInterview(interviewId);
      setInterview(data);

      // Load analysis data if available
      if (data?.analysis_key && data.status === "COMPLETED") {
        try {
          const { videoUrl } = await getVideoUrl(data.analysis_key);
          const response = await fetch(videoUrl);
          if (response.ok) {
            const analysisData = await response.json();
            setAnalysis(analysisData);
          }
        } catch {
          // Ignore analysis fetch errors
        }
      }
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

  // Poll while processing
  useEffect(() => {
    const status = interview?.status?.toUpperCase();
    if (status === "PENDING" || status === "PROCESSING") {
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

  if (error) {
    return (
      <div className={styles.page}>
        <header className={styles.header}>
          <h1 className={styles.title}>Interview</h1>
          <div className={styles.headerActions}>
            <Link href="/dashboard" className={styles.headerLink}>
              Dashboard
            </Link>
          </div>
        </header>
        <div className={styles.errorContainer}>
          <p className={styles.errorText}>{error}</p>
          <button className={styles.retryButton} onClick={loadInterview}>
            再試行
          </button>
        </div>
      </div>
    );
  }

  if (!interview) {
    return (
      <div className={styles.page}>
        <div className={styles.loadingContainer}>
          <div className={styles.loading}>Interview not found</div>
        </div>
      </div>
    );
  }

  const status = (interview.status?.toUpperCase() as ProcessingStatus) || "PENDING";

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>
          {interview.file_name || `Interview ${interview.interview_id.slice(0, 8)}`}
        </h1>
        <div className={styles.headerActions}>
          <Link href="/upload" className={styles.headerLink}>
            Upload
          </Link>
          <Link href="/dashboard" className={styles.headerLink}>
            Dashboard
          </Link>
        </div>
      </header>

      {status === "FAILED" && (
        <FailedView interview={interview} onRetry={handleBackToDashboard} />
      )}

      {(status === "PENDING" || status === "PROCESSING") && (
        <ProcessingView interview={interview} />
      )}

      {status === "COMPLETED" && (
        <InterviewContent interview={interview} analysis={analysis} />
      )}
    </div>
  );
}
