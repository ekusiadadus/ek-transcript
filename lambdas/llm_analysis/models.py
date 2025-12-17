"""
HEMS Interview Pydantic Models (v2)

OpenAI Structured Outputs 用の Pydantic モデル定義。
インタビュー設計書に基づいた構造化スキーマ。

v2 Changes:
- Added enum definitions for standardized values
- Structured PriceSensitivity with min/max ranges
- Added SignalDetails for fixed 8 signals + additional
- Removed good_signals/bad_signals from Insights (moved to SignalDetails)
"""

from enum import Enum
from typing import Optional, Union

from pydantic import BaseModel, Field


# =============================================================================
# Enum Definitions
# =============================================================================


class BillCheckFrequency(str, Enum):
    """明細確認頻度"""

    MONTHLY = "monthly"  # 毎月
    FEW_MONTHS = "few_months"  # 数ヶ月に1回
    RARELY = "rarely"  # ほぼ見ない


class AppUsageFrequency(str, Enum):
    """アプリ利用頻度"""

    DAILY = "daily"  # 毎日
    WEEKLY_FEW = "weekly_few"  # 週数回
    MONTHLY_FEW = "monthly_few"  # 月数回
    RARELY = "rarely"  # ほぼ開かない


class ReplacementIntention(str, Enum):
    """故障時買替意向"""

    IMMEDIATE = "immediate"  # 即買い直す
    CONSIDER = "consider"  # 検討する
    NO_REPLACE = "no_replace"  # 買い直さない


class PurchaseChannel(str, Enum):
    """購入チャネル"""

    AMAZON = "amazon"
    ELECTRONICS_STORE = "electronics_store"  # 家電量販店
    OFFICIAL_SITE = "official_site"  # 公式サイト
    BUILDER = "builder"  # 住宅メーカー経由
    OTHER = "other"


class PurchaseTiming(str, Enum):
    """購入時期"""

    WITHIN_3_MONTHS = "within_3_months"
    WITHIN_6_MONTHS = "within_6_months"
    WITHIN_1_YEAR = "within_1_year"
    OVER_1_YEAR = "over_1_year"
    UNKNOWN = "unknown"


class Segment(str, Enum):
    """セグメント分類"""

    A = "A"  # 省エネ意識高
    B = "B"  # ガジェット好き
    C = "C"  # 便利さ追求
    D = "D"  # ライト層


# =============================================================================
# Model Definitions
# =============================================================================


class BasicAttributes(BaseModel):
    """基本属性"""

    age: Optional[int] = Field(None, description="年齢")
    household_size: Optional[int] = Field(None, description="世帯人数")
    residence_type: Optional[str] = Field(
        None, description="住居形態（賃貸マンション/賃貸アパート/分譲/戸建て）"
    )
    area: Optional[str] = Field(None, description="居住エリア")
    residence_years: Optional[float] = Field(None, description="居住年数")
    layout: Optional[str] = Field(None, description="間取り")
    weekday_home_hours: Optional[float] = Field(None, description="平日在宅時間")
    weekend_home_hours: Optional[float] = Field(None, description="休日在宅時間")
    occupation_type: Optional[str] = Field(
        None, description="職業形態（会社員出社/会社員リモート/フリーランス/その他）"
    )


class ElectricityCost(BaseModel):
    """電気代関連"""

    recent_monthly_cost: Optional[int] = Field(None, description="直近の電気代（月額円）")
    summer_peak_cost: Optional[int] = Field(None, description="夏のピーク月電気代（円）")
    winter_peak_cost: Optional[int] = Field(None, description="冬のピーク月電気代（円）")
    power_company: Optional[str] = Field(None, description="電力会社名")
    has_switched_company: Optional[bool] = Field(None, description="電力会社切替経験")
    # Accept both enum and string for backward compatibility
    bill_check_frequency: Optional[Union[BillCheckFrequency, str]] = Field(
        None, description="明細確認頻度（monthly/few_months/rarely）"
    )
    pain_score: Optional[int] = Field(
        None, ge=0, le=10, description="電気代の痛みスコア（0-10）"
    )
    past_year_actions: list[str] = Field(
        default_factory=list, description="過去1年の電気代削減行動リスト"
    )
    saving_from_switch: Optional[int] = Field(None, description="切替による削減額（円）")
    purchased_items_for_saving: list[str] = Field(
        default_factory=list, description="節電のための購入物リスト"
    )


class DeviceInfo(BaseModel):
    """デバイス関連"""

    devices_used: list[str] = Field(
        default_factory=list, description="利用デバイス（Nature Remo/SwitchBot/AiSEG等）"
    )
    purchase_date: Optional[str] = Field(None, description="購入時期（YYYY-MM形式）")
    purchase_amount: Optional[int] = Field(None, description="購入金額（総額円）")
    # Accept both enum and string for backward compatibility
    purchase_channel: Optional[Union[PurchaseChannel, str]] = Field(
        None, description="購入チャネル（amazon/electronics_store/official_site/builder/other）"
    )
    app_usage_frequency: Optional[Union[AppUsageFrequency, str]] = Field(
        None, description="アプリ起動頻度（daily/weekly_few/monthly_few/rarely）"
    )
    connected_devices_count: Optional[int] = Field(None, description="連携家電数")
    automation_count: Optional[int] = Field(None, description="オートメーション設定数")
    most_used_feature: Optional[str] = Field(None, description="最頻使用機能")
    satisfaction_points: list[str] = Field(
        default_factory=list, description="満足ポイント（トップ3）"
    )
    dissatisfaction_points: list[str] = Field(
        default_factory=list, description="不満ポイント（トップ3）"
    )
    unused_features: list[str] = Field(
        default_factory=list, description="使わなくなった機能"
    )
    initial_setup_time_minutes: Optional[int] = Field(None, description="初期設定時間（分）")
    replacement_intention: Optional[Union[ReplacementIntention, str]] = Field(
        None, description="故障時買替意向（immediate/consider/no_replace）"
    )


class PriceSensitivity(BaseModel):
    """価格感覚（構造化版）"""

    # Structured price ranges (min/max)
    cheap_min: Optional[int] = Field(None, description="安いと感じる価格帯の下限（円）")
    cheap_max: Optional[int] = Field(None, description="安いと感じる価格帯の上限（円）")
    fair_min: Optional[int] = Field(None, description="妥当と感じる価格帯の下限（円）")
    fair_max: Optional[int] = Field(None, description="妥当と感じる価格帯の上限（円）")
    expensive_min: Optional[int] = Field(None, description="高いと感じる価格帯の下限（円）")
    expensive_max: Optional[int] = Field(None, description="高いと感じる価格帯の上限（円）")

    # Purchase info
    max_purchase_price: Optional[int] = Field(None, description="購入上限価格（円）")
    actual_purchase_price: Optional[int] = Field(None, description="実購入金額（円）")
    purchase_timing: Optional[Union[PurchaseTiming, str]] = Field(
        None, description="購入時期（within_3_months/within_6_months/within_1_year/over_1_year/unknown）"
    )
    purchase_timing_note: Optional[str] = Field(
        None, description="購入時期の補足（自由記述）"
    )


class Scoring(BaseModel):
    """スコアリング（LLM出力、検証用）"""

    electricity_interest_score: Optional[int] = Field(
        None, ge=0, le=10, description="電気代関心度スコア（0-10）"
    )
    electricity_interest_details: Optional[str] = Field(
        None, description="電気代関心度スコアの算出根拠"
    )
    engagement_score: Optional[int] = Field(
        None, ge=0, le=10, description="エンゲージメントスコア（0-10）"
    )
    engagement_details: Optional[str] = Field(
        None, description="エンゲージメントスコアの算出根拠"
    )
    crowdfunding_fit_score: Optional[int] = Field(
        None, ge=0, le=10, description="クラファン適合スコア（0-10）"
    )
    crowdfunding_fit_details: Optional[str] = Field(
        None, description="クラファン適合スコアの算出根拠"
    )
    total_score: Optional[int] = Field(None, ge=0, le=30, description="総合スコア（0-30）")
    segment: Optional[Union[Segment, str]] = Field(
        None, description="セグメント（A/B/C/D）"
    )
    segment_reason: Optional[str] = Field(None, description="セグメント判定理由")


class SignalDetails(BaseModel):
    """Good/Badシグナル詳細（固定8項目 + 追加）"""

    # Good Signals（4項目）
    good_took_cost_action: Optional[bool] = Field(
        None, description="電気代削減のために過去に実際にお金/時間を使った"
    )
    good_uses_app_weekly: Optional[bool] = Field(
        None, description="スマートホームアプリを週1回以上開いている"
    )
    good_has_crowdfunding_exp: Optional[bool] = Field(
        None, description="クラウドファンディングで実際に支援した経験がある"
    )
    good_would_replace_immediately: Optional[bool] = Field(
        None, description="壊れたら即買い直すと即答"
    )

    # Bad Signals（4項目）
    bad_no_past_action: Optional[bool] = Field(
        None, description="「興味はある」と言うが、過去に何も行動していない"
    )
    bad_no_bill_check_6months: Optional[bool] = Field(
        None, description="電気代の明細を6ヶ月以上見ていない"
    )
    bad_device_barely_used: Optional[bool] = Field(
        None, description="買ったデバイスをほとんど使っていない"
    )
    bad_said_will_consider: Optional[bool] = Field(
        None, description="「検討する」「なくても困らない」と回答"
    )

    # Additional signals (always array, never null)
    additional_good_signals: list[str] = Field(
        default_factory=list, description="追加の有望シグナル（インタビューから抽出）"
    )
    additional_bad_signals: list[str] = Field(
        default_factory=list, description="追加の要注意シグナル（インタビューから抽出）"
    )

    # Evidence (optional, for debugging/review)
    evidence: Optional[dict[str, str]] = Field(
        None, description="各シグナルの根拠となる発言抜粋"
    )


class Insights(BaseModel):
    """重要インサイト（v2: good/bad_signalsはSignalDetailsに移行）"""

    most_impressive_quote: Optional[str] = Field(
        None, description="最も印象的だった発言（原文）"
    )
    unexpected_findings: Optional[str] = Field(None, description="予想と違った点")
    non_negotiable_value: Optional[str] = Field(None, description="絶対に譲れない価値")
    reason_not_to_pay: Optional[str] = Field(None, description="絶対に払わない理由")
    suggestion_for_500_supporters: Optional[str] = Field(
        None, description="500人支援者獲得に向けた示唆"
    )


class CrowdfundingExperience(BaseModel):
    """クラウドファンディング経験"""

    monthly_subscription_total: Optional[int] = Field(
        None, description="月額サブスク総額（円）"
    )
    canceled_subscriptions: list[str] = Field(
        default_factory=list, description="解約したサブスクリスト"
    )
    has_crowdfunding_experience: Optional[bool] = Field(
        None, description="クラファン支援経験"
    )
    crowdfunding_count: Optional[int] = Field(None, description="クラファン支援回数")
    average_support_amount: Optional[int] = Field(
        None, description="1回あたり平均支援額（円）"
    )
    supported_categories: list[str] = Field(
        default_factory=list, description="支援したカテゴリ"
    )
    uses_point_sites: Optional[str] = Field(
        None, description="ポイントサイト利用（よく使う/たまに使う/使わない）"
    )
    ad_resistance: Optional[str] = Field(None, description="広告への抵抗感（高/中/低）")


class FamilyAndBarriers(BaseModel):
    """家族利用と導入障壁"""

    family_usage: Optional[bool] = Field(None, description="家族利用状況")
    family_usage_frequency: Optional[str] = Field(None, description="家族の利用頻度")
    family_most_used_feature: Optional[str] = Field(
        None, description="家族が最も使う機能"
    )
    non_usage_reason: Optional[str] = Field(None, description="非利用理由")
    rental_barriers: list[str] = Field(
        default_factory=list, description="賃貸での設置障壁（工事/配線/Wi-Fi/設置場所）"
    )
    abandoned_ideas: Optional[str] = Field(None, description="賃貸で諦めたアイデア")
    has_recommended: Optional[bool] = Field(None, description="他者への推奨経験")
    recommendation_phrase: Optional[str] = Field(
        None, description="推奨時に使ったフレーズ"
    )
    nps_score: Optional[int] = Field(None, ge=0, le=10, description="NPS（0-10）")


class HEMSInterviewData(BaseModel):
    """HEMS インタビューデータ（構造化出力のルートモデル）v2"""

    interview_id: Optional[str] = Field(None, description="インタビュー番号")
    interview_duration_minutes: Optional[int] = Field(
        None, description="インタビュー所要時間（分）"
    )
    basic_attributes: BasicAttributes = Field(default_factory=BasicAttributes)
    electricity_cost: ElectricityCost = Field(default_factory=ElectricityCost)
    device_info: DeviceInfo = Field(default_factory=DeviceInfo)
    price_sensitivity: PriceSensitivity = Field(default_factory=PriceSensitivity)
    crowdfunding_experience: CrowdfundingExperience = Field(
        default_factory=CrowdfundingExperience
    )
    family_and_barriers: FamilyAndBarriers = Field(default_factory=FamilyAndBarriers)
    scoring: Scoring = Field(default_factory=Scoring)
    signal_details: SignalDetails = Field(default_factory=SignalDetails)
    insights: Insights = Field(default_factory=Insights)
    summary: Optional[str] = Field(None, description="インタビュー全体の要約（3文以内）")
    action_items: list[str] = Field(default_factory=list, description="次のアクション項目")
