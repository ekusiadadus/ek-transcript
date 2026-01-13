"use client";

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from "react";
import { useS3Content } from "../lib/hooks/useS3Content";
import styles from "./TranscriptViewer.module.css";

interface TranscriptSegment {
  speaker: string;
  start: number;
  end: number;
  text: string;
}

export interface TranscriptViewerRef {
  scrollToIndex: (index: number) => void;
  scrollToTime: (seconds: number) => void;
  getSegmentAtTime: (seconds: number) => number;
}

interface TranscriptViewerProps {
  transcriptKey: string;
  highlightIndex?: number;
  currentTime?: number;
  syncEnabled?: boolean;
  onSegmentClick?: (segment: TranscriptSegment, index: number) => void;
  onTimestampClick?: (seconds: number) => void;
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function getSpeakerColor(speaker: string): string {
  const colors = [
    "var(--speaker-a)",
    "var(--speaker-b)",
    "var(--speaker-c)",
    "var(--speaker-d)",
  ] as const;
  // Simple hash to assign consistent colors
  const hash = speaker.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const index = hash % colors.length;
  return colors[index as 0 | 1 | 2 | 3];
}

/**
 * TranscriptViewer Component (v2.1)
 *
 * Displays transcript segments with highlight and sync support.
 * Uses forwardRef to expose scroll controls to parent components.
 */
export const TranscriptViewer = forwardRef<TranscriptViewerRef, TranscriptViewerProps>(
  function TranscriptViewer(
    {
      transcriptKey,
      highlightIndex = -1,
      currentTime = 0,
      syncEnabled = true,
      onSegmentClick,
      onTimestampClick,
    },
    ref
  ) {
    const listRef = useRef<HTMLDivElement>(null);
    const segmentRefs = useRef<(HTMLDivElement | null)[]>([]);
    const [activeIndex, setActiveIndex] = useState(-1);

    const { data, loading, error } = useS3Content<TranscriptSegment[]>(transcriptKey);

    // Find segment index at given time
    const getSegmentAtTime = useCallback(
      (seconds: number): number => {
        if (!data) return -1;
        return data.findIndex(
          (seg) => seconds >= seg.start && seconds < seg.end
        );
      },
      [data]
    );

    // Scroll to specific index
    const scrollToIndex = useCallback((index: number) => {
      const segmentEl = segmentRefs.current[index];
      if (segmentEl) {
        segmentEl.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }
    }, []);

    // Scroll to time (find segment and scroll)
    const scrollToTime = useCallback(
      (seconds: number) => {
        const index = getSegmentAtTime(seconds);
        if (index >= 0) {
          scrollToIndex(index);
        }
      },
      [getSegmentAtTime, scrollToIndex]
    );

    // Expose methods to parent via ref
    useImperativeHandle(
      ref,
      () => ({
        scrollToIndex,
        scrollToTime,
        getSegmentAtTime,
      }),
      [scrollToIndex, scrollToTime, getSegmentAtTime]
    );

    // Update active index based on currentTime (throttled)
    useEffect(() => {
      if (!syncEnabled || !data) return;

      const index = getSegmentAtTime(currentTime);
      if (index !== activeIndex && index >= 0) {
        setActiveIndex(index);
        scrollToIndex(index);
      }
    }, [currentTime, syncEnabled, data, getSegmentAtTime, activeIndex, scrollToIndex]);

    // Update active index from highlightIndex prop
    useEffect(() => {
      if (highlightIndex >= 0) {
        setActiveIndex(highlightIndex);
        scrollToIndex(highlightIndex);
      }
    }, [highlightIndex, scrollToIndex]);

    const handleSegmentClick = useCallback(
      (segment: TranscriptSegment, index: number) => {
        setActiveIndex(index);
        // Trigger video skip when segment is clicked
        if (onTimestampClick) {
          onTimestampClick(segment.start);
        }
        if (onSegmentClick) {
          onSegmentClick(segment, index);
        }
      },
      [onSegmentClick, onTimestampClick]
    );

    const handleTimestampClick = useCallback(
      (e: React.MouseEvent, seconds: number) => {
        e.stopPropagation();
        if (onTimestampClick) {
          onTimestampClick(seconds);
        }
      },
      [onTimestampClick]
    );

    if (loading) {
      return (
        <div className={styles.container}>
          <div className={styles.loading}>文字起こしを読み込み中...</div>
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

    if (!data || data.length === 0) {
      return (
        <div className={styles.container}>
          <div className={styles.empty}>文字起こしデータがありません</div>
        </div>
      );
    }

    return (
      <div className={styles.container}>
        <div ref={listRef} className={styles.transcriptList}>
          {data.map((segment, index) => (
            <div
              key={index}
              ref={(el) => { segmentRefs.current[index] = el; }}
              className={`${styles.segment} ${index === activeIndex ? styles.active : ""}`}
              onClick={() => handleSegmentClick(segment, index)}
            >
              <div className={styles.segmentHeader}>
                <span
                  className={styles.speaker}
                  style={{ backgroundColor: getSpeakerColor(segment.speaker) }}
                >
                  {segment.speaker}
                </span>
                <span
                  className={styles.timestamp}
                  onClick={(e) => handleTimestampClick(e, segment.start)}
                >
                  {formatTime(segment.start)} - {formatTime(segment.end)}
                </span>
              </div>
              <p className={styles.text}>{segment.text}</p>
            </div>
          ))}
        </div>
        <div className={styles.summary}>
          合計 {data.length} セグメント
        </div>
      </div>
    );
  }
);

// Keep the original export for backward compatibility
export default TranscriptViewer;
