import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => "/upload",
}));

// Mock next/link
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => {
    const { createElement } = require("react");
    return createElement("a", { href }, children);
  },
}));

// Mock auth context
vi.mock("../../lib/auth-context", () => ({
  useAuth: () => ({
    isAuthenticated: true,
    isLoading: false,
    getAccessToken: vi.fn().mockResolvedValue("mock-token"),
  }),
}));

// Mock graphql
vi.mock("../../lib/graphql", () => ({
  getUploadUrl: vi.fn().mockResolvedValue({
    uploadUrl: "https://mock-s3-url.com/upload",
    key: "mock-key-123",
  }),
}));
