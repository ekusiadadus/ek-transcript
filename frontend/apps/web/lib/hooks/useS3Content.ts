"use client";

import { useState, useEffect } from "react";
import { getVideoUrl } from "../graphql";

interface UseS3ContentResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useS3Content<T = unknown>(s3Key: string | null | undefined): UseS3ContentResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchCount, setFetchCount] = useState(0);

  useEffect(() => {
    if (!s3Key) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }

    // Capture the key to satisfy TypeScript in async context
    const key = s3Key;

    async function fetchContent() {
      setLoading(true);
      setError(null);

      try {
        // Get presigned URL using existing getVideoUrl (works for any S3 key)
        const { videoUrl } = await getVideoUrl(key);

        // Fetch the actual content
        const response = await fetch(videoUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch content: ${response.status}`);
        }

        const content = await response.json();
        setData(content as T);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load content");
        setData(null);
      } finally {
        setLoading(false);
      }
    }

    fetchContent();
  }, [s3Key, fetchCount]);

  const refetch = () => setFetchCount((c) => c + 1);

  return { data, loading, error, refetch };
}
