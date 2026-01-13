"use client";

/**
 * New Project Page
 *
 * Dedicated page for creating a new interview project.
 */
import { useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../../../../lib/auth-context";
import { createInterviewProject, type CreateInterviewProjectInput } from "../../../../lib/graphql";
import { ProjectCreateForm } from "../../../../components/ProjectCreateForm";
import styles from "./page.module.css";

export default function NewProjectPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(
    async (data: CreateInterviewProjectInput) => {
      try {
        setIsCreating(true);
        setError(null);
        const project = await createInterviewProject(data);
        // Navigate to project detail page
        router.push(`/projects/${project.project_id}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create project");
        setIsCreating(false);
      }
    },
    [router]
  );

  const handleCancel = useCallback(() => {
    router.push("/dashboard");
  }, [router]);

  if (authLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className={styles.container}>
        <div className={styles.authPrompt}>
          <h1 className={styles.authTitle}>サインインが必要です</h1>
          <p className={styles.authDescription}>
            プロジェクトを作成するにはサインインしてください。
          </p>
          <button
            onClick={() => router.push("/login")}
            className={styles.signInButton}
          >
            サインイン
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <nav className={styles.breadcrumb}>
        <Link href="/dashboard" className={styles.breadcrumbLink}>
          Dashboard
        </Link>
        <span className={styles.breadcrumbSeparator}>/</span>
        <span className={styles.breadcrumbCurrent}>新規プロジェクト</span>
      </nav>

      <div className={styles.header}>
        <h1 className={styles.title}>新規プロジェクト作成</h1>
        <p className={styles.subtitle}>
          インタビュープロジェクトの基本情報を入力してください
        </p>
      </div>

      {error && (
        <div className={styles.error}>
          {error}
        </div>
      )}

      <div className={styles.formWrapper}>
        <ProjectCreateForm
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          isLoading={isCreating}
        />
      </div>
    </div>
  );
}
