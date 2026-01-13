/**
 * ProjectCreateForm Component Tests
 *
 * Tests for interview project creation form.
 *
 * Acceptance Criteria:
 * - Input fields for title, description, criteria, questions, persona
 * - Title is required
 * - Submit button calls onSubmit with form data
 * - Cancel button calls onCancel
 * - Form validation
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ProjectCreateForm } from "./ProjectCreateForm";

describe("ProjectCreateForm", () => {
  const mockOnSubmit = vi.fn();
  const mockOnCancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Form Fields", () => {
    it("should render title input field", () => {
      render(<ProjectCreateForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />);
      expect(screen.getByLabelText(/タイトル/)).toBeInTheDocument();
    });

    it("should render description textarea", () => {
      render(<ProjectCreateForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />);
      expect(screen.getByLabelText(/説明/)).toBeInTheDocument();
    });

    it("should render recruitment criteria input", () => {
      render(<ProjectCreateForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />);
      expect(screen.getByLabelText(/募集条件/)).toBeInTheDocument();
    });

    it("should render research questions input", () => {
      render(<ProjectCreateForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />);
      expect(screen.getByLabelText(/リサーチ課題/)).toBeInTheDocument();
    });

    it("should render target persona input", () => {
      render(<ProjectCreateForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />);
      expect(screen.getByLabelText(/ターゲットペルソナ/)).toBeInTheDocument();
    });
  });

  describe("Form Submission", () => {
    it("should call onSubmit with form data when submitted", async () => {
      const user = userEvent.setup();
      render(<ProjectCreateForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />);

      await user.type(screen.getByLabelText(/タイトル/), "テストプロジェクト");
      await user.type(screen.getByLabelText(/説明/), "プロジェクトの説明");
      await user.type(screen.getByLabelText(/募集条件/), "30代以上");
      await user.type(screen.getByLabelText(/リサーチ課題/), "仮説を検証する");
      await user.type(screen.getByLabelText(/ターゲットペルソナ/), "会社員");

      await user.click(screen.getByRole("button", { name: /作成/ }));

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith({
          title: "テストプロジェクト",
          description: "プロジェクトの説明",
          recruitment_criteria: "30代以上",
          research_questions: "仮説を検証する",
          target_persona: "会社員",
        });
      });
    });

    it("should require title field", async () => {
      const user = userEvent.setup();
      render(<ProjectCreateForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />);

      await user.click(screen.getByRole("button", { name: /作成/ }));

      // Should not call onSubmit
      expect(mockOnSubmit).not.toHaveBeenCalled();
    });

    it("should allow submission with only title", async () => {
      const user = userEvent.setup();
      render(<ProjectCreateForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />);

      await user.type(screen.getByLabelText(/タイトル/), "最小限のプロジェクト");
      await user.click(screen.getByRole("button", { name: /作成/ }));

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith({
          title: "最小限のプロジェクト",
          description: "",
          recruitment_criteria: "",
          research_questions: "",
          target_persona: "",
        });
      });
    });
  });

  describe("Cancel Action", () => {
    it("should call onCancel when cancel button is clicked", async () => {
      const user = userEvent.setup();
      render(<ProjectCreateForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />);

      await user.click(screen.getByRole("button", { name: /キャンセル/ }));

      expect(mockOnCancel).toHaveBeenCalled();
    });
  });

  describe("Loading State", () => {
    it("should disable submit button when loading", () => {
      render(
        <ProjectCreateForm
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          isLoading={true}
        />
      );

      const submitButton = screen.getByRole("button", { name: /作成/ });
      expect(submitButton).toBeDisabled();
    });

    it("should show loading text when loading", () => {
      render(
        <ProjectCreateForm
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          isLoading={true}
        />
      );

      expect(screen.getByText(/作成中/)).toBeInTheDocument();
    });
  });

  describe("Accessibility", () => {
    it("should have form role", () => {
      render(<ProjectCreateForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />);
      expect(screen.getByRole("form")).toBeInTheDocument();
    });

    it("should have accessible labels for all inputs", () => {
      render(<ProjectCreateForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />);

      const titleInput = screen.getByLabelText(/タイトル/);
      expect(titleInput).toHaveAttribute("id");

      const descInput = screen.getByLabelText(/説明/);
      expect(descInput).toHaveAttribute("id");
    });
  });
});
