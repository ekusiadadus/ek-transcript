/**
 * Evidence Type Tests (v2.1)
 *
 * Tests for the new Evidence type structure with confidence and status.
 */

import { describe, it, expect } from "vitest";
import type {
  Evidence,
  EvidenceStatus,
  TranscriptSegment,
  ProductSegment,
  UserSegment,
  ReviewStatus,
} from "./types";

describe("Evidence Type", () => {
  describe("EvidenceStatus", () => {
    it("should accept 'matched' as valid status", () => {
      const status: EvidenceStatus = "matched";
      expect(status).toBe("matched");
    });

    it("should accept 'weak' as valid status", () => {
      const status: EvidenceStatus = "weak";
      expect(status).toBe("weak");
    });

    it("should accept 'missing' as valid status", () => {
      const status: EvidenceStatus = "missing";
      expect(status).toBe("missing");
    });
  });

  describe("Evidence structure", () => {
    it("should create a complete Evidence object", () => {
      const evidence: Evidence = {
        signal_type: "good_took_cost_action",
        label: "電力会社を切り替えた",
        transcript_index: 42,
        timestamp_start: 754.5,
        timestamp_end: 772.3,
        speaker: "話者A",
        quote: "去年、〇〇電力に切り替えて月2,000円くらい安くなった",
        confidence: 0.95,
        evidence_status: "matched",
      };

      expect(evidence.signal_type).toBe("good_took_cost_action");
      expect(evidence.transcript_index).toBe(42);
      expect(evidence.confidence).toBe(0.95);
      expect(evidence.evidence_status).toBe("matched");
    });

    it("should handle weak evidence with lower confidence", () => {
      const evidence: Evidence = {
        signal_type: "good_uses_app_weekly",
        label: "節電アプリを毎週使用",
        transcript_index: 15,
        timestamp_start: 525.0,
        timestamp_end: 542.0,
        speaker: "話者B",
        quote: "アプリは入れてるけど、たまに見るくらい...",
        confidence: 0.45,
        evidence_status: "weak",
      };

      expect(evidence.confidence).toBeLessThan(0.7);
      expect(evidence.evidence_status).toBe("weak");
    });

    it("should handle missing evidence", () => {
      const evidence: Evidence = {
        signal_type: "good_has_crowdfunding_exp",
        label: "クラウドファンディング経験あり",
        transcript_index: -1, // Not found
        timestamp_start: 0,
        timestamp_end: 0,
        speaker: "",
        quote: "",
        confidence: 0,
        evidence_status: "missing",
      };

      expect(evidence.transcript_index).toBe(-1);
      expect(evidence.confidence).toBe(0);
      expect(evidence.evidence_status).toBe("missing");
    });
  });
});

describe("TranscriptSegment Type", () => {
  it("should create a valid TranscriptSegment", () => {
    const segment: TranscriptSegment = {
      index: 0,
      start_sec: 0,
      end_sec: 15.5,
      speaker: "話者A",
      text: "こんにちは、本日はよろしくお願いします。",
    };

    expect(segment.index).toBe(0);
    expect(segment.start_sec).toBe(0);
    expect(segment.end_sec).toBe(15.5);
    expect(segment.speaker).toBe("話者A");
  });
});

describe("Segment Types (v2.1)", () => {
  describe("ProductSegment", () => {
    it("should accept all valid product segments", () => {
      const segments: ProductSegment[] = ["HEMS", "EV", "Solar", "Storage", "Other"];
      expect(segments).toHaveLength(5);
    });
  });

  describe("UserSegment", () => {
    it("should accept all valid user segments", () => {
      const segments: UserSegment[] = ["A", "B", "C", "D"];
      expect(segments).toHaveLength(4);
    });
  });
});

describe("ReviewStatus Type (v2.1)", () => {
  it("should accept 'unreviewed' status", () => {
    const status: ReviewStatus = "unreviewed";
    expect(status).toBe("unreviewed");
  });

  it("should accept 'reviewed' status", () => {
    const status: ReviewStatus = "reviewed";
    expect(status).toBe("reviewed");
  });
});
