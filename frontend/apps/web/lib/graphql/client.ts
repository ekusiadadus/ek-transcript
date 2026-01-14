"use client";

import { generateClient, type GraphQLResult } from "aws-amplify/api";
import type {
  Interview,
  InterviewConnection,
  GetInterviewResponse,
  ListInterviewsResponse,
  ListInterviewsBySegmentResponse,
  UpdateInterviewInput,
  UpdateInterviewResponse,
  DeleteInterviewResponse,
  UploadUrlResponse,
  GetUploadUrlResponse,
  VideoUrlResponse,
  GetVideoUrlResponse,
  Meeting,
  MeetingConnection,
  MeetingStatus,
  CreateMeetingInput,
  UpdateMeetingInput,
  CalendarSyncInput,
  CalendarSyncResult,
  GetMeetingResponse,
  ListMeetingsResponse,
  CreateMeetingResponse,
  UpdateMeetingResponse,
  DeleteMeetingResponse,
  SyncCalendarResponse,
  Recording,
  RecordingStatus,
  RecordingSyncResult,
  RecordingsConnection,
  SyncMeetRecordingsInput,
  SyncMeetRecordingsResponse,
  AnalyzeRecordingResponse,
  ListRecordingsResponse,
  InterviewProject,
  InterviewProjectConnection,
  ProjectStatus,
  CreateInterviewProjectInput,
  UpdateInterviewProjectInput,
  GetInterviewProjectResponse,
  ListInterviewProjectsResponse,
  CreateInterviewProjectResponse,
  UpdateInterviewProjectResponse,
  DeleteInterviewProjectResponse,
} from "./types";
import { GET_INTERVIEW, LIST_INTERVIEWS, LIST_INTERVIEWS_BY_SEGMENT, GET_UPLOAD_URL, GET_VIDEO_URL, GET_MEETING, LIST_MEETINGS, LIST_RECORDINGS, GET_INTERVIEW_PROJECT, LIST_INTERVIEW_PROJECTS, LIST_INTERVIEWS_BY_PROJECT } from "./queries";
import { UPDATE_INTERVIEW, DELETE_INTERVIEW, CREATE_MEETING, UPDATE_MEETING, DELETE_MEETING, SYNC_CALENDAR, SYNC_MEET_RECORDINGS, ANALYZE_RECORDING, CREATE_INTERVIEW_PROJECT, UPDATE_INTERVIEW_PROJECT, DELETE_INTERVIEW_PROJECT } from "./mutations";

const client = generateClient();

// Generic graphql client for direct query/mutation calls
export const graphqlClient = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async query<T>(query: string, variables?: any): Promise<T> {
    const response = await client.graphql({
      query,
      variables,
    }) as GraphQLResult<T>;
    if (!response.data) {
      throw new Error("GraphQL query failed");
    }
    return response.data;
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async mutate<T>(query: string, variables?: any): Promise<T> {
    const response = await client.graphql({
      query,
      variables,
    }) as GraphQLResult<T>;
    if (!response.data) {
      throw new Error("GraphQL mutation failed");
    }
    return response.data;
  },
};

export async function getInterview(
  interviewId: string
): Promise<Interview | null> {
  const response = await client.graphql({
    query: GET_INTERVIEW,
    variables: { interview_id: interviewId },
  }) as GraphQLResult<GetInterviewResponse>;
  return response.data?.getInterview ?? null;
}

export async function listInterviews(
  limit?: number,
  nextToken?: string
): Promise<InterviewConnection> {
  const response = await client.graphql({
    query: LIST_INTERVIEWS,
    variables: { limit, nextToken },
  }) as GraphQLResult<ListInterviewsResponse>;
  return response.data?.listInterviews ?? { items: [], nextToken: null };
}

export async function listInterviewsBySegment(
  segment: string,
  limit?: number,
  nextToken?: string
): Promise<InterviewConnection> {
  const response = await client.graphql({
    query: LIST_INTERVIEWS_BY_SEGMENT,
    variables: { segment, limit, nextToken },
  }) as GraphQLResult<ListInterviewsBySegmentResponse>;
  return response.data?.listInterviewsBySegment ?? { items: [], nextToken: null };
}

export async function updateInterview(
  input: UpdateInterviewInput
): Promise<Interview> {
  const response = await client.graphql({
    query: UPDATE_INTERVIEW,
    variables: { input },
  }) as GraphQLResult<UpdateInterviewResponse>;
  if (!response.data?.updateInterview) {
    throw new Error("Failed to update interview");
  }
  return response.data.updateInterview;
}

export async function deleteInterview(interviewId: string): Promise<Interview> {
  const response = await client.graphql({
    query: DELETE_INTERVIEW,
    variables: { interview_id: interviewId },
  }) as GraphQLResult<DeleteInterviewResponse>;
  if (!response.data?.deleteInterview) {
    throw new Error("Failed to delete interview");
  }
  return response.data.deleteInterview;
}

export async function getUploadUrl(
  fileName: string,
  contentType?: string,
  segment?: string,
  projectId?: string
): Promise<UploadUrlResponse> {
  const response = await client.graphql({
    query: GET_UPLOAD_URL,
    variables: { fileName, contentType, segment, projectId },
  }) as GraphQLResult<GetUploadUrlResponse>;
  if (!response.data?.getUploadUrl) {
    throw new Error("Failed to get upload URL");
  }
  return response.data.getUploadUrl;
}

export async function getVideoUrl(key: string): Promise<VideoUrlResponse> {
  const response = await client.graphql({
    query: GET_VIDEO_URL,
    variables: { key },
  }) as GraphQLResult<GetVideoUrlResponse>;
  if (!response.data?.getVideoUrl) {
    throw new Error("Failed to get video URL");
  }
  return response.data.getVideoUrl;
}

// Meeting functions for Google Meet integration
export async function getMeeting(meetingId: string): Promise<Meeting | null> {
  const response = await client.graphql({
    query: GET_MEETING,
    variables: { meeting_id: meetingId },
  }) as GraphQLResult<GetMeetingResponse>;
  return response.data?.getMeeting ?? null;
}

export async function listMeetings(
  limit?: number,
  nextToken?: string,
  status?: MeetingStatus
): Promise<MeetingConnection> {
  const response = await client.graphql({
    query: LIST_MEETINGS,
    variables: { limit, nextToken, status },
  }) as GraphQLResult<ListMeetingsResponse>;
  return response.data?.listMeetings ?? { items: [], nextToken: null };
}

export async function createMeeting(input: CreateMeetingInput): Promise<Meeting> {
  const response = await client.graphql({
    query: CREATE_MEETING,
    variables: { input },
  }) as GraphQLResult<CreateMeetingResponse>;
  if (!response.data?.createMeeting) {
    throw new Error("Failed to create meeting");
  }
  return response.data.createMeeting;
}

export async function updateMeeting(input: UpdateMeetingInput): Promise<Meeting> {
  const response = await client.graphql({
    query: UPDATE_MEETING,
    variables: { input },
  }) as GraphQLResult<UpdateMeetingResponse>;
  if (!response.data?.updateMeeting) {
    throw new Error("Failed to update meeting");
  }
  return response.data.updateMeeting;
}

export async function deleteMeeting(meetingId: string): Promise<Meeting> {
  const response = await client.graphql({
    query: DELETE_MEETING,
    variables: { meeting_id: meetingId },
  }) as GraphQLResult<DeleteMeetingResponse>;
  if (!response.data?.deleteMeeting) {
    throw new Error("Failed to delete meeting");
  }
  return response.data.deleteMeeting;
}

export async function syncCalendar(input?: CalendarSyncInput): Promise<CalendarSyncResult> {
  const response = await client.graphql({
    query: SYNC_CALENDAR,
    variables: { input },
  }) as GraphQLResult<SyncCalendarResponse>;
  if (!response.data?.syncCalendar) {
    throw new Error("Failed to sync calendar");
  }
  return response.data.syncCalendar;
}

// Recording functions for Google Meet REST API v2
export async function syncMeetRecordings(input?: SyncMeetRecordingsInput): Promise<RecordingSyncResult> {
  const response = await client.graphql({
    query: SYNC_MEET_RECORDINGS,
    variables: { input },
  }) as GraphQLResult<SyncMeetRecordingsResponse>;
  if (!response.data?.syncMeetRecordings) {
    throw new Error("Failed to sync meet recordings");
  }
  return response.data.syncMeetRecordings;
}

export async function analyzeRecording(driveFileId: string, recordingName: string): Promise<Recording> {
  const response = await client.graphql({
    query: ANALYZE_RECORDING,
    variables: { drive_file_id: driveFileId, recording_name: recordingName },
  }) as GraphQLResult<AnalyzeRecordingResponse>;
  if (!response.data?.analyzeRecording) {
    throw new Error("Failed to analyze recording");
  }
  return response.data.analyzeRecording;
}

// 録画一覧取得（キャッシュから高速取得）
export async function listRecordings(status?: RecordingStatus): Promise<RecordingsConnection> {
  const response = await client.graphql({
    query: LIST_RECORDINGS,
    variables: { status },
  }) as GraphQLResult<ListRecordingsResponse>;
  return response.data?.listRecordings ?? { items: [], nextToken: null };
}

// Interview Project functions
export async function getInterviewProject(projectId: string): Promise<InterviewProject | null> {
  const response = await client.graphql({
    query: GET_INTERVIEW_PROJECT,
    variables: { project_id: projectId },
  }) as GraphQLResult<GetInterviewProjectResponse>;
  return response.data?.getInterviewProject ?? null;
}

export async function listInterviewProjects(
  limit?: number,
  nextToken?: string,
  status?: ProjectStatus
): Promise<InterviewProjectConnection> {
  const response = await client.graphql({
    query: LIST_INTERVIEW_PROJECTS,
    variables: { limit, nextToken, status },
  }) as GraphQLResult<ListInterviewProjectsResponse>;
  return response.data?.listInterviewProjects ?? { items: [], nextToken: null };
}

interface ListInterviewsByProjectResponse {
  listInterviewsByProject: InterviewConnection;
}

export async function listInterviewsByProject(
  projectId: string,
  limit?: number,
  nextToken?: string
): Promise<InterviewConnection> {
  const response = await client.graphql({
    query: LIST_INTERVIEWS_BY_PROJECT,
    variables: { project_id: projectId, limit, nextToken },
  }) as GraphQLResult<ListInterviewsByProjectResponse>;
  return response.data?.listInterviewsByProject ?? { items: [], nextToken: null };
}

export async function createInterviewProject(input: CreateInterviewProjectInput): Promise<InterviewProject> {
  const response = await client.graphql({
    query: CREATE_INTERVIEW_PROJECT,
    variables: { input },
  }) as GraphQLResult<CreateInterviewProjectResponse>;
  if (!response.data?.createInterviewProject) {
    throw new Error("Failed to create interview project");
  }
  return response.data.createInterviewProject;
}

export async function updateInterviewProject(input: UpdateInterviewProjectInput): Promise<InterviewProject> {
  const response = await client.graphql({
    query: UPDATE_INTERVIEW_PROJECT,
    variables: { input },
  }) as GraphQLResult<UpdateInterviewProjectResponse>;
  if (!response.data?.updateInterviewProject) {
    throw new Error("Failed to update interview project");
  }
  return response.data.updateInterviewProject;
}

export async function deleteInterviewProject(projectId: string): Promise<InterviewProject> {
  const response = await client.graphql({
    query: DELETE_INTERVIEW_PROJECT,
    variables: { project_id: projectId },
  }) as GraphQLResult<DeleteInterviewProjectResponse>;
  if (!response.data?.deleteInterviewProject) {
    throw new Error("Failed to delete interview project");
  }
  return response.data.deleteInterviewProject;
}
