/**
 * InterviewCard Component Tests
 *
 * Tests for rich interview card display with score, judgment, and segment info.
 *
 * Acceptance Criteria (US-10 enhanced):
 * - Display total score (0-30) with visual indicator
 * - Show judgment label based on score
 * - Display segment with color coding and label
 * - Show interview duration if available
 * - Display most impressive quote preview if available
 * - Status badge with appropriate styling
 * - Clickable card navigates to detail page
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
import { InterviewCard } from "./InterviewCard";
import type { Interview } from "../lib/graphql/types";

describe("InterviewCard", () => {
  const mockInterview: Interview = {
    interview_id: "test-123",
    segment: "A",
    created_at: "2026-01-13T10:00:00Z",
    status: "COMPLETED",
    total_score: 25,
    file_name: "interview_2026_01_13.mp4",
    file_size: 1024000,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Score Display", () => {
    it("should display total score", () => {
      render(<InterviewCard interview={mockInterview} />);
      expect(screen.getByText("25")).toBeInTheDocument();
      expect(screen.getByText("/30")).toBeInTheDocument();
    });

    it("should display score progress bar", () => {
      render(<InterviewCard interview={mockInterview} />);
      const progressBar = document.querySelector('[class*="scoreBar"]');
      expect(progressBar).toBeInTheDocument();
    });

    it("should handle null score gracefully", () => {
      const interviewNoScore = { ...mockInterview, total_score: null };
      render(<InterviewCard interview={interviewNoScore} />);
      expect(screen.getByText("-")).toBeInTheDocument();
    });
  });

  describe("Judgment Label", () => {
    it("should display '最優先ターゲット' for score >= 25", () => {
      const interview = { ...mockInterview, total_score: 25 };
      render(<InterviewCard interview={interview} />);
      expect(screen.getByText("最優先ターゲット")).toBeInTheDocument();
    });

    it("should display '有望ターゲット' for score 18-24", () => {
      const interview = { ...mockInterview, total_score: 20 };
      render(<InterviewCard interview={interview} />);
      expect(screen.getByText("有望ターゲット")).toBeInTheDocument();
    });

    it("should display '要検討' for score 12-17", () => {
      const interview = { ...mockInterview, total_score: 15 };
      render(<InterviewCard interview={interview} />);
      expect(screen.getByText("要検討")).toBeInTheDocument();
    });

    it("should display 'ターゲット外' for score < 12", () => {
      const interview = { ...mockInterview, total_score: 8 };
      render(<InterviewCard interview={interview} />);
      expect(screen.getByText("ターゲット外")).toBeInTheDocument();
    });
  });

  describe("Segment Display", () => {
    it("should display segment A with label '省エネ意識高'", () => {
      const interview = { ...mockInterview, segment: "A" };
      render(<InterviewCard interview={interview} />);
      expect(screen.getByText("A")).toBeInTheDocument();
      expect(screen.getByText("省エネ意識高")).toBeInTheDocument();
    });

    it("should display segment B with label 'ガジェット好き'", () => {
      const interview = { ...mockInterview, segment: "B" };
      render(<InterviewCard interview={interview} />);
      expect(screen.getByText("B")).toBeInTheDocument();
      expect(screen.getByText("ガジェット好き")).toBeInTheDocument();
    });

    it("should display segment C with label '便利さ追求'", () => {
      const interview = { ...mockInterview, segment: "C" };
      render(<InterviewCard interview={interview} />);
      expect(screen.getByText("C")).toBeInTheDocument();
      expect(screen.getByText("便利さ追求")).toBeInTheDocument();
    });

    it("should display segment D with label 'ライト層'", () => {
      const interview = { ...mockInterview, segment: "D" };
      render(<InterviewCard interview={interview} />);
      expect(screen.getByText("D")).toBeInTheDocument();
      expect(screen.getByText("ライト層")).toBeInTheDocument();
    });

    it("should apply segment-specific color class", () => {
      render(<InterviewCard interview={mockInterview} />);
      // The badge is the parent of the letter span
      const segmentBadge = screen.getByText("A").parentElement;
      expect(segmentBadge?.className).toMatch(/segmentA/);
    });
  });

  describe("Status Badge", () => {
    it("should display completed status in Japanese", () => {
      render(<InterviewCard interview={mockInterview} />);
      expect(screen.getByText("完了")).toBeInTheDocument();
    });

    it("should display processing status", () => {
      const processing = { ...mockInterview, status: "PROCESSING" };
      render(<InterviewCard interview={processing} />);
      expect(screen.getByText("処理中")).toBeInTheDocument();
    });

    it("should display progress bar for processing interviews", () => {
      const processing = { ...mockInterview, status: "PROCESSING", progress: 45 };
      render(<InterviewCard interview={processing} />);
      const progressBar = document.querySelector('[class*="processingProgress"]');
      expect(progressBar).toBeInTheDocument();
    });

    it("should display failed status", () => {
      const failed = { ...mockInterview, status: "FAILED" };
      render(<InterviewCard interview={failed} />);
      expect(screen.getByText("失敗")).toBeInTheDocument();
    });
  });

  describe("Interview Metadata", () => {
    it("should display formatted date", () => {
      render(<InterviewCard interview={mockInterview} />);
      // Japanese date format
      expect(screen.getByText(/2026年1月13日/)).toBeInTheDocument();
    });

    it("should display file name or fallback title", () => {
      render(<InterviewCard interview={mockInterview} />);
      expect(screen.getByText(/interview_2026_01_13/)).toBeInTheDocument();
    });

    it("should display truncated file name for long names", () => {
      const longName = {
        ...mockInterview,
        file_name: "very_long_interview_file_name_that_should_be_truncated_2026_01_13.mp4",
      };
      render(<InterviewCard interview={longName} />);
      // Should truncate with ellipsis
      const title = screen.getByRole("heading");
      expect(title.textContent?.length).toBeLessThanOrEqual(50);
    });
  });

  describe("Click Behavior", () => {
    it("should be clickable when completed", () => {
      render(<InterviewCard interview={mockInterview} />);
      const card = screen.getByRole("button");
      expect(card).toBeInTheDocument();
    });

    it("should not be clickable when processing", () => {
      const processing = { ...mockInterview, status: "PROCESSING" };
      render(<InterviewCard interview={processing} />);
      const card = document.querySelector('[class*="card"]');
      expect(card?.getAttribute("role")).not.toBe("button");
    });

    it("should call onClick handler when clicked", () => {
      const onClick = vi.fn();
      render(<InterviewCard interview={mockInterview} onClick={onClick} />);
      const card = screen.getByRole("button");
      fireEvent.click(card);
      expect(onClick).toHaveBeenCalledWith(mockInterview);
    });
  });

  describe("Visual Hierarchy", () => {
    it("should apply priority styling for high scores", () => {
      const highScore = { ...mockInterview, total_score: 28 };
      render(<InterviewCard interview={highScore} />);
      const card = document.querySelector('[class*="card"]');
      expect(card?.className).toMatch(/priority/);
    });

    it("should apply promising styling for medium-high scores", () => {
      const mediumScore = { ...mockInterview, total_score: 20 };
      render(<InterviewCard interview={mediumScore} />);
      const card = document.querySelector('[class*="card"]');
      expect(card?.className).toMatch(/promising/);
    });
  });

  describe("Accessibility", () => {
    it("should have accessible name", () => {
      render(<InterviewCard interview={mockInterview} />);
      const card = screen.getByRole("button");
      expect(card).toHaveAccessibleName();
    });

    it("should support keyboard navigation", () => {
      render(<InterviewCard interview={mockInterview} />);
      const card = screen.getByRole("button");
      expect(card).toHaveAttribute("tabIndex", "0");
    });
  });
});
