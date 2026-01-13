/**
 * Landing page for EK Transcript.
 * Static page, SEO-indexed.
 */
import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "EK Transcript - 高速・高品質なユーザーインタビュー分析",
  description:
    "The Mom Test原則に基づいたユーザーインタビュー分析ツール。動画アップロードから数分で深掘り分析結果を取得。",
};

export default function LandingPage() {
  return (
    <div className={styles.page}>
      {/* Hero Section */}
      <section className={styles.hero}>
        <div className={styles.heroContent}>
          <h1 className={styles.heroTitle}>
            ユーザーインタビューを
            <br />
            <span className={styles.heroHighlight}>徹底的に深掘り</span>
          </h1>
          <p className={styles.heroDescription}>
            高速・高品質なインタビュー分析ツール。
            <br />
            実体験、数値、責任者、部署、過去の体験を自動抽出。
          </p>
          <div className={styles.heroCta}>
            <Link href="/dashboard" className={styles.ctaButton}>
              今すぐ始める
            </Link>
          </div>
        </div>
        <div className={styles.heroImage}>
          <Image
            src="/characters/woman1.svg"
            alt="Interview Analysis"
            width={400}
            height={400}
            priority
          />
        </div>
      </section>

      {/* Features Section */}
      <section className={styles.features}>
        <h2 className={styles.sectionTitle}>主な機能</h2>
        <div className={styles.featureGrid}>
          <div className={styles.featureCard}>
            <div className={styles.featureIcon}>📅</div>
            <h3 className={styles.featureTitle}>Google Calendar連携</h3>
            <p className={styles.featureDescription}>
              カレンダーからインタビュー予定を自動取得。
              Google Meet録画も自動で同期。
            </p>
          </div>

          <div className={styles.featureCard}>
            <div className={styles.featureIcon}>🎥</div>
            <h3 className={styles.featureTitle}>動画アップロード</h3>
            <p className={styles.featureDescription}>
              ドラッグ&ドロップでバッチアップロード。
              MP4, MOV, AVI, WebM対応。
            </p>
          </div>

          <div className={styles.featureCard}>
            <div className={styles.featureIcon}>🔄</div>
            <h3 className={styles.featureTitle}>動画-文字起こし同期</h3>
            <p className={styles.featureDescription}>
              動画再生と文字起こしが連動。
              タイムスタンプクリックで即座にジャンプ。
            </p>
          </div>

          <div className={styles.featureCard}>
            <div className={styles.featureIcon}>🎯</div>
            <h3 className={styles.featureTitle}>深掘り分析</h3>
            <p className={styles.featureDescription}>
              The Mom Test原則に基づき、
              事実・数値・行動を自動抽出。
            </p>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className={styles.ctaSection}>
        <div className={styles.ctaContent}>
          <Image
            src="/characters/man1.svg"
            alt="Get Started"
            width={200}
            height={200}
          />
          <div className={styles.ctaText}>
            <h2 className={styles.ctaTitle}>今すぐインタビュー分析を始めよう</h2>
            <p className={styles.ctaDescription}>
              アカウント登録は無料。最初の分析も無料でお試しいただけます。
            </p>
            <Link href="/dashboard" className={styles.ctaButtonLarge}>
              無料で始める
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className={styles.footer}>
        <p className={styles.footerText}>
          &copy; 2025 EK Transcript. All rights reserved.
        </p>
      </footer>
    </div>
  );
}
