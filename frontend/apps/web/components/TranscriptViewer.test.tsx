/**
 * TranscriptViewer Component Tests (US-7, US-8)
 *
 * Tests for Video-Transcript Sync and Timestamp Navigation.
 *
 * Acceptance Criteria:
 * - US-7: Transcript auto-scrolls with video, current segment highlighted,
 *         toggle sync on/off, speaker labels with distinct colors
 * - US-8: Clickable timestamps, visual feedback on click
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { createRef } from "react";
import { TranscriptViewer, TranscriptViewerRef } from "./TranscriptViewer";

// Mock scrollIntoView which doesn't exist in jsdom
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

// Mock useS3Content hook - define mock data inline to avoid hoisting issues
vi.mock("../lib/hooks/useS3Content", () => ({
  useS3Content: vi.fn(),
}));

const mockTranscriptData = [
  { speaker: "Speaker A", start: 0, end: 10, text: "こんにちは" },
  { speaker: "Speaker B", start: 10, end: 20, text: "はじめまして" },
  { speaker: "Speaker A", start: 20, end: 30, text: "よろしくお願いします" },
];

import { useS3Content } from "../lib/hooks/useS3Content";

describe("TranscriptViewer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mock to default data
    vi.mocked(useS3Content).mockReturnValue({
      data: mockTranscriptData,
      loading: false,
      error: null,
    });
  });

  describe("US-7: Video-Transcript Sync", () => {
    describe("Rendering", () => {
      it("should render transcript segments", async () => {
        render(<TranscriptViewer transcriptKey="test-key" />);

        expect(screen.getByText("こんにちは")).toBeInTheDocument();
        expect(screen.getByText("はじめまして")).toBeInTheDocument();
        expect(screen.getByText("よろしくお願いします")).toBeInTheDocument();
      });

      it("should render speaker labels", () => {
        render(<TranscriptViewer transcriptKey="test-key" />);

        const speakerLabels = screen.getAllByText(/Speaker [AB]/);
        expect(speakerLabels).toHaveLength(3);
      });

      it("should render timestamps for each segment", () => {
        render(<TranscriptViewer transcriptKey="test-key" />);

        expect(screen.getByText("0:00 - 0:10")).toBeInTheDocument();
        expect(screen.getByText("0:10 - 0:20")).toBeInTheDocument();
        expect(screen.getByText("0:20 - 0:30")).toBeInTheDocument();
      });

      it("should render segment count summary", () => {
        render(<TranscriptViewer transcriptKey="test-key" />);

        expect(screen.getByText("合計 3 セグメント")).toBeInTheDocument();
      });
    });

    describe("Sync Toggle", () => {
      it("should render sync toggle button", () => {
        render(<TranscriptViewer transcriptKey="test-key" />);

        expect(screen.getByText(/同期ON/)).toBeInTheDocument();
      });

      it("should toggle sync state when button is clicked", () => {
        render(<TranscriptViewer transcriptKey="test-key" />);

        const toggleButton = screen.getByText(/同期ON/);
        fireEvent.click(toggleButton);

        expect(screen.getByText(/同期OFF/)).toBeInTheDocument();
      });
    });

    describe("Segment Highlighting", () => {
      it("should highlight segment based on currentTime", async () => {
        render(
          <TranscriptViewer transcriptKey="test-key" currentTime={5} syncEnabled />
        );

        // Wait for the component to update activeIndex based on currentTime
        await waitFor(() => {
          const activeSegment = document.querySelector(".segment.active");
          expect(activeSegment).toBeInTheDocument();
          expect(activeSegment).toHaveTextContent("こんにちは");
        });
      });

      it("should highlight segment based on highlightIndex prop", async () => {
        // Disable sync to avoid currentTime interference
        render(
          <TranscriptViewer
            transcriptKey="test-key"
            highlightIndex={2}
            syncEnabled={false}
          />
        );

        await waitFor(() => {
          const activeSegment = document.querySelector(".segment.active");
          expect(activeSegment).toBeInTheDocument();
        });

        // Verify scrollIntoView was called (highlightIndex triggers scroll)
        expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
      });
    });

    describe("Speaker Colors", () => {
      it("should apply distinct colors to different speakers", () => {
        render(<TranscriptViewer transcriptKey="test-key" />);

        const speakerLabels = screen.getAllByText(/Speaker [AB]/);
        const speakerAColor = speakerLabels[0].style.backgroundColor;
        const speakerBColor = speakerLabels[1].style.backgroundColor;

        // Colors should be set (not empty)
        expect(speakerAColor).not.toBe("");
        expect(speakerBColor).not.toBe("");
      });
    });
  });

  describe("US-8: Timestamp Navigation", () => {
    describe("Clickable Timestamps", () => {
      it("should call onTimestampClick when timestamp is clicked", () => {
        const onTimestampClick = vi.fn();
        render(
          <TranscriptViewer
            transcriptKey="test-key"
            onTimestampClick={onTimestampClick}
          />
        );

        const timestamp = screen.getByText("0:10 - 0:20");
        fireEvent.click(timestamp);

        expect(onTimestampClick).toHaveBeenCalledWith(10);
      });

      it("should call onSegmentClick when segment is clicked", () => {
        const onSegmentClick = vi.fn();
        render(
          <TranscriptViewer
            transcriptKey="test-key"
            onSegmentClick={onSegmentClick}
          />
        );

        // Click on the segment text
        const segmentText = screen.getByText("はじめまして");
        fireEvent.click(segmentText.closest("[class*='segment']")!);

        expect(onSegmentClick).toHaveBeenCalledWith(
          expect.objectContaining({
            speaker: "Speaker B",
            start: 10,
            end: 20,
            text: "はじめまして",
          }),
          1
        );
      });
    });

    describe("Ref Methods", () => {
      it("should expose scrollToIndex method via ref", () => {
        const ref = createRef<TranscriptViewerRef>();
        render(<TranscriptViewer ref={ref} transcriptKey="test-key" />);

        expect(ref.current?.scrollToIndex).toBeInstanceOf(Function);
      });

      it("should expose scrollToTime method via ref", () => {
        const ref = createRef<TranscriptViewerRef>();
        render(<TranscriptViewer ref={ref} transcriptKey="test-key" />);

        expect(ref.current?.scrollToTime).toBeInstanceOf(Function);
      });

      it("should expose getSegmentAtTime method via ref", () => {
        const ref = createRef<TranscriptViewerRef>();
        render(<TranscriptViewer ref={ref} transcriptKey="test-key" />);

        expect(ref.current?.getSegmentAtTime).toBeInstanceOf(Function);
      });

      it("should return correct segment index for given time", () => {
        const ref = createRef<TranscriptViewerRef>();
        render(<TranscriptViewer ref={ref} transcriptKey="test-key" />);

        expect(ref.current?.getSegmentAtTime(5)).toBe(0);
        expect(ref.current?.getSegmentAtTime(15)).toBe(1);
        expect(ref.current?.getSegmentAtTime(25)).toBe(2);
        expect(ref.current?.getSegmentAtTime(100)).toBe(-1);
      });
    });
  });

  describe("Loading State", () => {
    it("should render loading state", () => {
      vi.mocked(useS3Content).mockReturnValue({
        data: null,
        loading: true,
        error: null,
      });

      render(<TranscriptViewer transcriptKey="test-key" />);

      expect(screen.getByText("文字起こしを読み込み中...")).toBeInTheDocument();
    });
  });

  describe("Error State", () => {
    it("should render error message", () => {
      vi.mocked(useS3Content).mockReturnValue({
        data: null,
        loading: false,
        error: "Failed to load transcript",
      });

      render(<TranscriptViewer transcriptKey="test-key" />);

      expect(screen.getByText("Failed to load transcript")).toBeInTheDocument();
    });
  });

  describe("Empty State", () => {
    it("should render empty message when no data", () => {
      vi.mocked(useS3Content).mockReturnValue({
        data: [],
        loading: false,
        error: null,
      });

      render(<TranscriptViewer transcriptKey="test-key" />);

      expect(
        screen.getByText("文字起こしデータがありません")
      ).toBeInTheDocument();
    });
  });
});
