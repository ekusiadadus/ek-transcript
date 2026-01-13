"use client";

/**
 * Dynamic header for app pages (Client Component).
 * Includes auth state and user menu.
 */
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "../../lib/auth-context";
import styles from "./Header.module.css";

export default function Header() {
  const { user, isAuthenticated, signOut } = useAuth();

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
          <Link href="/meetings" className={styles.navLink}>
            Meetings
          </Link>
          <Link href="/upload" className={styles.navLink}>
            Upload
          </Link>
        </nav>

        <div className={styles.userSection}>
          {isAuthenticated ? (
            <>
              <span className={styles.userEmail}>
                {user?.email || user?.username}
              </span>
              <button onClick={signOut} className={styles.signOutButton}>
                Sign Out
              </button>
            </>
          ) : (
            <Link href="/login" className={styles.signInButton}>
              Sign In
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
