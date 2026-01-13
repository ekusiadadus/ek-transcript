/**
 * Analysis Compute Tests (v2.1)
 *
 * Tests for Evidence processing functions.
 */

import { describe, it, expect } from "vitest";
import {
  getEvidencesBySignalType,
  getMatchedEvidences,
  getWeakEvidences,
  getMissingEvidences,
  normalizeEvidences,
  filterEvidencesByConfidence,
} from "./analysis-compute";
import type { Evidence, AnalysisSignalDetails } from "./graphql/types";

// Test fixtures
const createMockEvidence = (overrides: Partial<Evidence> = {}): Evidence => ({
  signal_type: "good_took_cost_action",
  label: "電力会社を切り替えた",
  transcript_index: 42,
  timestamp_start: 754.5,
  timestamp_end: 772.3,
  speaker: "話者A",
  quote: "去年、〇〇電力に切り替えて月2,000円くらい安くなった",
  confidence: 0.95,
  evidence_status: "matched",
  ...overrides,
});

describe("Evidence Processing Functions", () => {
  describe("getEvidencesBySignalType", () => {
    it("should filter evidences by signal type", () => {
      const evidences: Evidence[] = [
        createMockEvidence({ signal_type: "good_took_cost_action" }),
        createMockEvidence({ signal_type: "good_uses_app_weekly" }),
        createMockEvidence({ signal_type: "good_took_cost_action" }),
      ];

      const result = getEvidencesBySignalType(evidences, "good_took_cost_action");
      expect(result).toHaveLength(2);
      expect(result.every((e) => e.signal_type === "good_took_cost_action")).toBe(true);
    });

    it("should return empty array when no match", () => {
      const evidences: Evidence[] = [
        createMockEvidence({ signal_type: "good_took_cost_action" }),
      ];

      const result = getEvidencesBySignalType(evidences, "bad_no_past_action");
      expect(result).toHaveLength(0);
    });

    it("should handle empty array", () => {
      const result = getEvidencesBySignalType([], "good_took_cost_action");
      expect(result).toHaveLength(0);
    });
  });

  describe("getMatchedEvidences", () => {
    it("should return only matched evidences", () => {
      const evidences: Evidence[] = [
        createMockEvidence({ evidence_status: "matched" }),
        createMockEvidence({ evidence_status: "weak" }),
        createMockEvidence({ evidence_status: "missing" }),
        createMockEvidence({ evidence_status: "matched" }),
      ];

      const result = getMatchedEvidences(evidences);
      expect(result).toHaveLength(2);
      expect(result.every((e) => e.evidence_status === "matched")).toBe(true);
    });
  });

  describe("getWeakEvidences", () => {
    it("should return only weak evidences", () => {
      const evidences: Evidence[] = [
        createMockEvidence({ evidence_status: "matched", confidence: 0.95 }),
        createMockEvidence({ evidence_status: "weak", confidence: 0.45 }),
        createMockEvidence({ evidence_status: "weak", confidence: 0.60 }),
      ];

      const result = getWeakEvidences(evidences);
      expect(result).toHaveLength(2);
      expect(result.every((e) => e.evidence_status === "weak")).toBe(true);
    });
  });

  describe("getMissingEvidences", () => {
    it("should return only missing evidences", () => {
      const evidences: Evidence[] = [
        createMockEvidence({ evidence_status: "matched" }),
        createMockEvidence({ evidence_status: "missing", transcript_index: -1 }),
      ];

      const result = getMissingEvidences(evidences);
      expect(result).toHaveLength(1);
      expect(result[0]!.evidence_status).toBe("missing");
    });
  });

  describe("filterEvidencesByConfidence", () => {
    it("should filter evidences by minimum confidence", () => {
      const evidences: Evidence[] = [
        createMockEvidence({ confidence: 0.95 }),
        createMockEvidence({ confidence: 0.45 }),
        createMockEvidence({ confidence: 0.70 }),
        createMockEvidence({ confidence: 0.30 }),
      ];

      const result = filterEvidencesByConfidence(evidences, 0.7);
      expect(result).toHaveLength(2);
      expect(result.every((e) => e.confidence >= 0.7)).toBe(true);
    });

    it("should return all evidences when minConfidence is 0", () => {
      const evidences: Evidence[] = [
        createMockEvidence({ confidence: 0.95 }),
        createMockEvidence({ confidence: 0.0 }),
      ];

      const result = filterEvidencesByConfidence(evidences, 0);
      expect(result).toHaveLength(2);
    });
  });

  describe("normalizeEvidences", () => {
    it("should return evidences array when present", () => {
      const evidences: Evidence[] = [createMockEvidence()];
      const signalDetails: AnalysisSignalDetails = {
        good_took_cost_action: true,
        good_uses_app_weekly: false,
        good_has_crowdfunding_exp: false,
        good_would_replace_immediately: false,
        bad_no_past_action: false,
        bad_no_bill_check_6months: false,
        bad_device_barely_used: false,
        bad_said_will_consider: false,
        additional_good_signals: [],
        additional_bad_signals: [],
        evidences: evidences,
      };

      const result = normalizeEvidences(signalDetails);
      expect(result).toEqual(evidences);
    });

    it("should return empty array when evidences is undefined", () => {
      const signalDetails: AnalysisSignalDetails = {
        good_took_cost_action: true,
        good_uses_app_weekly: false,
        good_has_crowdfunding_exp: false,
        good_would_replace_immediately: false,
        bad_no_past_action: false,
        bad_no_bill_check_6months: false,
        bad_device_barely_used: false,
        bad_said_will_consider: false,
        additional_good_signals: [],
        additional_bad_signals: [],
        evidence: { "key": "value" }, // Legacy format
      };

      const result = normalizeEvidences(signalDetails);
      expect(result).toEqual([]);
    });

    it("should handle null signalDetails", () => {
      const result = normalizeEvidences(null);
      expect(result).toEqual([]);
    });

    it("should handle undefined signalDetails", () => {
      const result = normalizeEvidences(undefined);
      expect(result).toEqual([]);
    });
  });
});
