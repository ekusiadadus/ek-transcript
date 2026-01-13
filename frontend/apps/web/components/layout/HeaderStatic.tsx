/**
 * Static header for marketing pages (Server Component).
 * No auth dependencies - keeps bundle size minimal.
 */
import Link from "next/link";
import Image from "next/image";
import styles from "./HeaderStatic.module.css";

export default function HeaderStatic() {
  return (
    <header className={styles.header}>
      <div className={styles.container}>
        <Link href="/" className={styles.logo}>
          <Image
            src="/characters/woman1.svg"
            alt="EK Transcript"
            width={32}
            height={32}
            priority
          />
          <span className={styles.logoText}>EK Transcript</span>
        </Link>

        <nav className={styles.nav}>
          <Link href="/dashboard" className={styles.navLink}>
            Dashboard
          </Link>
        </nav>
      </div>
    </header>
  );
}
