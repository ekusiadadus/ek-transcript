export interface Interview {
  interview_id: string;
  segment: string;
  created_at: string;
  analysis_key: string;
  transcript_key: string;
  video_key?: string | null;
  diarization_key?: string | null;
  total_score?: number | null;
  user_id?: string | null;
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
