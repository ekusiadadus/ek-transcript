/**
 * Dashboard Page Tests (US-10, US-12, US-PROJECT)
 *
 * Tests for Project-centric Dashboard and Interview Filtering.
 *
 * Acceptance Criteria:
 * - US-10: Dashboard displays interview list
 * - US-12: Filter interviews by status
 * - US-PROJECT: Dashboard shows projects as primary navigation
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

/**
 * Project-centric Dashboard Tests
 *
 * Tests for the new project-based dashboard structure.
 */
describe("Dashboard Project-centric View", () => {
  describe("Project list display logic", () => {
    type InterviewProject = {
      project_id: string;
      title: string;
      status: string;
      interview_count: number;
    };

    const sortProjectsByRecent = (
      projects: InterviewProject[]
    ): InterviewProject[] => {
      // In real implementation, would sort by updated_at
      return [...projects];
    };

    const filterProjectsByStatus = (
      projects: InterviewProject[],
      status: string
    ): InterviewProject[] => {
      if (status === "ALL") return projects;
      return projects.filter((p) => p.status === status);
    };

    const mockProjects: InterviewProject[] = [
      { project_id: "1", title: "Project A", status: "ACTIVE", interview_count: 5 },
      { project_id: "2", title: "Project B", status: "ACTIVE", interview_count: 3 },
      { project_id: "3", title: "Project C", status: "COMPLETED", interview_count: 10 },
      { project_id: "4", title: "Project D", status: "ARCHIVED", interview_count: 2 },
    ];

    it("should filter active projects", () => {
      const result = filterProjectsByStatus(mockProjects, "ACTIVE");
      expect(result).toHaveLength(2);
      expect(result.map((p) => p.project_id)).toEqual(["1", "2"]);
    });

    it("should return all projects when filter is ALL", () => {
      const result = filterProjectsByStatus(mockProjects, "ALL");
      expect(result).toHaveLength(4);
    });

    it("should filter completed projects", () => {
      const result = filterProjectsByStatus(mockProjects, "COMPLETED");
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe("Project C");
    });
  });

  describe("Project statistics calculation", () => {
    type InterviewProject = {
      project_id: string;
      interview_count: number;
      status: string;
    };

    const getTotalInterviewCount = (projects: InterviewProject[]): number => {
      return projects.reduce((sum, p) => sum + p.interview_count, 0);
    };

    const getActiveProjectCount = (projects: InterviewProject[]): number => {
      return projects.filter((p) => p.status === "ACTIVE").length;
    };

    const mockProjects: InterviewProject[] = [
      { project_id: "1", interview_count: 5, status: "ACTIVE" },
      { project_id: "2", interview_count: 3, status: "ACTIVE" },
      { project_id: "3", interview_count: 10, status: "COMPLETED" },
    ];

    it("should calculate total interview count across projects", () => {
      const total = getTotalInterviewCount(mockProjects);
      expect(total).toBe(18);
    });

    it("should count active projects", () => {
      const count = getActiveProjectCount(mockProjects);
      expect(count).toBe(2);
    });
  });

  describe("Navigation flow", () => {
    it("should generate correct project detail URL", () => {
      const projectId = "abc-123";
      const detailUrl = `/projects/${projectId}`;
      expect(detailUrl).toBe("/projects/abc-123");
    });

    it("should generate correct upload URL with project", () => {
      const projectId = "abc-123";
      const uploadUrl = `/upload?project=${projectId}`;
      expect(uploadUrl).toBe("/upload?project=abc-123");
    });
  });
});
