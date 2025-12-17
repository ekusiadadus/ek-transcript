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

// セグメント定義
const SEGMENT_DEFINITIONS: Record<string, { label: string; description: string }> = {
  A: { label: "省エネ意識高", description: "電気代関心度7点以上 + 電力切替経験あり" },
  B: { label: "ガジェット好き", description: "クラファン経験あり + 連携家電5台以上" },
  C: { label: "便利さ追求", description: "エンゲージメント7点以上 + 電気代関心度4点以下" },
  D: { label: "ライト層", description: "アプリ月数回以下 + オートメーション1つ以下" },
};

// 判定基準に基づくラベル取得
function getScoreJudgment(score: number): { label: string; className: string; action: string } {
  if (score >= 25) return {
    label: "最優先ターゲット",
    className: styles.judgmentPriority ?? "",
    action: "Early Adopter候補。追加インタビュー・βテスト打診"
  };
  if (score >= 18) return {
    label: "有望ターゲット",
    className: styles.judgmentPromising ?? "",
    action: "訴求ポイントを調整すれば獲得可能"
  };
  if (score >= 12) return {
    label: "要検討",
    className: styles.judgmentReview ?? "",
    action: "ターゲット条件の見直し要"
  };
  return {
    label: "ターゲット外",
    className: styles.judgmentOutside ?? "",
    action: "スクリーニング条件の調整を検討"
  };
}

function ScoreHero({ analysis }: { analysis: AnalysisData }) {
  const scoring = analysis.scoring;
  const segment = scoring?.segment;
  const totalScore = scoring?.total_score ?? 0;
  const judgment = getScoreJudgment(totalScore);
  const segmentDef = segment ? SEGMENT_DEFINITIONS[segment] : null;
  const segmentClass = segment === "A"
    ? styles.segmentA
    : segment === "B"
      ? styles.segmentB
      : segment === "C"
        ? styles.segmentC
        : styles.segmentD;

  return (
    <div className={styles.scoreHero}>
      <div className={styles.totalScoreCard}>
        <p className={styles.totalScoreLabel}>総合スコア</p>
        <p className={styles.totalScoreValue}>
          {scoring?.total_score ?? "-"}
          <span className={styles.totalScoreMax}>/30</span>
        </p>
        <div className={`${styles.judgmentBadgeLarge} ${judgment.className}`}>
          {judgment.label}
        </div>
        <p className={styles.judgmentAction}>{judgment.action}</p>
        {segment && (
          <div className={styles.segmentInfo}>
            <span className={`${styles.segmentBadgeLarge} ${segmentClass}`}>
              セグメント {segment}
            </span>
            {segmentDef && (
              <div className={styles.segmentDef}>
                <span className={styles.segmentDefLabel}>{segmentDef.label}</span>
                <span className={styles.segmentDefDesc}>{segmentDef.description}</span>
              </div>
            )}
          </div>
        )}
        {scoring?.segment_reason && (
          <p className={styles.segmentReason}>{scoring.segment_reason}</p>
        )}
      </div>

      <div className={styles.scoreBreakdown}>
        <h3 className={styles.scoreBreakdownTitle}>スコア内訳（30点満点）</h3>

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
        {scoring?.electricity_interest_details && (
          <p className={styles.scoreDetails}>{scoring.electricity_interest_details}</p>
        )}

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
        {scoring?.engagement_details && (
          <p className={styles.scoreDetails}>{scoring.engagement_details}</p>
        )}

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
        {scoring?.crowdfunding_fit_details && (
          <p className={styles.scoreDetails}>{scoring.crowdfunding_fit_details}</p>
        )}
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

// 電気代関心度スコア詳細
function ElectricityScoreDetails({ analysis }: { analysis: AnalysisData }) {
  const electricity = analysis.electricity_cost;
  const scoring = analysis.scoring;

  // スコア算出根拠をチェック
  const hasMonthlyKnowledge = electricity?.recent_monthly_cost !== null;
  const hasPastActions = electricity?.past_year_actions && electricity.past_year_actions.length >= 2;
  const hasSwitch = electricity?.has_switched_company;
  const checksMonthly = electricity?.bill_check_frequency === "毎月";

  return (
    <div className={styles.scoreDetailCard}>
      <h3 className={styles.scoreDetailTitle}>
        電気代関心度スコア詳細
        <span className={styles.scoreDetailValue}>{scoring?.electricity_interest_score ?? "-"}/10点</span>
      </h3>
      <div className={styles.scoreChecklist}>
        <div className={`${styles.checkItem} ${hasMonthlyKnowledge ? styles.checkItemPass : styles.checkItemFail}`}>
          <span className={styles.checkIcon}>{hasMonthlyKnowledge ? "✓" : "✗"}</span>
          <span className={styles.checkLabel}>直近電気代を±1,000円以内で回答できた</span>
          <span className={styles.checkPoints}>+2点</span>
        </div>
        <div className={`${styles.checkItem} ${hasPastActions ? styles.checkItemPass : styles.checkItemFail}`}>
          <span className={styles.checkIcon}>{hasPastActions ? "✓" : "✗"}</span>
          <span className={styles.checkLabel}>過去1年で2つ以上の削減行動をした</span>
          <span className={styles.checkPoints}>+3点</span>
        </div>
        <div className={`${styles.checkItem} ${hasSwitch ? styles.checkItemPass : styles.checkItemFail}`}>
          <span className={styles.checkIcon}>{hasSwitch ? "✓" : "✗"}</span>
          <span className={styles.checkLabel}>電力会社を切り替えた</span>
          <span className={styles.checkPoints}>+3点</span>
        </div>
        <div className={`${styles.checkItem} ${checksMonthly ? styles.checkItemPass : styles.checkItemFail}`}>
          <span className={styles.checkIcon}>{checksMonthly ? "✓" : "✗"}</span>
          <span className={styles.checkLabel}>明細を毎月確認している</span>
          <span className={styles.checkPoints}>+2点</span>
        </div>
      </div>
      {electricity?.past_year_actions && electricity.past_year_actions.length > 0 && (
        <div className={styles.pastActions}>
          <p className={styles.pastActionsLabel}>過去1年の電気代削減行動:</p>
          <div className={styles.tagsList}>
            {electricity.past_year_actions.map((action, i) => (
              <span key={i} className={styles.tagAction}>{action}</span>
            ))}
          </div>
        </div>
      )}
      {electricity?.pain_score !== null && electricity?.pain_score !== undefined && (
        <div className={styles.painScore}>
          <span className={styles.painScoreLabel}>電気代の痛みスコア:</span>
          <span className={styles.painScoreValue}>{electricity.pain_score}/10</span>
        </div>
      )}
    </div>
  );
}

// エンゲージメントスコア詳細
function EngagementScoreDetails({ analysis }: { analysis: AnalysisData }) {
  const device = analysis.device_info;
  const scoring = analysis.scoring;

  const appWeekly = device?.app_usage_frequency === "毎日" ||
    device?.app_usage_frequency?.includes("週");
  const hasAutomations = (device?.automation_count ?? 0) >= 3;
  const hasDevices = (device?.connected_devices_count ?? 0) >= 5;
  const immediateRebuy = device?.replacement_intention?.includes("即") ||
    device?.replacement_intention?.includes("すぐ");

  return (
    <div className={styles.scoreDetailCard}>
      <h3 className={styles.scoreDetailTitle}>
        エンゲージメントスコア詳細
        <span className={styles.scoreDetailValue}>{scoring?.engagement_score ?? "-"}/10点</span>
      </h3>
      <div className={styles.scoreChecklist}>
        <div className={`${styles.checkItem} ${appWeekly ? styles.checkItemPass : styles.checkItemFail}`}>
          <span className={styles.checkIcon}>{appWeekly ? "✓" : "✗"}</span>
          <span className={styles.checkLabel}>アプリを週3回以上開く</span>
          <span className={styles.checkPoints}>+3点</span>
        </div>
        <div className={`${styles.checkItem} ${hasAutomations ? styles.checkItemPass : styles.checkItemFail}`}>
          <span className={styles.checkIcon}>{hasAutomations ? "✓" : "✗"}</span>
          <span className={styles.checkLabel}>オートメーションを3つ以上設定している</span>
          <span className={styles.checkPoints}>+2点</span>
        </div>
        <div className={`${styles.checkItem} ${hasDevices ? styles.checkItemPass : styles.checkItemFail}`}>
          <span className={styles.checkIcon}>{hasDevices ? "✓" : "✗"}</span>
          <span className={styles.checkLabel}>連携家電が5台以上</span>
          <span className={styles.checkPoints}>+2点</span>
        </div>
        <div className={`${styles.checkItem} ${immediateRebuy ? styles.checkItemPass : styles.checkItemFail}`}>
          <span className={styles.checkIcon}>{immediateRebuy ? "✓" : "✗"}</span>
          <span className={styles.checkLabel}>故障したら即買い直す</span>
          <span className={styles.checkPoints}>+3点</span>
        </div>
      </div>
      <div className={styles.deviceMetrics}>
        <div className={styles.deviceMetric}>
          <span className={styles.deviceMetricLabel}>アプリ利用頻度</span>
          <span className={styles.deviceMetricValue}>{device?.app_usage_frequency ?? "-"}</span>
        </div>
        <div className={styles.deviceMetric}>
          <span className={styles.deviceMetricLabel}>オートメーション数</span>
          <span className={styles.deviceMetricValue}>{device?.automation_count ?? "-"}個</span>
        </div>
        <div className={styles.deviceMetric}>
          <span className={styles.deviceMetricLabel}>連携家電数</span>
          <span className={styles.deviceMetricValue}>{device?.connected_devices_count ?? "-"}台</span>
        </div>
        <div className={styles.deviceMetric}>
          <span className={styles.deviceMetricLabel}>故障時対応</span>
          <span className={styles.deviceMetricValue}>{device?.replacement_intention ?? "-"}</span>
        </div>
      </div>
      {device?.most_used_feature && (
        <p className={styles.mostUsedFeature}>最頻使用機能: {device.most_used_feature}</p>
      )}
    </div>
  );
}

// クラファン適合度スコア詳細
function CrowdfundingScoreDetails({ analysis }: { analysis: AnalysisData }) {
  const cf = analysis.crowdfunding_experience;
  const scoring = analysis.scoring;

  const hasExperience = cf?.has_crowdfunding_experience;
  const hasMultiple = (cf?.crowdfunding_count ?? 0) >= 3;
  const hasHighAmount = (cf?.average_support_amount ?? 0) >= 10000;
  const hasGadget = cf?.supported_categories?.some(c =>
    c.includes("ガジェット") || c.includes("テクノロジー") || c.includes("家電")
  );

  return (
    <div className={styles.scoreDetailCard}>
      <h3 className={styles.scoreDetailTitle}>
        クラファン適合度スコア詳細
        <span className={styles.scoreDetailValue}>{scoring?.crowdfunding_fit_score ?? "-"}/10点</span>
      </h3>
      <div className={styles.scoreChecklist}>
        <div className={`${styles.checkItem} ${hasExperience ? styles.checkItemPass : styles.checkItemFail}`}>
          <span className={styles.checkIcon}>{hasExperience ? "✓" : "✗"}</span>
          <span className={styles.checkLabel}>クラファン支援経験あり</span>
          <span className={styles.checkPoints}>+3点</span>
        </div>
        <div className={`${styles.checkItem} ${hasMultiple ? styles.checkItemPass : styles.checkItemFail}`}>
          <span className={styles.checkIcon}>{hasMultiple ? "✓" : "✗"}</span>
          <span className={styles.checkLabel}>3回以上支援している</span>
          <span className={styles.checkPoints}>+2点</span>
        </div>
        <div className={`${styles.checkItem} ${hasHighAmount ? styles.checkItemPass : styles.checkItemFail}`}>
          <span className={styles.checkIcon}>{hasHighAmount ? "✓" : "✗"}</span>
          <span className={styles.checkLabel}>1万円以上の支援経験あり</span>
          <span className={styles.checkPoints}>+2点</span>
        </div>
        <div className={`${styles.checkItem} ${hasGadget ? styles.checkItemPass : styles.checkItemFail}`}>
          <span className={styles.checkIcon}>{hasGadget ? "✓" : "✗"}</span>
          <span className={styles.checkLabel}>ガジェット系を支援したことがある</span>
          <span className={styles.checkPoints}>+3点</span>
        </div>
      </div>
      <div className={styles.cfMetrics}>
        <div className={styles.cfMetric}>
          <span className={styles.cfMetricLabel}>支援回数</span>
          <span className={styles.cfMetricValue}>{cf?.crowdfunding_count ?? "-"}回</span>
        </div>
        <div className={styles.cfMetric}>
          <span className={styles.cfMetricLabel}>平均支援額</span>
          <span className={styles.cfMetricValue}>¥{cf?.average_support_amount?.toLocaleString() ?? "-"}</span>
        </div>
        <div className={styles.cfMetric}>
          <span className={styles.cfMetricLabel}>月額サブスク総額</span>
          <span className={styles.cfMetricValue}>¥{cf?.monthly_subscription_total?.toLocaleString() ?? "-"}</span>
        </div>
      </div>
      {cf?.supported_categories && cf.supported_categories.length > 0 && (
        <div className={styles.supportedCategories}>
          <p className={styles.supportedCategoriesLabel}>支援カテゴリ:</p>
          <div className={styles.tagsList}>
            {cf.supported_categories.map((cat, i) => (
              <span key={i} className={styles.tag}>{cat}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// 価格感覚マッピング
function PriceSensitivitySection({ analysis }: { analysis: AnalysisData }) {
  const price = analysis.price_sensitivity;
  const device = analysis.device_info;

  return (
    <div className={styles.priceSection}>
      <h3 className={styles.sectionTitle}>価格感覚マッピング</h3>
      <div className={styles.priceGrid}>
        <div className={styles.priceCard}>
          <span className={styles.priceLabel}>「安い」と感じる価格帯</span>
          <span className={styles.priceValue}>{price?.cheap_price_range ?? "-"}</span>
        </div>
        <div className={styles.priceCard}>
          <span className={styles.priceLabel}>「妥当」と感じる価格帯</span>
          <span className={styles.priceValue}>{price?.fair_price_range ?? "-"}</span>
        </div>
        <div className={styles.priceCard}>
          <span className={styles.priceLabel}>「高い」と感じる価格帯</span>
          <span className={styles.priceValue}>{price?.expensive_price_range ?? "-"}</span>
        </div>
        <div className={styles.priceCard}>
          <span className={styles.priceLabel}>購入上限価格</span>
          <span className={styles.priceValue}>
            {price?.max_purchase_price ? `¥${price.max_purchase_price.toLocaleString()}` : "-"}
          </span>
        </div>
      </div>
      {device && (
        <div className={styles.purchaseInfo}>
          <div className={styles.purchaseItem}>
            <span className={styles.purchaseLabel}>実購入金額</span>
            <span className={styles.purchaseValue}>
              {device.purchase_amount ? `¥${device.purchase_amount.toLocaleString()}` : "-"}
            </span>
          </div>
          <div className={styles.purchaseItem}>
            <span className={styles.purchaseLabel}>購入チャネル</span>
            <span className={styles.purchaseValue}>{device.purchase_channel ?? "-"}</span>
          </div>
          <div className={styles.purchaseItem}>
            <span className={styles.purchaseLabel}>購入時期</span>
            <span className={styles.purchaseValue}>{device.purchase_date ?? "-"}</span>
          </div>
          <div className={styles.purchaseItem}>
            <span className={styles.purchaseLabel}>初期設定時間</span>
            <span className={styles.purchaseValue}>
              {device.initial_setup_time_minutes ? `${device.initial_setup_time_minutes}分` : "-"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// 家族利用と導入障壁
function FamilyAndBarriersSection({ analysis }: { analysis: AnalysisData }) {
  const family = analysis.family_and_barriers;

  return (
    <div className={styles.familySection}>
      <h3 className={styles.sectionTitle}>家族利用と導入障壁</h3>
      <div className={styles.familyGrid}>
        <div className={styles.familyCard}>
          <h4 className={styles.familyCardTitle}>家族利用状況</h4>
          <div className={styles.familyMetrics}>
            <div className={styles.familyMetric}>
              <span className={styles.familyMetricLabel}>家族利用</span>
              <span className={styles.familyMetricValue}>
                {family?.family_usage ? "あり" : family?.family_usage === false ? "なし" : "-"}
              </span>
            </div>
            <div className={styles.familyMetric}>
              <span className={styles.familyMetricLabel}>利用頻度</span>
              <span className={styles.familyMetricValue}>{family?.family_usage_frequency ?? "-"}</span>
            </div>
            <div className={styles.familyMetric}>
              <span className={styles.familyMetricLabel}>最頻使用機能</span>
              <span className={styles.familyMetricValue}>{family?.family_most_used_feature ?? "-"}</span>
            </div>
          </div>
          {family?.non_usage_reason && (
            <p className={styles.nonUsageReason}>非利用理由: {family.non_usage_reason}</p>
          )}
        </div>

        <div className={styles.familyCard}>
          <h4 className={styles.familyCardTitle}>推奨・NPS</h4>
          <div className={styles.npsSection}>
            <div className={styles.npsScore}>
              <span className={styles.npsLabel}>NPS</span>
              <span className={styles.npsValue}>{family?.nps_score ?? "-"}/10</span>
            </div>
            <div className={styles.recommendInfo}>
              <span className={styles.recommendLabel}>推奨経験</span>
              <span className={styles.recommendValue}>
                {family?.has_recommended ? "あり" : family?.has_recommended === false ? "なし" : "-"}
              </span>
            </div>
          </div>
          {family?.recommendation_phrase && (
            <div className={styles.recommendPhrase}>
              <p className={styles.recommendPhraseLabel}>推奨時のフレーズ:</p>
              <p className={styles.recommendPhraseText}>&ldquo;{family.recommendation_phrase}&rdquo;</p>
            </div>
          )}
        </div>

        <div className={styles.familyCard}>
          <h4 className={styles.familyCardTitle}>賃貸での障壁</h4>
          {family?.rental_barriers && family.rental_barriers.length > 0 ? (
            <div className={styles.tagsList}>
              {family.rental_barriers.map((barrier, i) => (
                <span key={i} className={styles.tagBarrier}>{barrier}</span>
              ))}
            </div>
          ) : (
            <p className={styles.noBarriers}>特になし</p>
          )}
          {family?.abandoned_ideas && (
            <div className={styles.abandonedIdeas}>
              <p className={styles.abandonedIdeasLabel}>賃貸で諦めたアイデア:</p>
              <p className={styles.abandonedIdeasText}>{family.abandoned_ideas}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Good/Bad Signal 詳細分析
function SignalAnalysisSection({ analysis }: { analysis: AnalysisData }) {
  const electricity = analysis.electricity_cost;
  const device = analysis.device_info;
  const cf = analysis.crowdfunding_experience;
  const insights = analysis.insights;

  // Good Signals チェック
  const goodSignalChecks = [
    {
      label: "電気代削減のために過去に実際にお金/時間を使った",
      pass: electricity?.past_year_actions && electricity.past_year_actions.length > 0
    },
    {
      label: "スマートホームアプリを週1回以上開いている",
      pass: device?.app_usage_frequency === "毎日" || device?.app_usage_frequency?.includes("週")
    },
    {
      label: "クラウドファンディングで実際に支援した経験がある",
      pass: cf?.has_crowdfunding_experience
    },
    {
      label: "壊れたら即買い直すと即答",
      pass: device?.replacement_intention?.includes("即") || device?.replacement_intention?.includes("すぐ")
    },
  ];

  // Bad Signals チェック
  const badSignalChecks = [
    {
      label: "「興味はある」と言うが、過去に何も行動していない",
      pass: !electricity?.past_year_actions || electricity.past_year_actions.length === 0
    },
    {
      label: "電気代の明細を6ヶ月以上見ていない",
      pass: electricity?.bill_check_frequency === "ほぼ見ない"
    },
    {
      label: "買ったデバイスをほとんど使っていない",
      pass: device?.app_usage_frequency === "ほぼ開かない" || device?.app_usage_frequency?.includes("月数回")
    },
    {
      label: "「検討する」「なくても困らない」と回答",
      pass: device?.replacement_intention?.includes("検討") || device?.replacement_intention?.includes("困らない")
    },
  ];

  const goodCount = goodSignalChecks.filter(s => s.pass).length;
  const badCount = badSignalChecks.filter(s => s.pass).length;

  return (
    <div className={styles.signalAnalysisSection}>
      <h3 className={styles.sectionTitle}>Good/Bad Signal 詳細分析</h3>
      <div className={styles.signalSummary}>
        <span className={styles.signalSummaryGood}>Good: {goodCount}/4</span>
        <span className={styles.signalSummaryBad}>Bad: {badCount}/4</span>
      </div>
      <div className={styles.signalAnalysisGrid}>
        <div className={styles.signalAnalysisCard}>
          <h4 className={styles.signalAnalysisTitleGood}>Good Signals（有望）</h4>
          <div className={styles.signalChecklist}>
            {goodSignalChecks.map((signal, i) => (
              <div key={i} className={`${styles.signalCheckItem} ${signal.pass ? styles.signalCheckPass : styles.signalCheckFail}`}>
                <span className={styles.signalCheckIcon}>{signal.pass ? "✓" : "-"}</span>
                <span className={styles.signalCheckLabel}>{signal.label}</span>
              </div>
            ))}
          </div>
          {insights?.good_signals && insights.good_signals.length > 0 && (
            <div className={styles.additionalSignals}>
              <p className={styles.additionalSignalsLabel}>インタビューからの追加Good Signal:</p>
              <ul className={styles.additionalSignalsList}>
                {insights.good_signals.map((signal, i) => (
                  <li key={i}>{signal}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className={styles.signalAnalysisCard}>
          <h4 className={styles.signalAnalysisTitleBad}>Bad Signals（要注意）</h4>
          <div className={styles.signalChecklist}>
            {badSignalChecks.map((signal, i) => (
              <div key={i} className={`${styles.signalCheckItem} ${signal.pass ? styles.signalCheckWarn : styles.signalCheckOk}`}>
                <span className={styles.signalCheckIcon}>{signal.pass ? "!" : "✓"}</span>
                <span className={styles.signalCheckLabel}>{signal.label}</span>
              </div>
            ))}
          </div>
          {insights?.bad_signals && insights.bad_signals.length > 0 && (
            <div className={styles.additionalSignals}>
              <p className={styles.additionalSignalsLabel}>インタビューからの追加Bad Signal:</p>
              <ul className={styles.additionalSignalsList}>
                {insights.bad_signals.map((signal, i) => (
                  <li key={i}>{signal}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
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
          <div className={styles.detailsItem}>
            <span className={styles.detailsItemLabel}>在宅時間（平日）</span>
            <span className={styles.detailsItemValue}>{basic?.weekday_home_hours ?? "-"}時間</span>
          </div>
          <div className={styles.detailsItem}>
            <span className={styles.detailsItemLabel}>在宅時間（休日）</span>
            <span className={styles.detailsItemValue}>{basic?.weekend_home_hours ?? "-"}時間</span>
          </div>
          <div className={styles.detailsItem}>
            <span className={styles.detailsItemLabel}>居住年数</span>
            <span className={styles.detailsItemValue}>{basic?.residence_years ?? "-"}年</span>
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
            <span className={styles.detailsItemLabel}>電力会社</span>
            <span className={styles.detailsItemValue}>{electricity?.power_company ?? "-"}</span>
          </div>
          <div className={styles.detailsItem}>
            <span className={styles.detailsItemLabel}>電力切替経験</span>
            <span className={styles.detailsItemValue}>
              {electricity?.has_switched_company ? "あり" : electricity?.has_switched_company === false ? "なし" : "-"}
            </span>
          </div>
          <div className={styles.detailsItem}>
            <span className={styles.detailsItemLabel}>切替による節約額</span>
            <span className={styles.detailsItemValue}>
              {electricity?.saving_from_switch ? `¥${electricity.saving_from_switch.toLocaleString()}` : "-"}
            </span>
          </div>
          <div className={styles.detailsItem}>
            <span className={styles.detailsItemLabel}>明細確認頻度</span>
            <span className={styles.detailsItemValue}>{electricity?.bill_check_frequency ?? "-"}</span>
          </div>
          <div className={styles.detailsItem}>
            <span className={styles.detailsItemLabel}>痛みスコア</span>
            <span className={styles.detailsItemValue}>{electricity?.pain_score ?? "-"}/10</span>
          </div>
        </div>
        {electricity?.purchased_items_for_saving && electricity.purchased_items_for_saving.length > 0 && (
          <div className={styles.purchasedItems}>
            <p className={styles.purchasedItemsLabel}>節電のための購入物:</p>
            <div className={styles.tagsList}>
              {electricity.purchased_items_for_saving.map((item, i) => (
                <span key={i} className={styles.tag}>{item}</span>
              ))}
            </div>
          </div>
        )}
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
            <span className={styles.detailsItemLabel}>最頻使用機能</span>
            <span className={styles.detailsItemValue}>{device?.most_used_feature ?? "-"}</span>
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
          <div className={styles.devicesList}>
            <p className={styles.devicesListLabel}>利用デバイス:</p>
            <div className={styles.tagsList}>
              {device.devices_used.map((d, i) => (
                <span key={i} className={styles.tag}>{d}</span>
              ))}
            </div>
          </div>
        )}
        {device?.satisfaction_points && device.satisfaction_points.length > 0 && (
          <div className={styles.satisfactionPoints}>
            <p className={styles.satisfactionPointsLabel}>満足ポイント:</p>
            <div className={styles.tagsList}>
              {device.satisfaction_points.map((point, i) => (
                <span key={i} className={styles.tagPositive}>{point}</span>
              ))}
            </div>
          </div>
        )}
        {device?.dissatisfaction_points && device.dissatisfaction_points.length > 0 && (
          <div className={styles.dissatisfactionPoints}>
            <p className={styles.dissatisfactionPointsLabel}>不満ポイント:</p>
            <div className={styles.tagsList}>
              {device.dissatisfaction_points.map((point, i) => (
                <span key={i} className={styles.tagNegative}>{point}</span>
              ))}
            </div>
          </div>
        )}
        {device?.unused_features && device.unused_features.length > 0 && (
          <div className={styles.unusedFeatures}>
            <p className={styles.unusedFeaturesLabel}>使わなくなった機能:</p>
            <div className={styles.tagsList}>
              {device.unused_features.map((feature, i) => (
                <span key={i} className={styles.tagMuted}>{feature}</span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className={styles.detailsCard}>
        <h3 className={styles.detailsCardTitle}>クラファン・支出経験</h3>
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
          <div className={styles.detailsItem}>
            <span className={styles.detailsItemLabel}>月額サブスク総額</span>
            <span className={styles.detailsItemValue}>
              ¥{analysis.crowdfunding_experience?.monthly_subscription_total?.toLocaleString() ?? "-"}
            </span>
          </div>
          <div className={styles.detailsItem}>
            <span className={styles.detailsItemLabel}>ポイントサイト利用</span>
            <span className={styles.detailsItemValue}>
              {analysis.crowdfunding_experience?.uses_point_sites ?? "-"}
            </span>
          </div>
          <div className={styles.detailsItem}>
            <span className={styles.detailsItemLabel}>広告への抵抗感</span>
            <span className={styles.detailsItemValue}>
              {analysis.crowdfunding_experience?.ad_resistance ?? "-"}
            </span>
          </div>
        </div>
        {analysis.crowdfunding_experience?.supported_categories &&
          analysis.crowdfunding_experience.supported_categories.length > 0 && (
            <div className={styles.supportedCategories}>
              <p className={styles.supportedCategoriesLabel}>支援カテゴリ:</p>
              <div className={styles.tagsList}>
                {analysis.crowdfunding_experience.supported_categories.map((c, i) => (
                  <span key={i} className={styles.tag}>{c}</span>
                ))}
              </div>
            </div>
          )}
        {analysis.crowdfunding_experience?.canceled_subscriptions &&
          analysis.crowdfunding_experience.canceled_subscriptions.length > 0 && (
            <div className={styles.canceledSubs}>
              <p className={styles.canceledSubsLabel}>解約したサブスク:</p>
              <div className={styles.tagsList}>
                {analysis.crowdfunding_experience.canceled_subscriptions.map((sub, i) => (
                  <span key={i} className={styles.tagMuted}>{sub}</span>
                ))}
              </div>
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
        <h3 className={styles.sectionTitle}>重要インサイト抽出</h3>

        {insights?.most_impressive_quote && (
          <div className={styles.insightQuoteSection}>
            <p className={styles.insightQuoteLabel}>最も印象的だった発言（原文ママ）</p>
            <div className={styles.insightQuote}>
              &ldquo;{insights.most_impressive_quote}&rdquo;
            </div>
          </div>
        )}

        <div className={styles.insightsGridDetailed}>
          {insights?.unexpected_findings && (
            <div className={styles.insightDetailCard}>
              <p className={styles.insightLabel}>予想と違った点</p>
              <p className={styles.insightText}>{insights.unexpected_findings}</p>
            </div>
          )}

          {insights?.non_negotiable_value && (
            <div className={styles.insightDetailCard}>
              <p className={styles.insightLabel}>この人が絶対に譲れない価値</p>
              <p className={styles.insightText}>{insights.non_negotiable_value}</p>
            </div>
          )}

          {insights?.reason_not_to_pay && (
            <div className={styles.insightDetailCard}>
              <p className={styles.insightLabel}>この人が絶対に払わない理由</p>
              <p className={styles.insightText}>{insights.reason_not_to_pay}</p>
            </div>
          )}

          {insights?.suggestion_for_500_supporters && (
            <div className={styles.insightDetailCardHighlight}>
              <p className={styles.insightLabel}>500人の支援者獲得に向けた示唆</p>
              <p className={styles.insightText}>{insights.suggestion_for_500_supporters}</p>
            </div>
          )}
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
      {/* Video - Displayed at the top */}
      {interview.video_key && (
        <div className={styles.mediaSection}>
          <h2 className={styles.sectionTitle}>
            動画{interview.file_name && ` - ${interview.file_name}`}
          </h2>
          <VideoPlayer videoKey={interview.video_key} />
        </div>
      )}

      {/* Score Hero with Judgment */}
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

      {/* 3 Score Details */}
      {analysis && (
        <div className={styles.scoreDetailsSection}>
          <h2 className={styles.sectionTitleLarge}>スコア詳細分析</h2>
          <div className={styles.scoreDetailsGrid}>
            <ElectricityScoreDetails analysis={analysis} />
            <EngagementScoreDetails analysis={analysis} />
            <CrowdfundingScoreDetails analysis={analysis} />
          </div>
        </div>
      )}

      {/* Good/Bad Signal Analysis */}
      {analysis && <SignalAnalysisSection analysis={analysis} />}

      {/* Price Sensitivity */}
      {analysis?.price_sensitivity && <PriceSensitivitySection analysis={analysis} />}

      {/* Family Usage & Barriers */}
      {analysis?.family_and_barriers && <FamilyAndBarriersSection analysis={analysis} />}

      {/* Basic Details */}
      {analysis && <DetailsSection analysis={analysis} />}

      {/* Insights */}
      {analysis?.insights && <InsightsSection analysis={analysis} />}

      {/* Action Items */}
      {analysis?.action_items && <ActionItemsSection actionItems={analysis.action_items} />}

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
