export const UPDATE_INTERVIEW = /* GraphQL */ `
  mutation UpdateInterview($input: UpdateInterviewInput!) {
    updateInterview(input: $input) {
      interview_id
      segment
      created_at
      analysis_key
      transcript_key
      video_key
      diarization_key
      total_score
      user_id
    }
  }
`;

export const DELETE_INTERVIEW = /* GraphQL */ `
  mutation DeleteInterview($interview_id: ID!) {
    deleteInterview(interview_id: $interview_id) {
      interview_id
      segment
      created_at
      analysis_key
      transcript_key
      video_key
      diarization_key
      total_score
      user_id
    }
  }
`;

// Meeting mutations for Google Meet integration
export const CREATE_MEETING = /* GraphQL */ `
  mutation CreateMeeting($input: CreateMeetingInput!) {
    createMeeting(input: $input) {
      meeting_id
      user_id
      title
      description
      start_time
      end_time
      status
      google_calendar_event_id
      google_meet_space_id
      google_meet_uri
      auto_recording
      auto_transcription
      created_at
    }
  }
`;

export const UPDATE_MEETING = /* GraphQL */ `
  mutation UpdateMeeting($input: UpdateMeetingInput!) {
    updateMeeting(input: $input) {
      meeting_id
      user_id
      title
      description
      start_time
      end_time
      status
      google_calendar_event_id
      google_meet_space_id
      google_meet_uri
      auto_recording
      auto_transcription
      recording_file_id
      recording_s3_key
      interview_id
      updated_at
    }
  }
`;

export const DELETE_MEETING = /* GraphQL */ `
  mutation DeleteMeeting($meeting_id: ID!) {
    deleteMeeting(meeting_id: $meeting_id) {
      meeting_id
      title
    }
  }
`;

export const SYNC_CALENDAR = /* GraphQL */ `
  mutation SyncCalendar($input: SyncCalendarInput) {
    syncCalendar(input: $input) {
      success
      synced_count
      new_meetings {
        meeting_id
        title
        start_time
        end_time
        status
        google_meet_uri
      }
      updated_meetings {
        meeting_id
        title
        start_time
        end_time
        status
        google_meet_uri
      }
      error_message
    }
  }
`;
