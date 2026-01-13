"use client";

/**
 * Projects page - Interview project list and management (US-13, US-14)
 *
 * Features:
 * - List all interview projects
 * - Create new projects
 * - Filter by status
 * - Navigate to project details
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../../lib/auth-context";
import {
  listInterviewProjects,
  createInterviewProject,
  type InterviewProject,
  type ProjectStatus,
  type CreateInterviewProjectInput,
} from "../../../lib/graphql";
import { ProjectCard } from "../../../components/ProjectCard";
import { ProjectCreateForm } from "../../../components/ProjectCreateForm";
import styles from "./page.module.css";

type FilterStatus = "ALL" | ProjectStatus;

export default function ProjectsPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [projects, setProjects] = useState<InterviewProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<FilterStatus>("ALL");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);

  const fetchProjects = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await listInterviewProjects(50);
      const sorted = [...result.items].sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      setProjects(sorted);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load projects");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated || authLoading) return;
    fetchProjects();
  }, [isAuthenticated, authLoading, fetchProjects]);

  // Filtered projects
  const filteredProjects = useMemo(() => {
    if (statusFilter === "ALL") return projects;
    return projects.filter((p) => p.status === statusFilter);
  }, [projects, statusFilter]);

  // Handle create project
  const handleCreateProject = useCallback(
    async (input: CreateInterviewProjectInput) => {
      try {
        setCreating(true);
        const newProject = await createInterviewProject(input);
        setProjects((prev) => [newProject, ...prev]);
        setShowCreateModal(false);
        // Navigate to the new project
        router.push(`/projects/${newProject.project_id}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create project");
      } finally {
        setCreating(false);
      }
    },
    [router]
  );

  // Handle project click
  const handleProjectClick = useCallback(
    (project: InterviewProject) => {
      router.push(`/projects/${project.project_id}`);
    },
    [router]
  );

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
            プロジェクトを表示するにはサインインしてください。
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

  const statusFilterOptions: { value: FilterStatus; label: string }[] = [
    { value: "ALL", label: "すべて" },
    { value: "ACTIVE", label: "進行中" },
    { value: "COMPLETED", label: "完了" },
    { value: "ARCHIVED", label: "アーカイブ" },
  ];

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>プロジェクト</h1>
        <button
          onClick={() => setShowCreateModal(true)}
          className={styles.createButton}
        >
          + 新規プロジェクト
        </button>
      </div>

      {/* Status Filter */}
      <div className={styles.filterSection}>
        {statusFilterOptions.map((option) => (
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

      {/* Content */}
      {loading ? (
        <div className={styles.loading}>読み込み中...</div>
      ) : error ? (
        <div className={styles.error}>{error}</div>
      ) : filteredProjects.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyText}>
            {statusFilter === "ALL"
              ? "プロジェクトがありません。新規プロジェクトを作成して始めましょう。"
              : "条件に一致するプロジェクトがありません。"}
          </p>
          {statusFilter === "ALL" && (
            <button
              onClick={() => setShowCreateModal(true)}
              className={styles.createButtonSecondary}
            >
              プロジェクトを作成
            </button>
          )}
        </div>
      ) : (
        <div className={styles.projectsGrid}>
          {filteredProjects.map((project) => (
            <ProjectCard
              key={project.project_id}
              project={project}
              onClick={handleProjectClick}
            />
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div
          className={styles.modal}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowCreateModal(false);
            }
          }}
        >
          <div className={styles.modalContent}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>新規プロジェクト作成</h2>
              <button
                className={styles.closeButton}
                onClick={() => setShowCreateModal(false)}
                aria-label="閉じる"
              >
                ×
              </button>
            </div>
            <ProjectCreateForm
              onSubmit={handleCreateProject}
              onCancel={() => setShowCreateModal(false)}
              isLoading={creating}
            />
          </div>
        </div>
      )}
    </div>
  );
}
