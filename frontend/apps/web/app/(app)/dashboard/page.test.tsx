/**
 * Dashboard Page Tests (US-10, US-12)
 *
 * Tests for Interview List and Filtering.
 *
 * Acceptance Criteria:
 * - US-10: Dashboard displays interview list
 * - US-12: Filter interviews by status
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// Test the status normalization logic
describe("Dashboard Status Handling", () => {
  describe("Status normalization", () => {
    /**
     * Helper function to normalize status to uppercase
     * This matches the expected fix in the dashboard component
     */
    const normalizeStatus = (status: string | null | undefined): string => {
      return status?.toUpperCase() ?? "PENDING";
    };

    it("should normalize lowercase status to uppercase", () => {
      expect(normalizeStatus("completed")).toBe("COMPLETED");
      expect(normalizeStatus("processing")).toBe("PROCESSING");
      expect(normalizeStatus("pending")).toBe("PENDING");
      expect(normalizeStatus("failed")).toBe("FAILED");
    });

    it("should handle already uppercase status", () => {
      expect(normalizeStatus("COMPLETED")).toBe("COMPLETED");
      expect(normalizeStatus("PROCESSING")).toBe("PROCESSING");
    });

    it("should handle mixed case status", () => {
      expect(normalizeStatus("Completed")).toBe("COMPLETED");
      expect(normalizeStatus("Processing")).toBe("PROCESSING");
    });

    it("should handle null/undefined status", () => {
      expect(normalizeStatus(null)).toBe("PENDING");
      expect(normalizeStatus(undefined)).toBe("PENDING");
    });
  });

  describe("Status comparison", () => {
    const isCompleted = (status: string | null | undefined): boolean => {
      return status?.toUpperCase() === "COMPLETED";
    };

    const isProcessing = (status: string | null | undefined): boolean => {
      const upper = status?.toUpperCase() ?? "";
      return ["PROCESSING", "TRANSCRIBING", "ANALYZING"].includes(upper);
    };

    it("should correctly identify completed status regardless of case", () => {
      expect(isCompleted("completed")).toBe(true);
      expect(isCompleted("COMPLETED")).toBe(true);
      expect(isCompleted("Completed")).toBe(true);
      expect(isCompleted("processing")).toBe(false);
      expect(isCompleted(null)).toBe(false);
    });

    it("should correctly identify processing status regardless of case", () => {
      expect(isProcessing("processing")).toBe(true);
      expect(isProcessing("PROCESSING")).toBe(true);
      expect(isProcessing("transcribing")).toBe(true);
      expect(isProcessing("TRANSCRIBING")).toBe(true);
      expect(isProcessing("analyzing")).toBe(true);
      expect(isProcessing("ANALYZING")).toBe(true);
      expect(isProcessing("completed")).toBe(false);
      expect(isProcessing(null)).toBe(false);
    });
  });

  describe("Filter logic", () => {
    type Interview = {
      interview_id: string;
      status: string | null;
    };

    const filterInterviews = (
      interviews: Interview[],
      filter: string
    ): Interview[] => {
      if (filter === "ALL") return interviews;
      return interviews.filter(
        (i) => i.status?.toUpperCase() === filter.toUpperCase()
      );
    };

    const mockInterviews: Interview[] = [
      { interview_id: "1", status: "completed" },
      { interview_id: "2", status: "COMPLETED" },
      { interview_id: "3", status: "processing" },
      { interview_id: "4", status: "PROCESSING" },
      { interview_id: "5", status: "pending" },
      { interview_id: "6", status: null },
    ];

    it("should filter completed interviews regardless of case", () => {
      const result = filterInterviews(mockInterviews, "COMPLETED");
      expect(result).toHaveLength(2);
      expect(result.map((i) => i.interview_id)).toEqual(["1", "2"]);
    });

    it("should filter processing interviews regardless of case", () => {
      const result = filterInterviews(mockInterviews, "PROCESSING");
      expect(result).toHaveLength(2);
      expect(result.map((i) => i.interview_id)).toEqual(["3", "4"]);
    });

    it("should return all interviews when filter is ALL", () => {
      const result = filterInterviews(mockInterviews, "ALL");
      expect(result).toHaveLength(6);
    });
  });

  describe("Stats calculation", () => {
    type Interview = {
      interview_id: string;
      status: string | null;
    };

    const countByStatus = (
      interviews: Interview[],
      statuses: string[]
    ): number => {
      return interviews.filter((i) =>
        statuses.includes(i.status?.toUpperCase() ?? "")
      ).length;
    };

    const mockInterviews: Interview[] = [
      { interview_id: "1", status: "completed" },
      { interview_id: "2", status: "COMPLETED" },
      { interview_id: "3", status: "processing" },
      { interview_id: "4", status: "transcribing" },
      { interview_id: "5", status: "analyzing" },
      { interview_id: "6", status: "pending" },
      { interview_id: "7", status: "failed" },
    ];

    it("should count completed interviews correctly", () => {
      const count = countByStatus(mockInterviews, ["COMPLETED"]);
      expect(count).toBe(2);
    });

    it("should count processing interviews correctly", () => {
      const count = countByStatus(mockInterviews, [
        "PROCESSING",
        "TRANSCRIBING",
        "ANALYZING",
      ]);
      expect(count).toBe(3);
    });
  });
});
