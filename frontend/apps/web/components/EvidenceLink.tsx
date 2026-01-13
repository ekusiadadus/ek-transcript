"use client";

import { useState, useCallback } from "react";
import type { Evidence } from "../lib/graphql/types";
import { formatEvidenceTimeRange, isReliableEvidence } from "../lib/analysis-compute";
import styles from "./EvidenceLink.module.css";

interface EvidenceLinkProps {
  evidence: Evidence;
  alternativeEvidences?: Evidence[];
  onJump?: (evidence: Evidence) => void;
  onSearchAround?: (signalType: string) => void;
  isGoodSignal?: boolean;
}

/**
 * EvidenceLink Component (v2.1)
 *
 * Displays an evidence card with status-based styling.
 * Supports matched, weak, and missing states.
 */
export function EvidenceLink({
  evidence,
  alternativeEvidences = [],
  onJump,
  onSearchAround,
  isGoodSignal = true,
}: EvidenceLinkProps) {
  const [showCandidates, setShowCandidates] = useState(false);

  const handleClick = useCallback(() => {
    if (evidence.evidence_status !== "missing" && onJump) {
      onJump(evidence);
    }
  }, [evidence, onJump]);

  const handleCandidateClick = useCallback(
    (candidate: Evidence) => {
      if (onJump) {
        onJump(candidate);
      }
    },
    [onJump]
  );

  const handleSearchAround = useCallback(() => {
    if (onSearchAround) {
      onSearchAround(evidence.signal_type);
    }
  }, [evidence.signal_type, onSearchAround]);

  const statusClass = styles[evidence.evidence_status] ?? "";

  // Missing state
  if (evidence.evidence_status === "missing") {
    return (
      <div className={`${styles.evidenceCard} ${statusClass}`}>
        <div className={styles.header}>
          <span className={styles.signalLabel}>
            <span className={`${styles.signalIcon} ${isGoodSignal ? styles.good : styles.bad}`}>
              {isGoodSignal ? "✓" : "✗"}
            </span>
            {evidence.label}
          </span>
          <span className={`${styles.statusBadge} ${styles.missing}`}>missing</span>
        </div>
        <div className={styles.missingContent}>
          <span className={styles.missingIcon}>❓</span>
          <p className={styles.missingText}>
            根拠が特定できませんでした
            <br />
            この項目に該当する発言が見つかりませんでした
          </p>
          {onSearchAround && (
            <button className={styles.searchAroundButton} onClick={handleSearchAround}>
              周辺を探す →
            </button>
          )}
        </div>
      </div>
    );
  }

  // Matched or Weak state
  return (
    <div className={`${styles.evidenceCard} ${statusClass}`} onClick={handleClick}>
      <div className={styles.header}>
        <span className={styles.signalLabel}>
          <span className={`${styles.signalIcon} ${isGoodSignal ? styles.good : styles.bad}`}>
            {isGoodSignal ? "✓" : "⚠"}
          </span>
          {evidence.label}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {evidence.evidence_status === "weak" && (
            <span className={styles.confidenceMeter}>
              <span className={styles.confidenceBar}>
                <span
                  className={styles.confidenceFill}
                  style={{ width: `${evidence.confidence * 100}%` }}
                />
              </span>
              {Math.round(evidence.confidence * 100)}%
            </span>
          )}
          <span className={`${styles.statusBadge} ${statusClass}`}>
            {evidence.evidence_status}
          </span>
        </div>
      </div>

      <div className={styles.quoteSection}>
        <p className={styles.quoteText}>
          <span className={styles.quoteIcon}>📌</span>
          &quot;{evidence.quote}&quot;
        </p>
      </div>

      <div className={styles.metaRow}>
        <span className={styles.speakerTimestamp}>
          <span className={styles.speaker}>{evidence.speaker}</span>
          <span className={styles.timestamp}>@ {formatEvidenceTimeRange(evidence)}</span>
        </span>
        <span className={styles.jumpIcon}>→</span>
      </div>

      {/* Alternative candidates for weak evidence */}
      {evidence.evidence_status === "weak" && alternativeEvidences.length > 0 && (
        <div className={styles.candidateSection}>
          <button
            className={styles.candidateToggle}
            onClick={(e) => {
              e.stopPropagation();
              setShowCandidates(!showCandidates);
            }}
          >
            他の候補箇所（{alternativeEvidences.length}件）
            {showCandidates ? " ▲" : " ▼"}
          </button>

          {showCandidates && (
            <div className={styles.candidateList}>
              {alternativeEvidences.map((candidate, index) => (
                <div
                  key={index}
                  className={styles.candidateItem}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCandidateClick(candidate);
                  }}
                >
                  <span className={styles.candidateQuote}>
                    &quot;{candidate.quote}&quot;
                  </span>
                  <span className={styles.candidateMeta}>
                    {candidate.speaker} @ {formatEvidenceTimeRange(candidate)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * EvidenceStatusBadge - Standalone status badge component
 */
export function EvidenceStatusBadge({
  status,
  confidence,
}: {
  status: Evidence["evidence_status"];
  confidence?: number;
}) {
  const statusClass = styles[status] ?? "";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
      {status === "weak" && confidence !== undefined && (
        <span className={styles.confidenceMeter}>
          <span className={styles.confidenceBar}>
            <span
              className={styles.confidenceFill}
              style={{ width: `${confidence * 100}%` }}
            />
          </span>
          {Math.round(confidence * 100)}%
        </span>
      )}
      <span className={`${styles.statusBadge} ${statusClass}`}>{status}</span>
    </div>
  );
}
