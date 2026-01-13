/**
 * Layout for marketing pages (Server Component).
 * Uses HeaderStatic to avoid client-side auth dependencies.
 * Static/ISR caching, SEO-indexed.
 */
import HeaderStatic from "../../components/layout/HeaderStatic";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: "100vh",
        backgroundColor: "var(--background)",
      }}
    >
      <HeaderStatic />
      <main style={{ flex: 1 }}>{children}</main>
    </div>
  );
}
