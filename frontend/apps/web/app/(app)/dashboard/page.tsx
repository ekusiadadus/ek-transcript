"use client";

/**
 * Dashboard page - Project-centric overview (US-10, US-12, US-PROJECT)
 *
 * Shows projects as the primary navigation with quick stats.
 * Users can click on a project to see its interviews.
 */
import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../../../lib/auth-context";
import {
  listInterviews,
  listInterviewProjects,
  type Interview,
  type InterviewProject,
} from "../../../lib/graphql";
import styles from "./page.module.css";

type FilterStatus = "ALL" | "ACTIVE" | "COMPLETED" | "ARCHIVED";

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "進行中",
  COMPLETED: "完了",
  ARCHIVED: "アーカイブ",
};

/**
 * Format date to Japanese locale.
 */
function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Get status class for project card.
 */
function getStatusClass(status: string): string {
  switch (status) {
    case "COMPLETED":
      return styles.projectCardStatusCompleted;
    case "ARCHIVED":
      return styles.projectCardStatusArchived;
    default:
      return "";
  }
}

export default function DashboardPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [projects, setProjects] = useState<InterviewProject[]>([]);
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<FilterStatus>("ALL");

  useEffect(() => {
    if (!isAuthenticated || authLoading) return;

    const fetchData = async () => {
      try {
        setLoading(true);
        const [projectsResult, interviewsResult] = await Promise.all([
          listInterviewProjects(50),
          listInterviews(50),
        ]);

        // Sort projects by updated_at descending
        const sortedProjects = [...projectsResult.items].sort(
          (a, b) =>
            new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        );
        setProjects(sortedProjects);
        setInterviews(interviewsResult.items);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load data");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [isAuthenticated, authLoading]);

  // Computed stats
  const stats = useMemo(() => {
    const totalProjects = projects.length;
    const activeProjects = projects.filter((p) => p.status === "ACTIVE").length;
    const totalInterviews = interviews.length;
    const completedInterviews = interviews.filter(
      (i) => i.status?.toUpperCase() === "COMPLETED"
    ).length;

    return {
      totalProjects,
      activeProjects,
      totalInterviews,
      completedInterviews,
    };
  }, [projects, interviews]);

  // Filtered projects
  const filteredProjects = useMemo(() => {
    if (statusFilter === "ALL") return projects;
    return projects.filter((p) => p.status === statusFilter);
  }, [projects, statusFilter]);

  const filterOptions: { value: FilterStatus; label: string }[] = [
    { value: "ALL", label: "すべて" },
    { value: "ACTIVE", label: "進行中" },
    { value: "COMPLETED", label: "完了" },
    { value: "ARCHIVED", label: "アーカイブ" },
  ];

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
            ダッシュボードを表示するにはサインインしてください。
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
      <div className={styles.header}>
        <h1 className={styles.title}>Dashboard</h1>
      </div>

      {/* Stats */}
      <div className={styles.stats}>
        <div className={styles.statCard}>
          <span className={styles.statValue}>{stats.totalProjects}</span>
          <span className={styles.statLabel}>プロジェクト</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statValue}>{stats.activeProjects}</span>
          <span className={styles.statLabel}>進行中</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statValue}>{stats.totalInterviews}</span>
          <span className={styles.statLabel}>総インタビュー</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statValue}>{stats.completedInterviews}</span>
          <span className={styles.statLabel}>分析完了</span>
        </div>
      </div>

      {/* Quick Actions */}
      <div className={styles.quickActions}>
        <Link href="/projects/new" className={`${styles.quickActionButton} ${styles.quickActionButtonPrimary}`}>
          + 新規プロジェクト
        </Link>
      </div>

      {/* Project Section */}
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>プロジェクト</h2>
      </div>

      {/* Filter */}
      <div className={styles.filterSection}>
        <div className={styles.filterGroup}>
          <span className={styles.filterLabel}>ステータス</span>
          <div className={styles.filters}>
            {filterOptions.map((option) => (
              <button
                key={option.value}
                className={`${styles.filterButton} ${
                  statusFilter === option.value ? styles.filterButtonActive : ""
                }`}
                onClick={() => setStatusFilter(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className={styles.loading}>読み込み中...</div>
      ) : error ? (
        <div className={styles.error}>{error}</div>
      ) : filteredProjects.length === 0 && statusFilter === "ALL" ? (
        <div className={styles.empty}>
          <p className={styles.emptyText}>
            プロジェクトがありません。新規プロジェクトを作成して始めましょう。
          </p>
          <Link href="/projects/new" className={styles.uploadButtonSecondary}>
            プロジェクトを作成
          </Link>
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyText}>
            条件に一致するプロジェクトがありません。
          </p>
        </div>
      ) : (
        <div className={styles.projectGrid}>
          {filteredProjects.map((project) => (
            <Link
              key={project.project_id}
              href={`/projects/${project.project_id}`}
              className={styles.projectCard}
            >
              <div className={styles.projectCardHeader}>
                <h3 className={styles.projectCardTitle}>{project.title}</h3>
                <span
                  className={`${styles.projectCardStatus} ${getStatusClass(
                    project.status
                  )}`}
                >
                  {STATUS_LABELS[project.status] || project.status}
                </span>
              </div>
              <p className={styles.projectCardDescription}>
                {project.description || "説明なし"}
              </p>
              <div className={styles.projectCardMeta}>
                <span className={styles.projectCardCount}>
                  <span className={styles.projectCardCountValue}>
                    {project.interview_count}
                  </span>
                  件のインタビュー
                </span>
                <span className={styles.projectCardDate}>
                  {formatDate(project.updated_at)}
                </span>
              </div>
            </Link>
          ))}
          {/* Create new project card */}
          <Link href="/projects/new" className={styles.createProjectCard}>
            <span className={styles.createProjectIcon}>+</span>
            <span className={styles.createProjectText}>新規プロジェクト</span>
          </Link>
        </div>
      )}
    </div>
  );
}
