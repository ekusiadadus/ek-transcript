export interface Interview {
  interview_id: string;
  segment: string;
  created_at: string;
  status?: string | null;
  progress?: number | null;
  current_step?: string | null;
  error_message?: string | null;
  analysis_key?: string | null;
  transcript_key?: string | null;
  video_key?: string | null;
  diarization_key?: string | null;
  total_score?: number | null;
  user_id?: string | null;
  file_name?: string | null;
  file_size?: number | null;
  execution_arn?: string | null;
  updated_at?: string | null;
}

export interface InterviewConnection {
  items: Interview[];
  nextToken?: string | null;
}

export interface CreateInterviewInput {
  interview_id: string;
  segment: string;
  analysis_key: string;
  transcript_key: string;
  video_key?: string | null;
  diarization_key?: string | null;
  total_score?: number | null;
  user_id?: string | null;
}

export interface UpdateInterviewInput {
  interview_id: string;
  segment?: string | null;
  analysis_key?: string | null;
  transcript_key?: string | null;
  video_key?: string | null;
  diarization_key?: string | null;
  total_score?: number | null;
}

export interface GetInterviewResponse {
  getInterview: Interview | null;
}

export interface ListInterviewsResponse {
  listInterviews: InterviewConnection;
}

export interface ListInterviewsBySegmentResponse {
  listInterviewsBySegment: InterviewConnection;
}

export interface UpdateInterviewResponse {
  updateInterview: Interview;
}

export interface DeleteInterviewResponse {
  deleteInterview: Interview;
}

export interface UploadUrlResponse {
  uploadUrl: string;
  key: string;
  expiresIn: number;
}

export interface GetUploadUrlResponse {
  getUploadUrl: UploadUrlResponse;
}

export interface VideoUrlResponse {
  videoUrl: string;
  expiresIn: number;
}

export interface GetVideoUrlResponse {
  getVideoUrl: VideoUrlResponse;
}

// Analysis JSON types from S3
export interface AnalysisBasicAttributes {
  age: number | null;
  household_size: number | null;
  residence_type: string | null;
  area: string | null;
  residence_years: number | null;
  layout: string | null;
  weekday_home_hours: number | null;
  weekend_home_hours: number | null;
  occupation_type: string | null;
}

export interface AnalysisElectricityCost {
  recent_monthly_cost: number | null;
  summer_peak_cost: number | null;
  winter_peak_cost: number | null;
  power_company: string | null;
  has_switched_company: boolean | null;
  bill_check_frequency: string | null;
  pain_score: number | null;
  past_year_actions: string[];
  saving_from_switch: number | null;
  purchased_items_for_saving: string[];
}

export interface AnalysisDeviceInfo {
  devices_used: string[];
  purchase_date: string | null;
  purchase_amount: number | null;
  purchase_channel: string | null;
  app_usage_frequency: string | null;
  connected_devices_count: number | null;
  automation_count: number | null;
  most_used_feature: string | null;
  satisfaction_points: string[];
  dissatisfaction_points: string[];
  unused_features: string[];
  initial_setup_time_minutes: number | null;
  replacement_intention: string | null;
}

export interface AnalysisPriceSensitivity {
  cheap_price_range: string | null;
  fair_price_range: string | null;
  expensive_price_range: string | null;
  max_purchase_price: number | null;
}

export interface AnalysisCrowdfundingExperience {
  monthly_subscription_total: number | null;
  canceled_subscriptions: string[] | null;
  has_crowdfunding_experience: boolean | null;
  crowdfunding_count: number | null;
  average_support_amount: number | null;
  supported_categories: string[];
  uses_point_sites: string | null;
  ad_resistance: string | null;
}

export interface AnalysisFamilyAndBarriers {
  family_usage: boolean | null;
  family_usage_frequency: string | null;
  family_most_used_feature: string | null;
  non_usage_reason: string | null;
  rental_barriers: string[];
  abandoned_ideas: string | null;
  has_recommended: boolean | null;
  recommendation_phrase: string | null;
  nps_score: number | null;
}

export interface AnalysisScoring {
  electricity_interest_score: number | null;
  electricity_interest_details: string | null;
  engagement_score: number | null;
  engagement_details: string | null;
  crowdfunding_fit_score: number | null;
  crowdfunding_fit_details: string | null;
  total_score: number | null;
  segment: string | null;
  segment_reason: string | null;
}

export interface AnalysisInsights {
  most_impressive_quote: string | null;
  unexpected_findings: string | null;
  non_negotiable_value: string | null;
  reason_not_to_pay: string | null;
  suggestion_for_500_supporters: string | null;
  good_signals: string[];
  bad_signals: string[];
}

export interface AnalysisData {
  interview_id: string | null;
  interview_duration_minutes: number | null;
  basic_attributes: AnalysisBasicAttributes;
  electricity_cost: AnalysisElectricityCost;
  device_info: AnalysisDeviceInfo;
  price_sensitivity: AnalysisPriceSensitivity;
  crowdfunding_experience: AnalysisCrowdfundingExperience;
  family_and_barriers: AnalysisFamilyAndBarriers;
  scoring: AnalysisScoring;
  insights: AnalysisInsights;
  summary: string | null;
  action_items: string[];
}
