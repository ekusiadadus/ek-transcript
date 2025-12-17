"""
Tests for enhanced HEMS Interview Models (v2)

Tests for enum definitions, structured price sensitivity, signal details,
and computation functions.
"""

import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

import pytest

from models import (
    # Enums
    BillCheckFrequency,
    AppUsageFrequency,
    ReplacementIntention,
    PurchaseChannel,
    PurchaseTiming,
    Segment,
    # Models
    PriceSensitivity,
    SignalDetails,
    ElectricityCost,
    DeviceInfo,
    CrowdfundingExperience,
    HEMSInterviewData,
)
from compute import (
    compute_scoring_conditions,
    compute_scores_from_conditions,
    compute_judgment_label,
    compute_segment,
)


class TestEnums:
    """Test enum definitions"""

    def test_bill_check_frequency_values(self):
        assert BillCheckFrequency.MONTHLY.value == "monthly"
        assert BillCheckFrequency.FEW_MONTHS.value == "few_months"
        assert BillCheckFrequency.RARELY.value == "rarely"

    def test_app_usage_frequency_values(self):
        assert AppUsageFrequency.DAILY.value == "daily"
        assert AppUsageFrequency.WEEKLY_FEW.value == "weekly_few"
        assert AppUsageFrequency.MONTHLY_FEW.value == "monthly_few"
        assert AppUsageFrequency.RARELY.value == "rarely"

    def test_replacement_intention_values(self):
        assert ReplacementIntention.IMMEDIATE.value == "immediate"
        assert ReplacementIntention.CONSIDER.value == "consider"
        assert ReplacementIntention.NO_REPLACE.value == "no_replace"

    def test_purchase_channel_values(self):
        assert PurchaseChannel.AMAZON.value == "amazon"
        assert PurchaseChannel.ELECTRONICS_STORE.value == "electronics_store"
        assert PurchaseChannel.OFFICIAL_SITE.value == "official_site"
        assert PurchaseChannel.BUILDER.value == "builder"
        assert PurchaseChannel.OTHER.value == "other"

    def test_purchase_timing_values(self):
        assert PurchaseTiming.WITHIN_3_MONTHS.value == "within_3_months"
        assert PurchaseTiming.WITHIN_6_MONTHS.value == "within_6_months"
        assert PurchaseTiming.WITHIN_1_YEAR.value == "within_1_year"
        assert PurchaseTiming.OVER_1_YEAR.value == "over_1_year"
        assert PurchaseTiming.UNKNOWN.value == "unknown"

    def test_segment_values(self):
        assert Segment.A.value == "A"
        assert Segment.B.value == "B"
        assert Segment.C.value == "C"
        assert Segment.D.value == "D"


class TestPriceSensitivity:
    """Test structured price sensitivity model"""

    def test_price_sensitivity_with_ranges(self):
        ps = PriceSensitivity(
            cheap_min=0,
            cheap_max=5000,
            fair_min=5000,
            fair_max=15000,
            expensive_min=15000,
            expensive_max=50000,
            max_purchase_price=30000,
            actual_purchase_price=12000,
            purchase_timing=PurchaseTiming.WITHIN_6_MONTHS,
        )
        assert ps.cheap_min == 0
        assert ps.cheap_max == 5000
        assert ps.fair_min == 5000
        assert ps.fair_max == 15000
        assert ps.expensive_min == 15000
        assert ps.expensive_max == 50000
        assert ps.max_purchase_price == 30000
        assert ps.actual_purchase_price == 12000
        assert ps.purchase_timing == PurchaseTiming.WITHIN_6_MONTHS

    def test_price_sensitivity_with_nulls(self):
        ps = PriceSensitivity()
        assert ps.cheap_min is None
        assert ps.cheap_max is None
        assert ps.purchase_timing is None

    def test_price_sensitivity_with_note(self):
        ps = PriceSensitivity(
            purchase_timing=PurchaseTiming.UNKNOWN,
            purchase_timing_note="ボーナス時期に検討",
        )
        assert ps.purchase_timing == PurchaseTiming.UNKNOWN
        assert ps.purchase_timing_note == "ボーナス時期に検討"


class TestSignalDetails:
    """Test signal details model"""

    def test_signal_details_all_good(self):
        sd = SignalDetails(
            good_took_cost_action=True,
            good_uses_app_weekly=True,
            good_has_crowdfunding_exp=True,
            good_would_replace_immediately=True,
            bad_no_past_action=False,
            bad_no_bill_check_6months=False,
            bad_device_barely_used=False,
            bad_said_will_consider=False,
        )
        assert sd.good_took_cost_action is True
        assert sd.bad_no_past_action is False

    def test_signal_details_with_additional(self):
        sd = SignalDetails(
            good_took_cost_action=True,
            additional_good_signals=["売電収入を実感", "口コミ経験あり"],
            additional_bad_signals=["初期費用を懸念"],
        )
        assert len(sd.additional_good_signals) == 2
        assert len(sd.additional_bad_signals) == 1

    def test_signal_details_empty_arrays_not_null(self):
        """Arrays should default to empty list, not null"""
        sd = SignalDetails()
        assert sd.additional_good_signals == []
        assert sd.additional_bad_signals == []
        assert sd.additional_good_signals is not None
        assert sd.additional_bad_signals is not None

    def test_signal_details_with_evidence(self):
        sd = SignalDetails(
            good_took_cost_action=True,
            evidence={"good_took_cost_action": "LED電球を買った"},
        )
        assert sd.evidence["good_took_cost_action"] == "LED電球を買った"


class TestComputeScoringConditions:
    """Test scoring condition computation from fact fields"""

    def test_compute_electricity_conditions(self):
        data = HEMSInterviewData(
            electricity_cost=ElectricityCost(
                recent_monthly_cost=12000,
                past_year_actions=["LED導入", "エアコン温度調整"],
                has_switched_company=True,
                bill_check_frequency=BillCheckFrequency.MONTHLY,
            )
        )
        conditions = compute_scoring_conditions(data)

        assert conditions["can_recall_recent_bill"] is True
        assert conditions["has_two_or_more_actions"] is True
        assert conditions["has_switched_company"] is True
        assert conditions["checks_bill_monthly"] is True

    def test_compute_engagement_conditions(self):
        data = HEMSInterviewData(
            device_info=DeviceInfo(
                app_usage_frequency=AppUsageFrequency.DAILY,
                automation_count=5,
                connected_devices_count=8,
                replacement_intention=ReplacementIntention.IMMEDIATE,
            )
        )
        conditions = compute_scoring_conditions(data)

        assert conditions["uses_app_weekly_3x"] is True
        assert conditions["has_3_or_more_automations"] is True
        assert conditions["has_5_or_more_devices"] is True
        assert conditions["would_replace_immediately"] is True

    def test_compute_crowdfunding_conditions(self):
        data = HEMSInterviewData(
            crowdfunding_experience=CrowdfundingExperience(
                has_crowdfunding_experience=True,
                crowdfunding_count=5,
                average_support_amount=15000,
                supported_categories=["ガジェット", "テクノロジー"],
            )
        )
        conditions = compute_scoring_conditions(data)

        assert conditions["has_crowdfunding_exp"] is True
        assert conditions["crowdfunding_3_or_more"] is True
        assert conditions["crowdfunding_10k_plus"] is True
        assert conditions["crowdfunding_gadget"] is True

    def test_compute_conditions_with_nulls(self):
        """Null values should result in False conditions"""
        data = HEMSInterviewData()
        conditions = compute_scoring_conditions(data)

        assert conditions["can_recall_recent_bill"] is False
        assert conditions["has_two_or_more_actions"] is False
        assert conditions["has_switched_company"] is False


class TestComputeScores:
    """Test score computation from conditions"""

    def test_compute_perfect_scores(self):
        conditions = {
            "can_recall_recent_bill": True,
            "has_two_or_more_actions": True,
            "has_switched_company": True,
            "checks_bill_monthly": True,
            "uses_app_weekly_3x": True,
            "has_3_or_more_automations": True,
            "has_5_or_more_devices": True,
            "would_replace_immediately": True,
            "has_crowdfunding_exp": True,
            "crowdfunding_3_or_more": True,
            "crowdfunding_10k_plus": True,
            "crowdfunding_gadget": True,
        }
        scores = compute_scores_from_conditions(conditions)

        assert scores["electricity_interest_score"] == 10
        assert scores["engagement_score"] == 10
        assert scores["crowdfunding_fit_score"] == 10
        assert scores["total_score"] == 30

    def test_compute_partial_scores(self):
        conditions = {
            "can_recall_recent_bill": True,  # +2
            "has_two_or_more_actions": True,  # +3
            "has_switched_company": False,  # +0
            "checks_bill_monthly": False,  # +0
            "uses_app_weekly_3x": False,  # +0
            "has_3_or_more_automations": False,  # +0
            "has_5_or_more_devices": False,  # +0
            "would_replace_immediately": True,  # +3
            "has_crowdfunding_exp": True,  # +3
            "crowdfunding_3_or_more": False,  # +0
            "crowdfunding_10k_plus": False,  # +0
            "crowdfunding_gadget": False,  # +0
        }
        scores = compute_scores_from_conditions(conditions)

        assert scores["electricity_interest_score"] == 5  # 2+3
        assert scores["engagement_score"] == 3  # 3
        assert scores["crowdfunding_fit_score"] == 3  # 3
        assert scores["total_score"] == 11

    def test_compute_zero_scores(self):
        conditions = {
            "can_recall_recent_bill": False,
            "has_two_or_more_actions": False,
            "has_switched_company": False,
            "checks_bill_monthly": False,
            "uses_app_weekly_3x": False,
            "has_3_or_more_automations": False,
            "has_5_or_more_devices": False,
            "would_replace_immediately": False,
            "has_crowdfunding_exp": False,
            "crowdfunding_3_or_more": False,
            "crowdfunding_10k_plus": False,
            "crowdfunding_gadget": False,
        }
        scores = compute_scores_from_conditions(conditions)

        assert scores["electricity_interest_score"] == 0
        assert scores["engagement_score"] == 0
        assert scores["crowdfunding_fit_score"] == 0
        assert scores["total_score"] == 0


class TestComputeJudgmentLabel:
    """Test judgment label computation"""

    def test_priority_target(self):
        assert compute_judgment_label(30) == "最優先ターゲット"
        assert compute_judgment_label(25) == "最優先ターゲット"

    def test_promising_target(self):
        assert compute_judgment_label(24) == "有望ターゲット"
        assert compute_judgment_label(18) == "有望ターゲット"

    def test_needs_review(self):
        assert compute_judgment_label(17) == "要検討"
        assert compute_judgment_label(12) == "要検討"

    def test_not_target(self):
        assert compute_judgment_label(11) == "ターゲット外"
        assert compute_judgment_label(0) == "ターゲット外"


class TestComputeSegment:
    """Test segment computation"""

    def test_segment_a_high_energy_awareness(self):
        """Segment A: electricity_interest >= 7 AND has_switched_company"""
        conditions = {
            "can_recall_recent_bill": True,
            "has_two_or_more_actions": True,
            "has_switched_company": True,
            "checks_bill_monthly": True,  # score = 10
        }
        scores = {"electricity_interest_score": 10}
        segment = compute_segment(conditions, scores)
        assert segment == Segment.A

    def test_segment_b_gadget_lover(self):
        """Segment B: has_crowdfunding_exp AND has_5_or_more_devices"""
        conditions = {
            "has_crowdfunding_exp": True,
            "has_5_or_more_devices": True,
            "has_switched_company": False,
        }
        scores = {"electricity_interest_score": 4}
        segment = compute_segment(conditions, scores)
        assert segment == Segment.B

    def test_segment_c_convenience_seeker(self):
        """Segment C: engagement >= 7 AND electricity_interest <= 4"""
        conditions = {
            "has_crowdfunding_exp": False,
            "has_5_or_more_devices": False,
            "has_switched_company": False,
        }
        scores = {
            "electricity_interest_score": 3,
            "engagement_score": 8,
        }
        segment = compute_segment(conditions, scores)
        assert segment == Segment.C

    def test_segment_d_light_user(self):
        """Segment D: app_monthly_or_less AND automation <= 1"""
        conditions = {
            "uses_app_weekly_3x": False,
            "has_3_or_more_automations": False,
            "has_crowdfunding_exp": False,
            "has_5_or_more_devices": False,
            "has_switched_company": False,
        }
        scores = {
            "electricity_interest_score": 3,
            "engagement_score": 2,
        }
        segment = compute_segment(conditions, scores)
        assert segment == Segment.D


class TestModelBackwardCompatibility:
    """Test backward compatibility with existing data"""

    def test_old_string_bill_frequency_accepted(self):
        """Old string values should still work during transition"""
        ec = ElectricityCost(bill_check_frequency="毎月")
        assert ec.bill_check_frequency == "毎月"

    def test_enum_bill_frequency_also_works(self):
        """New enum values should also work"""
        ec = ElectricityCost(bill_check_frequency=BillCheckFrequency.MONTHLY)
        assert ec.bill_check_frequency == BillCheckFrequency.MONTHLY
