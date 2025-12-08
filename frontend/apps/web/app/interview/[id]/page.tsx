"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "../../../lib/auth-context";
import { getInterview, getVideoUrl, type Interview, type AnalysisData } from "../../../lib/graphql";
import { TranscriptViewer } from "../../../components/TranscriptViewer";
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

function ScoreHero({ analysis }: { analysis: AnalysisData }) {
  const scoring = analysis.scoring;
  const segment = scoring?.segment;
  const segmentClass = segment === "A"
    ? styles.segmentA
    : segment === "B"
      ? styles.segmentB
      : styles.segmentC;

  return (
    <div className={styles.scoreHero}>
      <div className={styles.totalScoreCard}>
        <p className={styles.totalScoreLabel}>総合スコア</p>
        <p className={styles.totalScoreValue}>
          {scoring?.total_score ?? "-"}
          <span className={styles.totalScoreMax}>/30</span>
        </p>
        {segment && (
          <span className={`${styles.segmentBadgeLarge} ${segmentClass}`}>
            セグメント {segment}
          </span>
        )}
      </div>

      <div className={styles.scoreBreakdown}>
        <h3 className={styles.scoreBreakdownTitle}>スコア内訳</h3>

        <div className={styles.scoreRow}>
          <span className={styles.scoreRowLabel}>電気代関心度</span>
          <div className={styles.scoreBarContainer}>
            <div
              className={`${styles.scoreBarFill} ${styles.scoreBarFillElectricity}`}
              style={{ width: `${((scoring?.electricity_interest_score ?? 0) / 10) * 100}%` }}
            />
          </div>
          <span className={styles.scoreRowValue}>
            {scoring?.electricity_interest_score ?? "-"}/10
          </span>
        </div>

        <div className={styles.scoreRow}>
          <span className={styles.scoreRowLabel}>エンゲージメント</span>
          <div className={styles.scoreBarContainer}>
            <div
              className={`${styles.scoreBarFill} ${styles.scoreBarFillEngagement}`}
              style={{ width: `${((scoring?.engagement_score ?? 0) / 10) * 100}%` }}
            />
          </div>
          <span className={styles.scoreRowValue}>
            {scoring?.engagement_score ?? "-"}/10
          </span>
        </div>

        <div className={styles.scoreRow}>
          <span className={styles.scoreRowLabel}>クラファン適合度</span>
          <div className={styles.scoreBarContainer}>
            <div
              className={`${styles.scoreBarFill} ${styles.scoreBarFillCrowdfunding}`}
              style={{ width: `${((scoring?.crowdfunding_fit_score ?? 0) / 10) * 100}%` }}
            />
          </div>
          <span className={styles.scoreRowValue}>
            {scoring?.crowdfunding_fit_score ?? "-"}/10
          </span>
        </div>
      </div>
    </div>
  );
}

function MetricsGrid({ analysis }: { analysis: AnalysisData }) {
  const basic = analysis.basic_attributes;
  const electricity = analysis.electricity_cost;
  const device = analysis.device_info;
  const crowdfunding = analysis.crowdfunding_experience;

  return (
    <div className={styles.metricsGrid}>
      <div className={styles.metricCard}>
        <div className={styles.metricIcon}>👤</div>
        <p className={styles.metricLabel}>年齢</p>
        <p className={styles.metricValue}>
          {basic?.age ?? "-"}
          <span className={styles.metricUnit}>歳</span>
        </p>
      </div>

      <div className={styles.metricCard}>
        <div className={styles.metricIcon}>⚡</div>
        <p className={styles.metricLabel}>月額電気代</p>
        <p className={styles.metricValue}>
          ¥{electricity?.recent_monthly_cost?.toLocaleString() ?? "-"}
        </p>
      </div>

      <div className={styles.metricCard}>
        <div className={styles.metricIcon}>📱</div>
        <p className={styles.metricLabel}>接続デバイス数</p>
        <p className={styles.metricValue}>
          {device?.connected_devices_count ?? "-"}
          <span className={styles.metricUnit}>台</span>
        </p>
      </div>

      <div className={styles.metricCard}>
        <div className={styles.metricIcon}>🎯</div>
        <p className={styles.metricLabel}>クラファン支援回数</p>
        <p className={styles.metricValue}>
          {crowdfunding?.crowdfunding_count ?? "-"}
          <span className={styles.metricUnit}>回</span>
        </p>
      </div>
    </div>
  );
}

function DetailsSection({ analysis }: { analysis: AnalysisData }) {
  const basic = analysis.basic_attributes;
  const electricity = analysis.electricity_cost;
  const device = analysis.device_info;

  return (
    <div className={styles.detailsGrid}>
      <div className={styles.detailsCard}>
        <h3 className={styles.detailsCardTitle}>基本属性</h3>
        <div className={styles.detailsList}>
          <div className={styles.detailsItem}>
            <span className={styles.detailsItemLabel}>年齢</span>
            <span className={styles.detailsItemValue}>{basic?.age ?? "-"}歳</span>
          </div>
          <div className={styles.detailsItem}>
            <span className={styles.detailsItemLabel}>世帯人数</span>
            <span className={styles.detailsItemValue}>{basic?.household_size ?? "-"}人</span>
          </div>
          <div className={styles.detailsItem}>
            <span className={styles.detailsItemLabel}>住居タイプ</span>
            <span className={styles.detailsItemValue}>{basic?.residence_type ?? "-"}</span>
          </div>
          <div className={styles.detailsItem}>
            <span className={styles.detailsItemLabel}>エリア</span>
            <span className={styles.detailsItemValue}>{basic?.area ?? "-"}</span>
          </div>
          <div className={styles.detailsItem}>
            <span className={styles.detailsItemLabel}>間取り</span>
            <span className={styles.detailsItemValue}>{basic?.layout ?? "-"}</span>
          </div>
          <div className={styles.detailsItem}>
            <span className={styles.detailsItemLabel}>職業</span>
            <span className={styles.detailsItemValue}>{basic?.occupation_type ?? "-"}</span>
          </div>
        </div>
      </div>

      <div className={styles.detailsCard}>
        <h3 className={styles.detailsCardTitle}>電気代情報</h3>
        <div className={styles.detailsList}>
          <div className={styles.detailsItem}>
            <span className={styles.detailsItemLabel}>直近月額</span>
            <span className={styles.detailsItemValue}>
              ¥{electricity?.recent_monthly_cost?.toLocaleString() ?? "-"}
            </span>
          </div>
          <div className={styles.detailsItem}>
            <span className={styles.detailsItemLabel}>夏ピーク</span>
            <span className={styles.detailsItemValue}>
              ¥{electricity?.summer_peak_cost?.toLocaleString() ?? "-"}
            </span>
          </div>
          <div className={styles.detailsItem}>
            <span className={styles.detailsItemLabel}>冬ピーク</span>
            <span className={styles.detailsItemValue}>
              ¥{electricity?.winter_peak_cost?.toLocaleString() ?? "-"}
            </span>
          </div>
          <div className={styles.detailsItem}>
            <span className={styles.detailsItemLabel}>明細確認頻度</span>
            <span className={styles.detailsItemValue}>{electricity?.bill_check_frequency ?? "-"}</span>
          </div>
        </div>
      </div>

      <div className={styles.detailsCard}>
        <h3 className={styles.detailsCardTitle}>デバイス情報</h3>
        <div className={styles.detailsList}>
          <div className={styles.detailsItem}>
            <span className={styles.detailsItemLabel}>接続デバイス数</span>
            <span className={styles.detailsItemValue}>{device?.connected_devices_count ?? "-"}台</span>
          </div>
          <div className={styles.detailsItem}>
            <span className={styles.detailsItemLabel}>オートメーション数</span>
            <span className={styles.detailsItemValue}>{device?.automation_count ?? "-"}個</span>
          </div>
          <div className={styles.detailsItem}>
            <span className={styles.detailsItemLabel}>アプリ利用頻度</span>
            <span className={styles.detailsItemValue}>{device?.app_usage_frequency ?? "-"}</span>
          </div>
          <div className={styles.detailsItem}>
            <span className={styles.detailsItemLabel}>購入チャネル</span>
            <span className={styles.detailsItemValue}>{device?.purchase_channel ?? "-"}</span>
          </div>
          <div className={styles.detailsItem}>
            <span className={styles.detailsItemLabel}>故障時の対応</span>
            <span className={styles.detailsItemValue}>{device?.replacement_intention ?? "-"}</span>
          </div>
        </div>
        {device?.devices_used && device.devices_used.length > 0 && (
          <div className={styles.tagsList}>
            {device.devices_used.slice(0, 6).map((d, i) => (
              <span key={i} className={styles.tag}>{d}</span>
            ))}
          </div>
        )}
      </div>

      <div className={styles.detailsCard}>
        <h3 className={styles.detailsCardTitle}>クラファン経験</h3>
        <div className={styles.detailsList}>
          <div className={styles.detailsItem}>
            <span className={styles.detailsItemLabel}>支援経験</span>
            <span className={styles.detailsItemValue}>
              {analysis.crowdfunding_experience?.has_crowdfunding_experience ? "あり" : "なし"}
            </span>
          </div>
          <div className={styles.detailsItem}>
            <span className={styles.detailsItemLabel}>支援回数</span>
            <span className={styles.detailsItemValue}>
              {analysis.crowdfunding_experience?.crowdfunding_count ?? "-"}回
            </span>
          </div>
          <div className={styles.detailsItem}>
            <span className={styles.detailsItemLabel}>平均支援額</span>
            <span className={styles.detailsItemValue}>
              ¥{analysis.crowdfunding_experience?.average_support_amount?.toLocaleString() ?? "-"}
            </span>
          </div>
        </div>
        {analysis.crowdfunding_experience?.supported_categories &&
          analysis.crowdfunding_experience.supported_categories.length > 0 && (
            <div className={styles.tagsList}>
              {analysis.crowdfunding_experience.supported_categories.map((c, i) => (
                <span key={i} className={styles.tag}>{c}</span>
              ))}
            </div>
          )}
      </div>
    </div>
  );
}

function InsightsSection({ analysis }: { analysis: AnalysisData }) {
  const insights = analysis.insights;

  return (
    <div className={styles.insightsSection}>
      <div className={styles.insightsCard}>
        <h3 className={styles.sectionTitle}>インサイト</h3>

        {insights?.most_impressive_quote && (
          <div className={styles.insightQuote}>
            &ldquo;{insights.most_impressive_quote}&rdquo;
          </div>
        )}

        {insights?.unexpected_findings && (
          <div style={{ marginBottom: 20 }}>
            <p className={styles.insightLabel}>予想外の発見</p>
            <p className={styles.insightText}>{insights.unexpected_findings}</p>
          </div>
        )}

        {insights?.non_negotiable_value && (
          <div style={{ marginBottom: 20 }}>
            <p className={styles.insightLabel}>譲れない価値</p>
            <p className={styles.insightText}>{insights.non_negotiable_value}</p>
          </div>
        )}

        {insights?.suggestion_for_500_supporters && (
          <div style={{ marginBottom: 20 }}>
            <p className={styles.insightLabel}>500人獲得への提案</p>
            <p className={styles.insightText}>{insights.suggestion_for_500_supporters}</p>
          </div>
        )}

        <div className={styles.signalsGrid}>
          <div className={`${styles.signalColumn} ${styles.signalColumnPositive}`}>
            <h4 className={`${styles.signalTitle} ${styles.signalTitlePositive}`}>
              ポジティブシグナル
            </h4>
            <ul className={styles.signalList}>
              {insights?.good_signals?.map((signal, i) => (
                <li key={i} className={styles.signalItem}>{signal}</li>
              ))}
            </ul>
          </div>

          <div className={`${styles.signalColumn} ${styles.signalColumnNegative}`}>
            <h4 className={`${styles.signalTitle} ${styles.signalTitleNegative}`}>
              ネガティブシグナル
            </h4>
            <ul className={styles.signalList}>
              {insights?.bad_signals?.map((signal, i) => (
                <li key={i} className={styles.signalItem}>{signal}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

function ActionItemsSection({ actionItems }: { actionItems: string[] }) {
  if (!actionItems || actionItems.length === 0) return null;

  return (
    <div className={styles.actionItems}>
      <h3 className={styles.sectionTitle}>アクション項目</h3>
      <ul className={styles.actionList}>
        {actionItems.map((item, i) => (
          <li key={i} className={styles.actionItem}>
            <span className={styles.actionIcon}>→</span>
            <p className={styles.actionText}>{item}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function InterviewContent({ interview, analysis }: { interview: Interview; analysis: AnalysisData | null }) {
  return (
    <div className={styles.content}>
      {/* Score Hero */}
      {analysis && <ScoreHero analysis={analysis} />}

      {/* Metrics Grid */}
      {analysis && <MetricsGrid analysis={analysis} />}

      {/* Summary */}
      {analysis?.summary && (
        <div className={styles.summarySection}>
          <h3 className={styles.sectionTitle}>要約</h3>
          <p className={styles.summaryText}>{analysis.summary}</p>
        </div>
      )}

      {/* Details */}
      {analysis && <DetailsSection analysis={analysis} />}

      {/* Insights */}
      {analysis?.insights && <InsightsSection analysis={analysis} />}

      {/* Action Items */}
      {analysis?.action_items && <ActionItemsSection actionItems={analysis.action_items} />}

      {/* Video */}
      {interview.video_key && (
        <div className={styles.mediaSection}>
          <h2 className={styles.sectionTitle}>
            動画{interview.file_name && ` - ${interview.file_name}`}
          </h2>
          <VideoPlayer videoKey={interview.video_key} />
        </div>
      )}

      {/* Transcript */}
      {interview.transcript_key && (
        <div className={styles.mediaSection}>
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
      if (data?.analysis_key && data.status === "completed") {
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
        <h1 className={styles.title}>
          {interview?.file_name || "Interview Analysis"}
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
        <InterviewContent interview={interview} analysis={analysis} />
      )}
    </div>
  );
}
