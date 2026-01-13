/**
 * VideoPlayer Component Tests (US-7, US-8)
 *
 * Tests for Video-Transcript Sync and Timestamp Navigation.
 *
 * Acceptance Criteria:
 * - US-7: Video player with playback controls
 * - US-8: Video seeks to clicked time (via ref)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { createRef } from "react";
import { VideoPlayer, VideoPlayerRef, formatVideoTime } from "./VideoPlayer";

// Mock the graphql module
vi.mock("../lib/graphql", () => ({
  getVideoUrl: vi.fn().mockResolvedValue({
    videoUrl: "https://example.com/video.mp4",
  }),
}));

describe("VideoPlayer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("US-7: Video Playback", () => {
    it("should render loading state initially", () => {
      render(<VideoPlayer videoKey="test-key" />);
      expect(screen.getByText("Loading video...")).toBeInTheDocument();
    });

    it("should render video element after loading", async () => {
      render(<VideoPlayer videoKey="test-key" />);

      await waitFor(() => {
        expect(screen.queryByText("Loading video...")).not.toBeInTheDocument();
      });

      const video = document.querySelector("video");
      expect(video).toBeInTheDocument();
      expect(video).toHaveAttribute("controls");
    });

    it("should call onTimeUpdate callback during playback", async () => {
      const onTimeUpdate = vi.fn();
      render(<VideoPlayer videoKey="test-key" onTimeUpdate={onTimeUpdate} />);

      await waitFor(() => {
        expect(document.querySelector("video")).toBeInTheDocument();
      });

      const video = document.querySelector("video") as HTMLVideoElement;
      Object.defineProperty(video, "currentTime", { value: 10.5 });
      video.dispatchEvent(new Event("timeupdate"));

      expect(onTimeUpdate).toHaveBeenCalledWith(10.5);
    });
  });

  describe("US-8: Timestamp Navigation via Ref", () => {
    it("should expose seekTo method via ref", async () => {
      const ref = createRef<VideoPlayerRef>();
      render(<VideoPlayer ref={ref} videoKey="test-key" />);

      await waitFor(() => {
        expect(document.querySelector("video")).toBeInTheDocument();
      });

      expect(ref.current).toBeDefined();
      expect(ref.current?.seekTo).toBeInstanceOf(Function);
    });

    it("should expose getCurrentTime method via ref", async () => {
      const ref = createRef<VideoPlayerRef>();
      render(<VideoPlayer ref={ref} videoKey="test-key" />);

      await waitFor(() => {
        expect(document.querySelector("video")).toBeInTheDocument();
      });

      expect(ref.current?.getCurrentTime).toBeInstanceOf(Function);
    });

    it("should expose play and pause methods via ref", async () => {
      const ref = createRef<VideoPlayerRef>();
      render(<VideoPlayer ref={ref} videoKey="test-key" />);

      await waitFor(() => {
        expect(document.querySelector("video")).toBeInTheDocument();
      });

      expect(ref.current?.play).toBeInstanceOf(Function);
      expect(ref.current?.pause).toBeInstanceOf(Function);
    });

    it("should call onSeeked callback when seek completes", async () => {
      const onSeeked = vi.fn();
      render(<VideoPlayer videoKey="test-key" onSeeked={onSeeked} />);

      await waitFor(() => {
        expect(document.querySelector("video")).toBeInTheDocument();
      });

      const video = document.querySelector("video") as HTMLVideoElement;
      Object.defineProperty(video, "currentTime", { value: 30 });
      video.dispatchEvent(new Event("seeked"));

      expect(onSeeked).toHaveBeenCalledWith(30);
    });
  });

  describe("formatVideoTime utility", () => {
    it("should format seconds to mm:ss", () => {
      expect(formatVideoTime(0)).toBe("0:00");
      expect(formatVideoTime(65)).toBe("1:05");
      expect(formatVideoTime(599)).toBe("9:59");
    });

    it("should format seconds to hh:mm:ss for long videos", () => {
      expect(formatVideoTime(3600)).toBe("1:00:00");
      expect(formatVideoTime(3661)).toBe("1:01:01");
      expect(formatVideoTime(7325)).toBe("2:02:05");
    });

    it("should handle edge cases", () => {
      expect(formatVideoTime(-1)).toBe("0:00");
      expect(formatVideoTime(Infinity)).toBe("0:00");
      expect(formatVideoTime(NaN)).toBe("0:00");
    });
  });

  describe("Error handling", () => {
    it("should display error when video fails to load", async () => {
      const { getVideoUrl } = await import("../lib/graphql");
      vi.mocked(getVideoUrl).mockRejectedValueOnce(new Error("Network error"));

      render(<VideoPlayer videoKey="test-key" />);

      await waitFor(() => {
        expect(screen.getByText("Network error")).toBeInTheDocument();
      });
    });
  });
});
