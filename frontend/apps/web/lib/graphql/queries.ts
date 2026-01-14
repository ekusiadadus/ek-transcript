export const GET_INTERVIEW = /* GraphQL */ `
  query GetInterview($interview_id: ID!) {
    getInterview(interview_id: $interview_id) {
      interview_id
      segment
      created_at
      status
      progress
      current_step
      error_message
      analysis_key
      transcript_key
      video_key
      diarization_key
      total_score
      user_id
      file_name
      file_size
      execution_arn
      updated_at
    }
  }
`;

export const LIST_INTERVIEWS = /* GraphQL */ `
  query ListInterviews($limit: Int, $nextToken: String) {
    listInterviews(limit: $limit, nextToken: $nextToken) {
      items {
        interview_id
        segment
        created_at
        status
        progress
        current_step
        error_message
        analysis_key
        transcript_key
        video_key
        diarization_key
        total_score
        user_id
        file_name
      }
      nextToken
    }
  }
`;

// NOTE: project_id will be added after CDK deployment
// export const LIST_INTERVIEWS_WITH_PROJECT = /* GraphQL */ `
//   query ListInterviews($limit: Int, $nextToken: String) {
//     listInterviews(limit: $limit, nextToken: $nextToken) {
//       items {
//         interview_id
//         project_id
//         ...
//       }
//     }
//   }
// `;

export const LIST_INTERVIEWS_BY_SEGMENT = /* GraphQL */ `
  query ListInterviewsBySegment(
    $segment: String!
    $limit: Int
    $nextToken: String
  ) {
    listInterviewsBySegment(
      segment: $segment
      limit: $limit
      nextToken: $nextToken
    ) {
      items {
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
      nextToken
    }
  }
`;

export const GET_UPLOAD_URL = /* GraphQL */ `
  query GetUploadUrl($fileName: String!, $contentType: String, $segment: String, $projectId: ID) {
    getUploadUrl(fileName: $fileName, contentType: $contentType, segment: $segment, projectId: $projectId) {
      uploadUrl
      key
      expiresIn
    }
  }
`;

export const GET_VIDEO_URL = /* GraphQL */ `
  query GetVideoUrl($key: String!) {
    getVideoUrl(key: $key) {
      videoUrl
      expiresIn
    }
  }
`;

// Meeting queries for Google Meet integration
export const GET_MEETING = /* GraphQL */ `
  query GetMeeting($meeting_id: ID!) {
    getMeeting(meeting_id: $meeting_id) {
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
      created_at
      updated_at
    }
  }
`;

export const LIST_MEETINGS = /* GraphQL */ `
  query ListMeetings($limit: Int, $nextToken: String, $status: MeetingStatus) {
    listMeetings(limit: $limit, nextToken: $nextToken, status: $status) {
      items {
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
        created_at
        updated_at
      }
      nextToken
    }
  }
`;

// Google OAuth queries
export const GET_GOOGLE_AUTH_URL = /* GraphQL */ `
  query GetGoogleAuthUrl($redirect_uri: String!) {
    getGoogleAuthUrl(redirect_uri: $redirect_uri) {
      auth_url
      state
    }
  }
`;

export const GET_GOOGLE_CONNECTION_STATUS = /* GraphQL */ `
  query GetGoogleConnectionStatus {
    getGoogleConnectionStatus {
      connected
      email
      scopes
      expires_at
      is_expired
    }
  }
`;

// Recordings cache query (高速取得)
export const LIST_RECORDINGS = /* GraphQL */ `
  query ListRecordings($status: RecordingStatus) {
    listRecordings(status: $status) {
      items {
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
      nextToken
    }
  }
`;

// Interview Project queries
export const GET_INTERVIEW_PROJECT = /* GraphQL */ `
  query GetInterviewProject($project_id: ID!) {
    getInterviewProject(project_id: $project_id) {
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

export const LIST_INTERVIEW_PROJECTS = /* GraphQL */ `
  query ListInterviewProjects($limit: Int, $nextToken: String, $status: ProjectStatus) {
    listInterviewProjects(limit: $limit, nextToken: $nextToken, status: $status) {
      items {
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
      nextToken
    }
  }
`;

export const LIST_INTERVIEWS_BY_PROJECT = /* GraphQL */ `
  query ListInterviewsByProject($project_id: ID!, $limit: Int, $nextToken: String) {
    listInterviewsByProject(project_id: $project_id, limit: $limit, nextToken: $nextToken) {
      items {
        interview_id
        project_id
        segment
        created_at
        status
        progress
        current_step
        error_message
        analysis_key
        transcript_key
        video_key
        diarization_key
        total_score
        user_id
        file_name
      }
      nextToken
    }
  }
`;
