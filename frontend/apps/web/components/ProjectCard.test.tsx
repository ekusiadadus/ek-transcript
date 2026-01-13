/**
 * ProjectCard Component Tests
 *
 * Tests for interview project card display.
 *
 * Acceptance Criteria:
 * - Display project title and description
 * - Show recruitment criteria and target persona
 * - Display interview count
 * - Show project status
 * - Clickable card navigates to project detail/upload
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

// Import after mocks
import { ProjectCard } from "./ProjectCard";
import type { InterviewProject } from "../lib/graphql/types";

describe("ProjectCard", () => {
  const mockProject: InterviewProject = {
    project_id: "proj-123",
    user_id: "user-456",
    title: "電気代節約意識調査 2026年1月",
    description: "電気代に対する意識と実際の行動の乖離を検証する",
    recruitment_criteria: "30代以上、持ち家、電気代月1万円以上",
    research_questions: "省エネ意識が高い人は実際に行動しているか？",
    target_persona: "共働き世帯、子供あり",
    status: "ACTIVE",
    interview_count: 5,
    created_at: "2026-01-10T10:00:00Z",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Basic Display", () => {
    it("should display project title", () => {
      render(<ProjectCard project={mockProject} />);
      expect(screen.getByText("電気代節約意識調査 2026年1月")).toBeInTheDocument();
    });

    it("should display project description", () => {
      render(<ProjectCard project={mockProject} />);
      expect(
        screen.getByText("電気代に対する意識と実際の行動の乖離を検証する")
      ).toBeInTheDocument();
    });

    it("should display recruitment criteria", () => {
      render(<ProjectCard project={mockProject} />);
      expect(
        screen.getByText(/30代以上、持ち家、電気代月1万円以上/)
      ).toBeInTheDocument();
    });

    it("should display target persona", () => {
      render(<ProjectCard project={mockProject} />);
      expect(screen.getByText(/共働き世帯、子供あり/)).toBeInTheDocument();
    });
  });

  describe("Interview Count", () => {
    it("should display interview count", () => {
      render(<ProjectCard project={mockProject} />);
      expect(screen.getByText("5")).toBeInTheDocument();
      expect(screen.getByText(/インタビュー/)).toBeInTheDocument();
    });

    it("should display 0 when no interviews", () => {
      const projectNoInterviews = { ...mockProject, interview_count: 0 };
      render(<ProjectCard project={projectNoInterviews} />);
      expect(screen.getByText("0")).toBeInTheDocument();
    });

    it("should handle null interview count", () => {
      const projectNullCount = { ...mockProject, interview_count: null };
      render(<ProjectCard project={projectNullCount} />);
      expect(screen.getByText("0")).toBeInTheDocument();
    });
  });

  describe("Status Badge", () => {
    it("should display ACTIVE status in Japanese", () => {
      render(<ProjectCard project={mockProject} />);
      expect(screen.getByText("進行中")).toBeInTheDocument();
    });

    it("should display COMPLETED status", () => {
      const completedProject = { ...mockProject, status: "COMPLETED" as const };
      render(<ProjectCard project={completedProject} />);
      expect(screen.getByText("完了")).toBeInTheDocument();
    });

    it("should display ARCHIVED status", () => {
      const archivedProject = { ...mockProject, status: "ARCHIVED" as const };
      render(<ProjectCard project={archivedProject} />);
      expect(screen.getByText("アーカイブ")).toBeInTheDocument();
    });
  });

  describe("Date Display", () => {
    it("should display formatted creation date", () => {
      render(<ProjectCard project={mockProject} />);
      // Japanese date format
      expect(screen.getByText(/2026年1月10日/)).toBeInTheDocument();
    });
  });

  describe("Click Behavior", () => {
    it("should be clickable", () => {
      render(<ProjectCard project={mockProject} />);
      const card = screen.getByRole("button");
      expect(card).toBeInTheDocument();
    });

    it("should call onClick handler when clicked", () => {
      const onClick = vi.fn();
      render(<ProjectCard project={mockProject} onClick={onClick} />);
      const card = screen.getByRole("button");
      fireEvent.click(card);
      expect(onClick).toHaveBeenCalledWith(mockProject);
    });

    it("should support keyboard navigation", () => {
      render(<ProjectCard project={mockProject} />);
      const card = screen.getByRole("button");
      expect(card).toHaveAttribute("tabIndex", "0");
    });
  });

  describe("Empty States", () => {
    it("should handle missing description gracefully", () => {
      const projectNoDesc = { ...mockProject, description: null };
      render(<ProjectCard project={projectNoDesc} />);
      expect(screen.getByText("電気代節約意識調査 2026年1月")).toBeInTheDocument();
    });

    it("should handle missing recruitment criteria", () => {
      const projectNoCriteria = { ...mockProject, recruitment_criteria: null };
      render(<ProjectCard project={projectNoCriteria} />);
      expect(screen.getByText("電気代節約意識調査 2026年1月")).toBeInTheDocument();
    });

    it("should handle missing target persona", () => {
      const projectNoPersona = { ...mockProject, target_persona: null };
      render(<ProjectCard project={projectNoPersona} />);
      expect(screen.getByText("電気代節約意識調査 2026年1月")).toBeInTheDocument();
    });
  });

  describe("Accessibility", () => {
    it("should have accessible name", () => {
      render(<ProjectCard project={mockProject} />);
      const card = screen.getByRole("button");
      expect(card).toHaveAccessibleName();
    });
  });
});
