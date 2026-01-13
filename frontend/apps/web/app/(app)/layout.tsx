/**
 * Layout for app pages (authenticated area).
 * force-dynamic ensures user-specific pages are never cached (no-store policy).
 * noindex for search engines.
 */
import type { Metadata } from "next";
import Header from "../../components/layout/Header";

// Enforce dynamic rendering for all app pages (no-store policy)
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: {
    default: "Dashboard",
    template: "%s | EK Transcript",
  },
  robots: {
    index: false,
    follow: false,
    nosnippet: true,
  },
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: "100vh",
        backgroundColor: "var(--background)",
      }}
    >
      <Header />
      <main style={{ flex: 1 }}>{children}</main>
    </div>
  );
}
