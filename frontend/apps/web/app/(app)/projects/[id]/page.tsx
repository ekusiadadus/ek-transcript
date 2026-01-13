"use client";

/**
 * Project Detail page - View project info and interviews (US-16)
 *
 * Features:
 * - Display project details
 * - List interviews within project
 * - Navigate to upload with project context
 */

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../../../../lib/auth-context";
import {
  getInterviewProject,
  listInterviewsByProject,
  type InterviewProject,
  type Interview,
} from "../../../../lib/graphql";
import { InterviewCard } from "../../../../components/InterviewCard";
import styles from "./page.module.css";

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "進行中",
  COMPLETED: "完了",
  ARCHIVED: "アーカイブ",
};

export default function ProjectDetailPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [project, setProject] = useState<InterviewProject | null>(null);
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!projectId) return;

    try {
      setLoading(true);
      setError(null);

      // Fetch project and interviews in parallel
      const [projectResult, interviewsResult] = await Promise.all([
        getInterviewProject(projectId),
        listInterviewsByProject(projectId, 50),
      ]);

      if (!projectResult) {
        setError("プロジェクトが見つかりません");
        return;
      }

      setProject(projectResult);

      // Sort interviews by created_at descending
      const sorted = [...interviewsResult.items].sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      setInterviews(sorted);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load project");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (!isAuthenticated || authLoading) return;
    fetchData();
  }, [isAuthenticated, authLoading, fetchData]);

  if (authLoading || loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>読み込み中...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>サインインが必要です</div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>{error || "プロジェクトが見つかりません"}</div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Breadcrumb */}
      <nav className={styles.breadcrumb}>
        <Link href="/projects" className={styles.breadcrumbLink}>
          プロジェクト
        </Link>
        <span className={styles.breadcrumbSeparator}>/</span>
        <span className={styles.breadcrumbCurrent}>{project.title}</span>
      </nav>

      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerInfo}>
          <h1 className={styles.title}>{project.title}</h1>
          {project.description && (
            <p className={styles.description}>{project.description}</p>
          )}
        </div>
        <span
          className={`${styles.statusBadge} ${styles[`status${project.status}`]}`}
        >
          {STATUS_LABELS[project.status]}
        </span>
      </header>

      {/* Metadata */}
      <section className={styles.metadataSection}>
        <div className={styles.metadataGrid}>
          {project.recruitment_criteria && (
            <div className={styles.metadataItem}>
              <span className={styles.metadataLabel}>募集条件</span>
              <span className={styles.metadataValue}>
                {project.recruitment_criteria}
              </span>
            </div>
          )}
          {project.research_questions && (
            <div className={styles.metadataItem}>
              <span className={styles.metadataLabel}>リサーチ課題</span>
              <span className={styles.metadataValue}>
                {project.research_questions}
              </span>
            </div>
          )}
          {project.target_persona && (
            <div className={styles.metadataItem}>
              <span className={styles.metadataLabel}>ターゲットペルソナ</span>
              <span className={styles.metadataValue}>
                {project.target_persona}
              </span>
            </div>
          )}
          <div className={styles.metadataItem}>
            <span className={styles.metadataLabel}>作成日</span>
            <span className={styles.metadataValue}>
              {new Date(project.created_at).toLocaleDateString("ja-JP", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </span>
          </div>
        </div>
      </section>

      {/* Actions */}
      <div className={styles.actions}>
        <Link
          href={`/upload?project=${projectId}`}
          className={styles.uploadButton}
        >
          + インタビューをアップロード
        </Link>
      </div>

      {/* Interviews Section */}
      <section>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>インタビュー</h2>
          <span className={styles.interviewCount}>
            {interviews.length}件
          </span>
        </div>

        {interviews.length === 0 ? (
          <div className={styles.empty}>
            <p className={styles.emptyText}>
              このプロジェクトにはまだインタビューがありません。
            </p>
            <Link
              href={`/upload?project=${projectId}`}
              className={styles.uploadButton}
            >
              インタビューをアップロード
            </Link>
          </div>
        ) : (
          <div className={styles.interviewsGrid}>
            {interviews.map((interview) => (
              <InterviewCard
                key={interview.interview_id}
                interview={interview}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
