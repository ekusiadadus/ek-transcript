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

// =============================================================================
// Enum Types (v2)
// =============================================================================

export type BillCheckFrequency = "monthly" | "few_months" | "rarely";
export type AppUsageFrequency = "daily" | "weekly_few" | "monthly_few" | "rarely";
export type ReplacementIntention = "immediate" | "consider" | "no_replace";
export type PurchaseChannel = "amazon" | "electronics_store" | "official_site" | "builder" | "other";
export type PurchaseTiming = "within_3_months" | "within_6_months" | "within_1_year" | "over_1_year" | "unknown";
export type Segment = "A" | "B" | "C" | "D";
export type JudgmentLabel = "最優先ターゲット" | "有望ターゲット" | "要検討" | "ターゲット外";

// =============================================================================
// Analysis JSON types from S3 (v2)
// =============================================================================

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
  // Structured price ranges (min/max in yen)
  cheap_min: number | null;
  cheap_max: number | null;
  fair_min: number | null;
  fair_max: number | null;
  expensive_min: number | null;
  expensive_max: number | null;
  // Purchase info
  max_purchase_price: number | null;
  actual_purchase_price: number | null;
  purchase_timing: PurchaseTiming | string | null;
  purchase_timing_note: string | null;
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

export interface AnalysisSignalDetails {
  // Good Signals (4 fixed items)
  good_took_cost_action: boolean | null;
  good_uses_app_weekly: boolean | null;
  good_has_crowdfunding_exp: boolean | null;
  good_would_replace_immediately: boolean | null;
  // Bad Signals (4 fixed items)
  bad_no_past_action: boolean | null;
  bad_no_bill_check_6months: boolean | null;
  bad_device_barely_used: boolean | null;
  bad_said_will_consider: boolean | null;
  // Additional signals (always array, never null)
  additional_good_signals: string[];
  additional_bad_signals: string[];
  // Evidence (optional, for debugging/review)
  evidence: Record<string, string> | null;
}

export interface AnalysisInsights {
  most_impressive_quote: string | null;
  unexpected_findings: string | null;
  non_negotiable_value: string | null;
  reason_not_to_pay: string | null;
  suggestion_for_500_supporters: string | null;
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
  signal_details: AnalysisSignalDetails;
  insights: AnalysisInsights;
  summary: string | null;
  action_items: string[];
}

// =============================================================================
// Computed Types (v2) - These are derived, not stored
// =============================================================================

export interface ScoringConditions {
  // Electricity Interest conditions
  can_recall_recent_bill: boolean;
  has_two_or_more_actions: boolean;
  has_switched_company: boolean;
  checks_bill_monthly: boolean;
  // Engagement conditions
  uses_app_weekly_3x: boolean;
  has_3_or_more_automations: boolean;
  has_5_or_more_devices: boolean;
  would_replace_immediately: boolean;
  // Crowdfunding conditions
  has_crowdfunding_exp: boolean;
  crowdfunding_3_or_more: boolean;
  crowdfunding_10k_plus: boolean;
  crowdfunding_gadget: boolean;
}

export interface ComputedScores {
  electricity_interest_score: number;
  engagement_score: number;
  crowdfunding_fit_score: number;
  total_score: number;
}

export interface DerivedAnalysisFields {
  scoring_conditions: ScoringConditions;
  computed_scores: ComputedScores;
  judgment_label: JudgmentLabel;
  segment: Segment;
  good_signal_count: number;
  bad_signal_count: number;
}

// Meeting types for Google Meet integration
export type MeetingStatus =
  | "SCHEDULED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED"
  | "RECORDING_AVAILABLE"
  | "PROCESSING"
  | "ANALYZED";

export interface Meeting {
  meeting_id: string;
  user_id: string;
  title: string;
  description?: string | null;
  start_time: string;
  end_time: string;
  status: MeetingStatus;
  google_calendar_event_id?: string | null;
  google_meet_space_id?: string | null;
  google_meet_uri?: string | null;
  auto_recording?: boolean | null;
  auto_transcription?: boolean | null;
  recording_file_id?: string | null;
  recording_s3_key?: string | null;
  interview_id?: string | null;
  created_at: string;
  updated_at?: string | null;
}

export interface MeetingConnection {
  items: Meeting[];
  nextToken?: string | null;
}

export interface CreateMeetingInput {
  title: string;
  description?: string | null;
  start_time: string;
  end_time: string;
  auto_recording?: boolean | null;
  auto_transcription?: boolean | null;
}

export interface UpdateMeetingInput {
  meeting_id: string;
  title?: string | null;
  description?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  status?: MeetingStatus | null;
  auto_recording?: boolean | null;
  auto_transcription?: boolean | null;
  google_calendar_event_id?: string | null;
  google_meet_space_id?: string | null;
  google_meet_uri?: string | null;
  recording_file_id?: string | null;
  recording_s3_key?: string | null;
  interview_id?: string | null;
}

export interface SyncCalendarInput {
  start_date?: string | null;
  end_date?: string | null;
  max_results?: number | null;
}

// Keep alias for backward compatibility
export type CalendarSyncInput = SyncCalendarInput;

export interface CalendarSyncResult {
  success: boolean;
  synced_count: number;
  new_meetings?: Meeting[] | null;
  updated_meetings?: Meeting[] | null;
  error_message?: string | null;
}

export interface GetMeetingResponse {
  getMeeting: Meeting | null;
}

export interface ListMeetingsResponse {
  listMeetings: MeetingConnection;
}

export interface CreateMeetingResponse {
  createMeeting: Meeting;
}

export interface UpdateMeetingResponse {
  updateMeeting: Meeting;
}

export interface DeleteMeetingResponse {
  deleteMeeting: Meeting;
}

export interface SyncCalendarResponse {
  syncCalendar: CalendarSyncResult;
}

// Google OAuth types
export interface GoogleAuthUrlResponse {
  auth_url: string;
  state: string;
}

export interface GoogleConnectionStatus {
  connected: boolean;
  email?: string | null;
  scopes?: string[] | null;
  expires_at?: string | null;
  is_expired?: boolean | null;
}

export interface GoogleConnectionResult {
  success: boolean;
  email?: string | null;
  error_message?: string | null;
}

export interface ConnectGoogleInput {
  code: string;
  redirect_uri: string;
  state: string;
}

export interface GetGoogleAuthUrlResponse {
  getGoogleAuthUrl: GoogleAuthUrlResponse;
}

export interface GetGoogleConnectionStatusResponse {
  getGoogleConnectionStatus: GoogleConnectionStatus;
}

export interface ConnectGoogleResponse {
  connectGoogle: GoogleConnectionResult;
}

export interface DisconnectGoogleResponse {
  disconnectGoogle: GoogleConnectionResult;
}

// Recording types for Google Meet REST API v2
export type RecordingStatus =
  | "PENDING"
  | "DOWNLOADING"
  | "DOWNLOADED"
  | "ANALYZING"
  | "ANALYZED"
  | "ERROR";

export interface Recording {
  recording_name: string;
  conference_record: string;
  space?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  drive_file_id: string;
  export_uri?: string | null;
  status?: RecordingStatus | null;
  meeting_id?: string | null;
  interview_id?: string | null;
}

export interface RecordingSyncResult {
  success: boolean;
  conference_records_count: number;
  recordings_found: Recording[];
  recordings_downloaded?: Recording[] | null;
  error_message?: string | null;
}

export interface SyncMeetRecordingsInput {
  days_back?: number | null;
}

export interface SyncMeetRecordingsResponse {
  syncMeetRecordings: RecordingSyncResult;
}

export interface AnalyzeRecordingResponse {
  analyzeRecording: Recording;
}

export interface RecordingsConnection {
  items: Recording[];
  nextToken?: string | null;
}

export interface ListRecordingsResponse {
  listRecordings: RecordingsConnection;
}
