import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock dependencies before importing component
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));

vi.mock("../../lib/auth-context", () => ({
  useAuth: () => ({
    isAuthenticated: true,
    isLoading: false,
    getAccessToken: vi.fn().mockResolvedValue("mock-token"),
  }),
}));

const mockGetUploadUrl = vi.fn().mockResolvedValue({
  uploadUrl: "https://mock-s3-url.com/upload",
  key: "mock-key-123",
});

vi.mock("../../lib/graphql", () => ({
  getUploadUrl: () => mockGetUploadUrl(),
}));

// Import component after mocks
import UploadPage from "./page";

/**
 * Creates a mock File object for testing
 */
function createMockFile(
  name: string,
  size: number,
  type: string
): File {
  const content = new Array(size).fill("a").join("");
  return new File([content], name, { type });
}

describe("UploadPage - Batch Upload Feature", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Multiple file selection", () => {
    it("should render upload page with dropzone", () => {
      render(<UploadPage />);
      expect(
        screen.getByText("ファイルをドロップまたはクリックして選択")
      ).toBeInTheDocument();
    });

    it("should allow multiple file input", () => {
      render(<UploadPage />);
      const fileInput = document.querySelector(
        'input[type="file"]'
      ) as HTMLInputElement;
      expect(fileInput).toHaveAttribute("multiple");
    });

    it("should display all selected files", async () => {
      render(<UploadPage />);
      const fileInput = document.querySelector(
        'input[type="file"]'
      ) as HTMLInputElement;

      const files = [
        createMockFile("video1.mp4", 1024, "video/mp4"),
        createMockFile("video2.mp4", 2048, "video/mp4"),
        createMockFile("video3.mp4", 3072, "video/mp4"),
      ];

      await userEvent.upload(fileInput, files);

      await waitFor(() => {
        expect(screen.getByText("video1.mp4")).toBeInTheDocument();
        expect(screen.getByText("video2.mp4")).toBeInTheDocument();
        expect(screen.getByText("video3.mp4")).toBeInTheDocument();
      });
    });

    it("should show file count when multiple files selected", async () => {
      render(<UploadPage />);
      const fileInput = document.querySelector(
        'input[type="file"]'
      ) as HTMLInputElement;

      const files = [
        createMockFile("video1.mp4", 1024, "video/mp4"),
        createMockFile("video2.mp4", 2048, "video/mp4"),
      ];

      await userEvent.upload(fileInput, files);

      await waitFor(() => {
        // Check for the file count in the header
        expect(screen.getByText("2ファイル選択済み")).toBeInTheDocument();
      });
    });
  });

  describe("File validation", () => {
    it("should reject files over 3GB", async () => {
      render(<UploadPage />);
      const fileInput = document.querySelector(
        'input[type="file"]'
      ) as HTMLInputElement;

      // Create a file object with size property mocked (avoid memory issues)
      const largeFile = new File([""], "large.mp4", { type: "video/mp4" });
      Object.defineProperty(largeFile, "size", {
        value: 4 * 1024 * 1024 * 1024, // 4GB
      });

      await userEvent.upload(fileInput, [largeFile]);

      await waitFor(() => {
        expect(
          screen.getByText(/3GB以下/i)
        ).toBeInTheDocument();
      });
    });

    it("should reject non-video files", async () => {
      render(<UploadPage />);
      const fileInput = document.querySelector(
        'input[type="file"]'
      ) as HTMLInputElement;

      const textFile = createMockFile("document.txt", 1024, "text/plain");

      await userEvent.upload(fileInput, [textFile]);

      await waitFor(() => {
        expect(
          screen.getByText(/MP4, MOV, AVI, WebM/i)
        ).toBeInTheDocument();
      });
    });

    it("should limit maximum files to 20", async () => {
      render(<UploadPage />);
      const fileInput = document.querySelector(
        'input[type="file"]'
      ) as HTMLInputElement;

      const files = Array.from({ length: 25 }, (_, i) =>
        createMockFile(`video${i}.mp4`, 1024, "video/mp4")
      );

      await userEvent.upload(fileInput, files);

      await waitFor(() => {
        expect(
          screen.getByText(/最大20ファイル/i)
        ).toBeInTheDocument();
      });
    });
  });

  describe("Individual file removal", () => {
    it("should allow removing individual files from the list", async () => {
      render(<UploadPage />);
      const fileInput = document.querySelector(
        'input[type="file"]'
      ) as HTMLInputElement;

      const files = [
        createMockFile("video1.mp4", 1024, "video/mp4"),
        createMockFile("video2.mp4", 2048, "video/mp4"),
      ];

      await userEvent.upload(fileInput, files);

      await waitFor(() => {
        expect(screen.getByText("video1.mp4")).toBeInTheDocument();
      });

      // Click remove button for first file (aria-label="削除")
      const removeButtons = screen.getAllByLabelText("削除");
      await userEvent.click(removeButtons[0]);

      await waitFor(() => {
        expect(screen.queryByText("video1.mp4")).not.toBeInTheDocument();
        expect(screen.getByText("video2.mp4")).toBeInTheDocument();
      });
    });
  });

  describe("Drag and drop multiple files", () => {
    it("should accept multiple files via drag and drop", async () => {
      render(<UploadPage />);
      const dropzone = screen.getByText(
        "ファイルをドロップまたはクリックして選択"
      ).closest("div.dropzone") || screen.getByText(
        "ファイルをドロップまたはクリックして選択"
      ).parentElement;

      const file1 = createMockFile("video1.mp4", 1024, "video/mp4");
      const file2 = createMockFile("video2.mp4", 2048, "video/mp4");

      // Create a proper DataTransfer mock
      const mockDataTransfer = {
        files: [file1, file2],
        items: [
          { kind: "file", type: file1.type, getAsFile: () => file1 },
          { kind: "file", type: file2.type, getAsFile: () => file2 },
        ],
        types: ["Files"],
      };

      // Add array-like properties to files
      Object.defineProperty(mockDataTransfer.files, "length", { value: 2 });
      Object.defineProperty(mockDataTransfer.files, "item", {
        value: (index: number) => [file1, file2][index],
      });

      fireEvent.drop(dropzone!, { dataTransfer: mockDataTransfer });

      await waitFor(() => {
        expect(screen.getByText("video1.mp4")).toBeInTheDocument();
        expect(screen.getByText("video2.mp4")).toBeInTheDocument();
      });
    });
  });

  describe("Batch upload progress", () => {
    it("should show progress for each file during upload", async () => {
      render(<UploadPage />);
      const fileInput = document.querySelector(
        'input[type="file"]'
      ) as HTMLInputElement;

      const files = [
        createMockFile("video1.mp4", 1024, "video/mp4"),
        createMockFile("video2.mp4", 2048, "video/mp4"),
      ];

      await userEvent.upload(fileInput, files);

      await waitFor(() => {
        expect(screen.getByText("video1.mp4")).toBeInTheDocument();
      });

      // Click upload button
      const uploadButton = screen.getByRole("button", {
        name: /アップロード開始/i,
      });
      await userEvent.click(uploadButton);

      // Progress bars should appear for each file
      await waitFor(() => {
        const progressBars = document.querySelectorAll('[class*="progressBar"]');
        expect(progressBars.length).toBeGreaterThanOrEqual(1);
      });
    });
  });
});
