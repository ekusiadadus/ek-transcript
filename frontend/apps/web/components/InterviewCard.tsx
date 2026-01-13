"use client";

/**
 * InterviewCard Component
 *
 * Rich interview card with score, judgment label, and segment display.
 * Provides visual hierarchy based on interview quality/priority.
 */

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import type { Interview, Segment, JudgmentLabel } from "../lib/graphql/types";
import { computeJudgmentLabel, getSegmentLabel } from "../lib/analysis-compute";
import styles from "./InterviewCard.module.css";

interface InterviewCardProps {
  interview: Interview;
  onClick?: (interview: Interview) => void;
}

const STATUS_LABELS: Record<string, string> = {
  COMPLETED: "完了",
  PROCESSING: "処理中",
  PENDING: "待機中",
  FAILED: "失敗",
  TRANSCRIBING: "文字起こし中",
  ANALYZING: "分析中",
};

/**
 * Get judgment label from total score.
 * Re-exported from analysis-compute for consistency.
 */
function getJudgmentLabel(score: number | null | undefined): JudgmentLabel | null {
  if (score === null || score === undefined) return null;
  return computeJudgmentLabel(score);
}

/**
 * Get visual priority class based on judgment.
 */
function getPriorityClass(judgment: JudgmentLabel | null): string {
  switch (judgment) {
    case "最優先ターゲット":
      return styles.priority;
    case "有望ターゲット":
      return styles.promising;
    case "要検討":
      return styles.review;
    case "ターゲット外":
      return styles.outside;
    default:
      return "";
  }
}

/**
 * Check if segment is a user segment (A/B/C/D).
 */
function isUserSegment(segment: string): segment is Segment {
  return ["A", "B", "C", "D"].includes(segment);
}

/**
 * Get segment color class.
 */
function getSegmentClass(segment: string): string {
  switch (segment) {
    case "A":
      return styles.segmentA;
    case "B":
      return styles.segmentB;
    case "C":
      return styles.segmentC;
    case "D":
      return styles.segmentD;
    default:
      return styles.segmentProduct;
  }
}

/**
 * Format date to Japanese locale.
 */
function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Truncate text with ellipsis.
 */
function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + "...";
}

/**
 * Normalize status to uppercase.
 */
function normalizeStatus(status: string | null | undefined): string {
  return status?.toUpperCase() ?? "PENDING";
}

export function InterviewCard({ interview, onClick }: InterviewCardProps) {
  const router = useRouter();
  const status = normalizeStatus(interview.status);
  const isCompleted = status === "COMPLETED";
  const isProcessing = ["PROCESSING", "TRANSCRIBING", "ANALYZING"].includes(status);
  const isFailed = status === "FAILED";

  const judgment = getJudgmentLabel(interview.total_score);
  const rawSegment = interview.segment || "D";
  const isUserSeg = isUserSegment(rawSegment);
  const segment = isUserSeg ? rawSegment : "D";
  const segmentLabel = isUserSeg ? getSegmentLabel(segment) : rawSegment;

  const handleClick = useCallback(() => {
    if (isCompleted) {
      if (onClick) {
        onClick(interview);
      } else {
        router.push(`/interview/${interview.interview_id}`);
      }
    }
  }, [isCompleted, onClick, interview, router]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleClick();
      }
    },
    [handleClick]
  );

  // Title: use file_name or fallback
  const title = interview.file_name
    ? truncateText(interview.file_name.replace(/\.[^/.]+$/, ""), 45)
    : `Interview ${interview.interview_id.slice(0, 8)}`;

  return (
    <article
      className={`${styles.card} ${isCompleted ? styles.clickable : ""} ${getPriorityClass(judgment)}`}
      onClick={isCompleted ? handleClick : undefined}
      onKeyDown={isCompleted ? handleKeyDown : undefined}
      role={isCompleted ? "button" : undefined}
      tabIndex={isCompleted ? 0 : undefined}
      aria-label={`${title} - ${judgment || "未分析"} - セグメント${segment}`}
    >
      {/* Header: Title and Status */}
      <header className={styles.header}>
        <h3 className={styles.title}>{title}</h3>
        <span className={`${styles.statusBadge} ${styles[`status${status}`]}`}>
          {STATUS_LABELS[status] || status}
        </span>
      </header>

      {/* Main Content */}
      <div className={styles.content}>
        {/* Left: Score and Judgment */}
        <div className={styles.scoreSection}>
          <div className={styles.scoreDisplay}>
            <span className={styles.scoreValue}>
              {interview.total_score !== null && interview.total_score !== undefined
                ? interview.total_score
                : "-"}
            </span>
            <span className={styles.scoreMax}>/30</span>
          </div>
          <div className={styles.scoreBar}>
            <div
              className={styles.scoreBarFill}
              style={{
                width: `${((interview.total_score ?? 0) / 30) * 100}%`,
              }}
            />
          </div>
          {judgment && (
            <span className={`${styles.judgmentLabel} ${styles[`judgment${judgment.replace(/[^a-zA-Z]/g, "")}`]}`}>
              {judgment}
            </span>
          )}
        </div>

        {/* Right: Segment */}
        <div className={styles.segmentSection}>
          <div className={`${styles.segmentBadge} ${getSegmentClass(rawSegment)}`}>
            <span className={styles.segmentLetter}>
              {isUserSeg ? rawSegment : rawSegment.charAt(0)}
            </span>
          </div>
          <span className={styles.segmentLabel}>{segmentLabel}</span>
        </div>
      </div>

      {/* Processing Progress */}
      {isProcessing && interview.progress !== undefined && interview.progress !== null && (
        <div className={styles.processingProgress}>
          <div className={styles.progressBar}>
            <div
              className={styles.progressFill}
              style={{ width: `${interview.progress}%` }}
            />
          </div>
          <span className={styles.progressText}>{interview.progress}%</span>
        </div>
      )}

      {/* Failed State */}
      {isFailed && interview.error_message && (
        <div className={styles.errorMessage}>
          {truncateText(interview.error_message, 60)}
        </div>
      )}

      {/* Footer: Metadata */}
      <footer className={styles.footer}>
        <span className={styles.date}>{formatDate(interview.created_at)}</span>
        {isCompleted && (
          <span className={styles.viewLink}>詳細を見る →</span>
        )}
      </footer>
    </article>
  );
}

export default InterviewCard;
