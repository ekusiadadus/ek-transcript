"""
Computation functions for HEMS Interview Analysis

Functions to compute scoring conditions, scores, judgment labels,
and segments from interview data. These are derived values that
should not be stored but computed on demand.
"""

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from models import HEMSInterviewData, Segment


def compute_scoring_conditions(data: "HEMSInterviewData") -> dict[str, bool]:
    """
    Compute scoring condition achievements from fact fields.

    Args:
        data: HEMSInterviewData containing fact fields

    Returns:
        Dictionary of condition name to boolean achievement status
    """
    from models import (
        AppUsageFrequency,
        BillCheckFrequency,
        ReplacementIntention,
    )

    ec = data.electricity_cost
    di = data.device_info
    cf = data.crowdfunding_experience

    # Electricity Interest Conditions (10 points max)
    can_recall_recent_bill = ec.recent_monthly_cost is not None
    has_two_or_more_actions = len(ec.past_year_actions or []) >= 2
    has_switched_company = ec.has_switched_company is True

    # Handle both enum and string for backward compatibility
    bill_freq = ec.bill_check_frequency
    if isinstance(bill_freq, BillCheckFrequency):
        checks_bill_monthly = bill_freq == BillCheckFrequency.MONTHLY
    else:
        checks_bill_monthly = bill_freq in ["monthly", "毎月"]

    # Engagement Conditions (10 points max)
    app_freq = di.app_usage_frequency
    if isinstance(app_freq, AppUsageFrequency):
        uses_app_weekly_3x = app_freq in [
            AppUsageFrequency.DAILY,
            AppUsageFrequency.WEEKLY_FEW,
        ]
    else:
        uses_app_weekly_3x = app_freq in ["daily", "weekly_few", "毎日", "週数回"]

    has_3_or_more_automations = (di.automation_count or 0) >= 3
    has_5_or_more_devices = (di.connected_devices_count or 0) >= 5

    replacement = di.replacement_intention
    if isinstance(replacement, ReplacementIntention):
        would_replace_immediately = replacement == ReplacementIntention.IMMEDIATE
    else:
        would_replace_immediately = replacement in ["immediate", "即買い直す"]

    # Crowdfunding Conditions (10 points max)
    has_crowdfunding_exp = cf.has_crowdfunding_experience is True
    crowdfunding_3_or_more = (cf.crowdfunding_count or 0) >= 3
    crowdfunding_10k_plus = (cf.average_support_amount or 0) >= 10000

    supported_categories = cf.supported_categories or []
    crowdfunding_gadget = any(
        cat in ["ガジェット", "テクノロジー", "gadget", "technology"]
        for cat in supported_categories
    )

    return {
        # Electricity Interest
        "can_recall_recent_bill": can_recall_recent_bill,
        "has_two_or_more_actions": has_two_or_more_actions,
        "has_switched_company": has_switched_company,
        "checks_bill_monthly": checks_bill_monthly,
        # Engagement
        "uses_app_weekly_3x": uses_app_weekly_3x,
        "has_3_or_more_automations": has_3_or_more_automations,
        "has_5_or_more_devices": has_5_or_more_devices,
        "would_replace_immediately": would_replace_immediately,
        # Crowdfunding
        "has_crowdfunding_exp": has_crowdfunding_exp,
        "crowdfunding_3_or_more": crowdfunding_3_or_more,
        "crowdfunding_10k_plus": crowdfunding_10k_plus,
        "crowdfunding_gadget": crowdfunding_gadget,
    }


def compute_scores_from_conditions(conditions: dict[str, bool]) -> dict[str, int]:
    """
    Compute scores from condition achievements.

    Args:
        conditions: Dictionary of condition name to boolean

    Returns:
        Dictionary with electricity_interest_score, engagement_score,
        crowdfunding_fit_score, and total_score
    """
    # Electricity Interest Score (max 10)
    electricity = sum(
        [
            2 if conditions.get("can_recall_recent_bill", False) else 0,
            3 if conditions.get("has_two_or_more_actions", False) else 0,
            3 if conditions.get("has_switched_company", False) else 0,
            2 if conditions.get("checks_bill_monthly", False) else 0,
        ]
    )

    # Engagement Score (max 10)
    engagement = sum(
        [
            3 if conditions.get("uses_app_weekly_3x", False) else 0,
            2 if conditions.get("has_3_or_more_automations", False) else 0,
            2 if conditions.get("has_5_or_more_devices", False) else 0,
            3 if conditions.get("would_replace_immediately", False) else 0,
        ]
    )

    # Crowdfunding Fit Score (max 10)
    crowdfunding = sum(
        [
            3 if conditions.get("has_crowdfunding_exp", False) else 0,
            2 if conditions.get("crowdfunding_3_or_more", False) else 0,
            2 if conditions.get("crowdfunding_10k_plus", False) else 0,
            3 if conditions.get("crowdfunding_gadget", False) else 0,
        ]
    )

    return {
        "electricity_interest_score": electricity,
        "engagement_score": engagement,
        "crowdfunding_fit_score": crowdfunding,
        "total_score": electricity + engagement + crowdfunding,
    }


def compute_judgment_label(total_score: int) -> str:
    """
    Compute judgment label from total score.

    Args:
        total_score: Total score (0-30)

    Returns:
        Judgment label string
    """
    if total_score >= 25:
        return "最優先ターゲット"
    elif total_score >= 18:
        return "有望ターゲット"
    elif total_score >= 12:
        return "要検討"
    else:
        return "ターゲット外"


def compute_segment(
    conditions: dict[str, bool], scores: dict[str, int]
) -> "Segment":
    """
    Compute segment classification from conditions and scores.

    Segment definitions:
    - A: 省エネ意識高 = electricity_interest >= 7 AND has_switched_company
    - B: ガジェット好き = has_crowdfunding_exp AND has_5_or_more_devices
    - C: 便利さ追求 = engagement >= 7 AND electricity_interest <= 4
    - D: ライト層 = app_monthly_or_less AND automation <= 1

    Args:
        conditions: Dictionary of condition achievements
        scores: Dictionary of computed scores

    Returns:
        Segment enum value
    """
    from models import Segment

    electricity_score = scores.get("electricity_interest_score", 0)
    engagement_score = scores.get("engagement_score", 0)

    # Check Segment A: High Energy Awareness
    if electricity_score >= 7 and conditions.get("has_switched_company", False):
        return Segment.A

    # Check Segment B: Gadget Lover
    if conditions.get("has_crowdfunding_exp", False) and conditions.get(
        "has_5_or_more_devices", False
    ):
        return Segment.B

    # Check Segment C: Convenience Seeker
    if engagement_score >= 7 and electricity_score <= 4:
        return Segment.C

    # Default to Segment D: Light User
    return Segment.D


def compute_good_signal_count(signal_details: "SignalDetails") -> int:
    """
    Count the number of true good signals.

    Args:
        signal_details: SignalDetails model

    Returns:
        Count of true good signals (0-4 for fixed, plus additional)
    """
    count = sum(
        [
            1 if signal_details.good_took_cost_action else 0,
            1 if signal_details.good_uses_app_weekly else 0,
            1 if signal_details.good_has_crowdfunding_exp else 0,
            1 if signal_details.good_would_replace_immediately else 0,
        ]
    )
    count += len(signal_details.additional_good_signals or [])
    return count


def compute_bad_signal_count(signal_details: "SignalDetails") -> int:
    """
    Count the number of true bad signals.

    Args:
        signal_details: SignalDetails model

    Returns:
        Count of true bad signals (0-4 for fixed, plus additional)
    """
    count = sum(
        [
            1 if signal_details.bad_no_past_action else 0,
            1 if signal_details.bad_no_bill_check_6months else 0,
            1 if signal_details.bad_device_barely_used else 0,
            1 if signal_details.bad_said_will_consider else 0,
        ]
    )
    count += len(signal_details.additional_bad_signals or [])
    return count


def compute_all_derived_fields(data: "HEMSInterviewData") -> dict:
    """
    Compute all derived fields from interview data.

    This is the main entry point for computing derived values.

    Args:
        data: HEMSInterviewData model

    Returns:
        Dictionary containing:
        - scoring_conditions: dict of bool
        - computed_scores: dict with scores
        - judgment_label: str
        - segment: Segment enum
        - good_signal_count: int (if signal_details present)
        - bad_signal_count: int (if signal_details present)
    """
    conditions = compute_scoring_conditions(data)
    scores = compute_scores_from_conditions(conditions)
    judgment = compute_judgment_label(scores["total_score"])
    segment = compute_segment(conditions, scores)

    result = {
        "scoring_conditions": conditions,
        "computed_scores": scores,
        "judgment_label": judgment,
        "segment": segment,
    }

    # Add signal counts if signal_details is present
    if hasattr(data, "signal_details") and data.signal_details:
        result["good_signal_count"] = compute_good_signal_count(data.signal_details)
        result["bad_signal_count"] = compute_bad_signal_count(data.signal_details)

    return result
