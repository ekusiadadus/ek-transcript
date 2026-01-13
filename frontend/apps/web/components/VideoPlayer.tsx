"use client";

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from "react";
import { getVideoUrl } from "../lib/graphql";
import styles from "./VideoPlayer.module.css";

export interface VideoPlayerRef {
  seekTo: (seconds: number) => void;
  getCurrentTime: () => number;
  play: () => void;
  pause: () => void;
}

interface VideoPlayerProps {
  videoKey: string;
  onTimeUpdate?: (currentTime: number) => void;
  onSeeked?: (time: number) => void;
  initialTime?: number;
}

/**
 * VideoPlayer Component (v2.1)
 *
 * Video player with seek functionality for Evidence Jump.
 * Uses forwardRef to expose seek controls to parent components.
 */
export const VideoPlayer = forwardRef<VideoPlayerRef, VideoPlayerProps>(
  function VideoPlayer(
    { videoKey, onTimeUpdate, onSeeked, initialTime = 0 },
    ref
  ) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [videoUrl, setVideoUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isSeeking, setIsSeeking] = useState(false);

    // Expose methods to parent via ref
    useImperativeHandle(
      ref,
      () => ({
        seekTo: (seconds: number) => {
          if (videoRef.current) {
            setIsSeeking(true);
            videoRef.current.currentTime = seconds;
          }
        },
        getCurrentTime: () => {
          return videoRef.current?.currentTime ?? 0;
        },
        play: () => {
          videoRef.current?.play();
        },
        pause: () => {
          videoRef.current?.pause();
        },
      }),
      []
    );

    // Load video URL
    useEffect(() => {
      async function loadVideoUrl() {
        if (!videoKey) return;

        try {
          setLoading(true);
          setError(null);
          const response = await getVideoUrl(videoKey);
          setVideoUrl(response.videoUrl);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Failed to load video");
        } finally {
          setLoading(false);
        }
      }

      loadVideoUrl();
    }, [videoKey]);

    // Set initial time when video is loaded
    useEffect(() => {
      if (videoRef.current && initialTime > 0) {
        videoRef.current.currentTime = initialTime;
      }
    }, [initialTime, videoUrl]);

    // Handle time update
    const handleTimeUpdate = useCallback(() => {
      if (videoRef.current && onTimeUpdate) {
        onTimeUpdate(videoRef.current.currentTime);
      }
    }, [onTimeUpdate]);

    // Handle seek complete
    const handleSeeked = useCallback(() => {
      setIsSeeking(false);
      if (videoRef.current && onSeeked) {
        onSeeked(videoRef.current.currentTime);
      }
    }, [onSeeked]);

    if (loading) {
      return (
        <div className={styles.container}>
          <div className={styles.loading}>Loading video...</div>
        </div>
      );
    }

    if (error) {
      return (
        <div className={styles.container}>
          <div className={styles.error}>{error}</div>
        </div>
      );
    }

    if (!videoUrl) {
      return null;
    }

    return (
      <div className={styles.container}>
        <video
          ref={videoRef}
          className={styles.videoPlayer}
          controls
          preload="metadata"
          src={videoUrl}
          onTimeUpdate={handleTimeUpdate}
          onSeeked={handleSeeked}
        >
          Your browser does not support the video tag.
        </video>

        <div className={`${styles.seekingOverlay} ${isSeeking ? styles.visible : ""}`}>
          <div className={styles.seekingIndicator}>
            <span>⏳</span>
            <span>Seeking...</span>
          </div>
        </div>
      </div>
    );
  }
);

/**
 * Format seconds to mm:ss or hh:mm:ss
 */
export function formatVideoTime(seconds: number): string {
  if (seconds < 0 || !isFinite(seconds)) return "0:00";

  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}
