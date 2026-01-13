import type { Metadata } from "next";
import localFont from "next/font/local";
import { Providers } from "../lib/providers";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
});

const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_BASE_URL || "https://ek-transcript.example.com"
  ),
  title: {
    default: "EK Transcript",
    template: "%s | EK Transcript",
  },
  description:
    "高速・高品質なユーザーインタビュー分析ツール。The Mom Test原則に基づき、真の課題を発見。",
  openGraph: {
    type: "website",
    locale: "ja_JP",
    siteName: "EK Transcript",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
