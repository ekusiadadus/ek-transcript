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

// Google OAuth mutations
export const CONNECT_GOOGLE = /* GraphQL */ `
  mutation ConnectGoogle($input: ConnectGoogleInput!) {
    connectGoogle(input: $input) {
      success
      email
      error_message
    }
  }
`;

export const DISCONNECT_GOOGLE = /* GraphQL */ `
  mutation DisconnectGoogle {
    disconnectGoogle {
      success
      email
      error_message
    }
  }
`;

// Recording mutations for Google Meet REST API v2
export const SYNC_MEET_RECORDINGS = /* GraphQL */ `
  mutation SyncMeetRecordings($input: SyncMeetRecordingsInput) {
    syncMeetRecordings(input: $input) {
      success
      conference_records_count
      recordings_found {
        recording_name
        conference_record
        space
        start_time
        end_time
        drive_file_id
        export_uri
        status
        meeting_id
        interview_id
      }
      recordings_downloaded {
        recording_name
        drive_file_id
        status
      }
      error_message
    }
  }
`;

export const ANALYZE_RECORDING = /* GraphQL */ `
  mutation AnalyzeRecording($drive_file_id: String!, $recording_name: String!) {
    analyzeRecording(drive_file_id: $drive_file_id, recording_name: $recording_name) {
      recording_name
      conference_record
      drive_file_id
      status
      interview_id
    }
  }
`;

// Interview Project mutations
export const CREATE_INTERVIEW_PROJECT = /* GraphQL */ `
  mutation CreateInterviewProject($input: CreateInterviewProjectInput!) {
    createInterviewProject(input: $input) {
      project_id
      user_id
      title
      description
      recruitment_criteria
      research_questions
      target_persona
      status
      interview_count
      created_at
      updated_at
    }
  }
`;

export const UPDATE_INTERVIEW_PROJECT = /* GraphQL */ `
  mutation UpdateInterviewProject($input: UpdateInterviewProjectInput!) {
    updateInterviewProject(input: $input) {
      project_id
      user_id
      title
      description
      recruitment_criteria
      research_questions
      target_persona
      status
      interview_count
      created_at
      updated_at
    }
  }
`;

export const DELETE_INTERVIEW_PROJECT = /* GraphQL */ `
  mutation DeleteInterviewProject($project_id: ID!) {
    deleteInterviewProject(project_id: $project_id) {
      project_id
      title
    }
  }
`;
