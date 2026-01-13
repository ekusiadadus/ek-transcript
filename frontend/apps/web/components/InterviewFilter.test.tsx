/**
 * InterviewFilter Component Tests (v2.1)
 *
 * Tests for Dashboard filter and search functionality.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { InterviewFilter, type InterviewFilterState } from "./InterviewFilter";

describe("InterviewFilter", () => {
  const defaultFilters: InterviewFilterState = {
    productSegment: null,
    userSegment: null,
    reviewStatus: null,
    status: null,
    judgment: null,
    scoreMin: null,
    scoreMax: null,
    dateFrom: null,
    dateTo: null,
    keyword: "",
  };

  describe("Rendering", () => {
    it("should render filter component", () => {
      const onChange = vi.fn();
      render(<InterviewFilter filters={defaultFilters} onChange={onChange} />);

      expect(screen.getByRole("search")).toBeInTheDocument();
    });

    it("should render product segment filter", () => {
      const onChange = vi.fn();
      render(<InterviewFilter filters={defaultFilters} onChange={onChange} />);

      expect(screen.getByLabelText(/製品セグメント/i)).toBeInTheDocument();
    });

    it("should render user segment filter", () => {
      const onChange = vi.fn();
      render(<InterviewFilter filters={defaultFilters} onChange={onChange} />);

      expect(screen.getByLabelText(/ユーザーセグメント/i)).toBeInTheDocument();
    });

    it("should render review status filter", () => {
      const onChange = vi.fn();
      render(<InterviewFilter filters={defaultFilters} onChange={onChange} />);

      expect(screen.getByLabelText(/レビュー状態/i)).toBeInTheDocument();
    });

    it("should render status filter", () => {
      const onChange = vi.fn();
      render(<InterviewFilter filters={defaultFilters} onChange={onChange} />);

      expect(screen.getByLabelText(/処理状態/i)).toBeInTheDocument();
    });

    it("should render judgment filter", () => {
      const onChange = vi.fn();
      render(<InterviewFilter filters={defaultFilters} onChange={onChange} />);

      expect(screen.getByLabelText(/判定/i)).toBeInTheDocument();
    });

    it("should render keyword search input", () => {
      const onChange = vi.fn();
      render(<InterviewFilter filters={defaultFilters} onChange={onChange} />);

      expect(screen.getByPlaceholderText(/キーワード検索/i)).toBeInTheDocument();
    });

    it("should render score range inputs", () => {
      const onChange = vi.fn();
      render(<InterviewFilter filters={defaultFilters} onChange={onChange} />);

      expect(screen.getByLabelText(/スコア下限/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/スコア上限/i)).toBeInTheDocument();
    });
  });

  describe("Interactions", () => {
    it("should call onChange when product segment is selected", () => {
      const onChange = vi.fn();
      render(<InterviewFilter filters={defaultFilters} onChange={onChange} />);

      const select = screen.getByLabelText(/製品セグメント/i);
      fireEvent.change(select, { target: { value: "HEMS" } });

      expect(onChange).toHaveBeenCalledWith({
        ...defaultFilters,
        productSegment: "HEMS",
      });
    });

    it("should call onChange when user segment is selected", () => {
      const onChange = vi.fn();
      render(<InterviewFilter filters={defaultFilters} onChange={onChange} />);

      const select = screen.getByLabelText(/ユーザーセグメント/i);
      fireEvent.change(select, { target: { value: "A" } });

      expect(onChange).toHaveBeenCalledWith({
        ...defaultFilters,
        userSegment: "A",
      });
    });

    it("should call onChange when review status is selected", () => {
      const onChange = vi.fn();
      render(<InterviewFilter filters={defaultFilters} onChange={onChange} />);

      const select = screen.getByLabelText(/レビュー状態/i);
      fireEvent.change(select, { target: { value: "unreviewed" } });

      expect(onChange).toHaveBeenCalledWith({
        ...defaultFilters,
        reviewStatus: "unreviewed",
      });
    });

    it("should call onChange when keyword is entered", () => {
      const onChange = vi.fn();
      render(<InterviewFilter filters={defaultFilters} onChange={onChange} />);

      const input = screen.getByPlaceholderText(/キーワード検索/i);
      fireEvent.change(input, { target: { value: "テスト" } });

      expect(onChange).toHaveBeenCalledWith({
        ...defaultFilters,
        keyword: "テスト",
      });
    });

    it("should call onChange when score min is entered", () => {
      const onChange = vi.fn();
      render(<InterviewFilter filters={defaultFilters} onChange={onChange} />);

      const input = screen.getByLabelText(/スコア下限/i);
      fireEvent.change(input, { target: { value: "15" } });

      expect(onChange).toHaveBeenCalledWith({
        ...defaultFilters,
        scoreMin: 15,
      });
    });

    it("should call onChange when score max is entered", () => {
      const onChange = vi.fn();
      render(<InterviewFilter filters={defaultFilters} onChange={onChange} />);

      const input = screen.getByLabelText(/スコア上限/i);
      fireEvent.change(input, { target: { value: "25" } });

      expect(onChange).toHaveBeenCalledWith({
        ...defaultFilters,
        scoreMax: 25,
      });
    });
  });

  describe("Reset functionality", () => {
    it("should call onReset when reset button is clicked", () => {
      const onChange = vi.fn();
      const onReset = vi.fn();
      render(
        <InterviewFilter
          filters={defaultFilters}
          onChange={onChange}
          onReset={onReset}
        />
      );

      const resetButton = screen.getByRole("button", { name: /リセット/i });
      fireEvent.click(resetButton);

      expect(onReset).toHaveBeenCalled();
    });
  });

  describe("Active filter count", () => {
    it("should show active filter count when filters are applied", () => {
      const onChange = vi.fn();
      const filtersWithValues: InterviewFilterState = {
        ...defaultFilters,
        productSegment: "HEMS",
        userSegment: "A",
      };

      render(
        <InterviewFilter filters={filtersWithValues} onChange={onChange} />
      );

      expect(screen.getByText(/2件のフィルター適用中/i)).toBeInTheDocument();
    });

    it("should not show count when no filters are applied", () => {
      const onChange = vi.fn();
      render(<InterviewFilter filters={defaultFilters} onChange={onChange} />);

      expect(
        screen.queryByText(/件のフィルター適用中/i)
      ).not.toBeInTheDocument();
    });
  });

  describe("Collapsed mode", () => {
    it("should toggle expanded state when header is clicked", () => {
      const onChange = vi.fn();
      render(
        <InterviewFilter
          filters={defaultFilters}
          onChange={onChange}
          collapsible
        />
      );

      // Initially collapsed
      expect(
        screen.queryByLabelText(/製品セグメント/i)
      ).not.toBeInTheDocument();

      // Click to expand
      const header = screen.getByRole("button", { name: /フィルター/i });
      fireEvent.click(header);

      expect(screen.getByLabelText(/製品セグメント/i)).toBeInTheDocument();
    });
  });
});
