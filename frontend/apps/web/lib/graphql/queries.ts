export const GET_INTERVIEW = /* GraphQL */ `
  query GetInterview($interview_id: ID!) {
    getInterview(interview_id: $interview_id) {
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

export const LIST_INTERVIEWS = /* GraphQL */ `
  query ListInterviews($limit: Int, $nextToken: String) {
    listInterviews(limit: $limit, nextToken: $nextToken) {
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
  query GetUploadUrl($fileName: String!, $contentType: String, $segment: String) {
    getUploadUrl(fileName: $fileName, contentType: $contentType, segment: $segment) {
      uploadUrl
      key
      expiresIn
    }
  }
`;
