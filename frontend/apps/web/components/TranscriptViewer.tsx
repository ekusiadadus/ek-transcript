"use client";

import { useS3Content } from "../lib/hooks/useS3Content";
import styles from "./TranscriptViewer.module.css";

interface TranscriptSegment {
  speaker: string;
  start: number;
  end: number;
  text: string;
}

interface TranscriptViewerProps {
  transcriptKey: string;
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

export function TranscriptViewer({ transcriptKey }: TranscriptViewerProps) {
  const { data, loading, error } = useS3Content<TranscriptSegment[]>(transcriptKey);

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
      <div className={styles.transcriptList}>
        {data.map((segment, index) => (
          <div key={index} className={styles.segment}>
            <div className={styles.segmentHeader}>
              <span
                className={styles.speaker}
                style={{ backgroundColor: getSpeakerColor(segment.speaker) }}
              >
                {segment.speaker}
              </span>
              <span className={styles.timestamp}>
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
