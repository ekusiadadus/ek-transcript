/**
 * Analysis Computation Functions (v2)
 *
 * TypeScript functions to compute scoring conditions, scores, judgment labels,
 * and segments from analysis data. These mirror the backend Python functions.
 */

import type {
  AnalysisData,
  AnalysisSignalDetails,
  ComputedScores,
  DerivedAnalysisFields,
  JudgmentLabel,
  Segment,
  ScoringConditions,
} from "./graphql/types";

/**
 * Compute scoring condition achievements from analysis data.
 */
export function computeScoringConditions(data: AnalysisData): ScoringConditions {
  const ec = data.electricity_cost;
  const di = data.device_info;
  const cf = data.crowdfunding_experience;

  // Electricity Interest Conditions
  const canRecallRecentBill = ec.recent_monthly_cost !== null;
  const hasTwoOrMoreActions = (ec.past_year_actions?.length ?? 0) >= 2;
  const hasSwitchedCompany = ec.has_switched_company === true;

  const billFreq = ec.bill_check_frequency;
  const checksBillMonthly = billFreq === "monthly" || billFreq === "毎月";

  // Engagement Conditions
  const appFreq = di.app_usage_frequency;
  const usesAppWeekly3x =
    appFreq === "daily" ||
    appFreq === "weekly_few" ||
    appFreq === "毎日" ||
    appFreq === "週数回";

  const has3OrMoreAutomations = (di.automation_count ?? 0) >= 3;
  const has5OrMoreDevices = (di.connected_devices_count ?? 0) >= 5;

  const replacement = di.replacement_intention;
  const wouldReplaceImmediately =
    replacement === "immediate" || replacement === "即買い直す";

  // Crowdfunding Conditions
  const hasCrowdfundingExp = cf.has_crowdfunding_experience === true;
  const crowdfunding3OrMore = (cf.crowdfunding_count ?? 0) >= 3;
  const crowdfunding10kPlus = (cf.average_support_amount ?? 0) >= 10000;

  const supportedCategories = cf.supported_categories ?? [];
  const crowdfundingGadget = supportedCategories.some(
    (cat) =>
      cat.includes("ガジェット") ||
      cat.includes("テクノロジー") ||
      cat.toLowerCase().includes("gadget") ||
      cat.toLowerCase().includes("technology")
  );

  return {
    can_recall_recent_bill: canRecallRecentBill,
    has_two_or_more_actions: hasTwoOrMoreActions,
    has_switched_company: hasSwitchedCompany,
    checks_bill_monthly: checksBillMonthly,
    uses_app_weekly_3x: usesAppWeekly3x,
    has_3_or_more_automations: has3OrMoreAutomations,
    has_5_or_more_devices: has5OrMoreDevices,
    would_replace_immediately: wouldReplaceImmediately,
    has_crowdfunding_exp: hasCrowdfundingExp,
    crowdfunding_3_or_more: crowdfunding3OrMore,
    crowdfunding_10k_plus: crowdfunding10kPlus,
    crowdfunding_gadget: crowdfundingGadget,
  };
}

/**
 * Compute scores from condition achievements.
 */
export function computeScoresFromConditions(
  conditions: ScoringConditions
): ComputedScores {
  // Electricity Interest Score (max 10)
  const electricity =
    (conditions.can_recall_recent_bill ? 2 : 0) +
    (conditions.has_two_or_more_actions ? 3 : 0) +
    (conditions.has_switched_company ? 3 : 0) +
    (conditions.checks_bill_monthly ? 2 : 0);

  // Engagement Score (max 10)
  const engagement =
    (conditions.uses_app_weekly_3x ? 3 : 0) +
    (conditions.has_3_or_more_automations ? 2 : 0) +
    (conditions.has_5_or_more_devices ? 2 : 0) +
    (conditions.would_replace_immediately ? 3 : 0);

  // Crowdfunding Fit Score (max 10)
  const crowdfunding =
    (conditions.has_crowdfunding_exp ? 3 : 0) +
    (conditions.crowdfunding_3_or_more ? 2 : 0) +
    (conditions.crowdfunding_10k_plus ? 2 : 0) +
    (conditions.crowdfunding_gadget ? 3 : 0);

  return {
    electricity_interest_score: electricity,
    engagement_score: engagement,
    crowdfunding_fit_score: crowdfunding,
    total_score: electricity + engagement + crowdfunding,
  };
}

/**
 * Compute judgment label from total score.
 */
export function computeJudgmentLabel(totalScore: number): JudgmentLabel {
  if (totalScore >= 25) {
    return "最優先ターゲット";
  } else if (totalScore >= 18) {
    return "有望ターゲット";
  } else if (totalScore >= 12) {
    return "要検討";
  } else {
    return "ターゲット外";
  }
}

/**
 * Compute segment classification from conditions and scores.
 */
export function computeSegment(
  conditions: ScoringConditions,
  scores: ComputedScores
): Segment {
  const electricityScore = scores.electricity_interest_score;
  const engagementScore = scores.engagement_score;

  // Check Segment A: High Energy Awareness
  if (electricityScore >= 7 && conditions.has_switched_company) {
    return "A";
  }

  // Check Segment B: Gadget Lover
  if (conditions.has_crowdfunding_exp && conditions.has_5_or_more_devices) {
    return "B";
  }

  // Check Segment C: Convenience Seeker
  if (engagementScore >= 7 && electricityScore <= 4) {
    return "C";
  }

  // Default to Segment D: Light User
  return "D";
}

/**
 * Count good signals from signal details.
 */
export function computeGoodSignalCount(
  signalDetails: AnalysisSignalDetails | null | undefined
): number {
  if (!signalDetails) return 0;

  let count = 0;
  if (signalDetails.good_took_cost_action) count++;
  if (signalDetails.good_uses_app_weekly) count++;
  if (signalDetails.good_has_crowdfunding_exp) count++;
  if (signalDetails.good_would_replace_immediately) count++;
  count += signalDetails.additional_good_signals?.length ?? 0;

  return count;
}

/**
 * Count bad signals from signal details.
 */
export function computeBadSignalCount(
  signalDetails: AnalysisSignalDetails | null | undefined
): number {
  if (!signalDetails) return 0;

  let count = 0;
  if (signalDetails.bad_no_past_action) count++;
  if (signalDetails.bad_no_bill_check_6months) count++;
  if (signalDetails.bad_device_barely_used) count++;
  if (signalDetails.bad_said_will_consider) count++;
  count += signalDetails.additional_bad_signals?.length ?? 0;

  return count;
}

/**
 * Compute all derived fields from analysis data.
 * This is the main entry point for computing derived values.
 */
export function computeAllDerivedFields(
  data: AnalysisData
): DerivedAnalysisFields {
  const conditions = computeScoringConditions(data);
  const scores = computeScoresFromConditions(conditions);
  const judgmentLabel = computeJudgmentLabel(scores.total_score);
  const segment = computeSegment(conditions, scores);

  return {
    scoring_conditions: conditions,
    computed_scores: scores,
    judgment_label: judgmentLabel,
    segment: segment,
    good_signal_count: computeGoodSignalCount(data.signal_details),
    bad_signal_count: computeBadSignalCount(data.signal_details),
  };
}

/**
 * Get segment label in Japanese.
 */
export function getSegmentLabel(segment: Segment): string {
  const labels: Record<Segment, string> = {
    A: "省エネ意識高",
    B: "ガジェット好き",
    C: "便利さ追求",
    D: "ライト層",
  };
  return labels[segment];
}

/**
 * Get segment definition in Japanese.
 */
export function getSegmentDefinition(segment: Segment): string {
  const definitions: Record<Segment, string> = {
    A: "電気代関心度7点以上 + 電力切替経験あり",
    B: "クラファン経験あり + 連携家電5台以上",
    C: "エンゲージメント7点以上 + 電気代関心度4点以下",
    D: "アプリ月数回以下 + オートメーション1つ以下",
  };
  return definitions[segment];
}

/**
 * Format price range for display.
 */
export function formatPriceRange(
  min: number | null,
  max: number | null
): string {
  if (min === null && max === null) return "-";
  if (min === null) return `〜${max?.toLocaleString()}円`;
  if (max === null) return `${min.toLocaleString()}円〜`;
  if (min === max) return `${min.toLocaleString()}円`;
  return `${min.toLocaleString()}〜${max.toLocaleString()}円`;
}
