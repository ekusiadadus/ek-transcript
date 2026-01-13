"use client";

/**
 * ProjectCard Component
 *
 * Displays interview project information in a card format.
 * Shows title, description, recruitment criteria, target persona,
 * interview count, status, and creation date.
 */

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import type { InterviewProject, ProjectStatus } from "../lib/graphql/types";
import styles from "./ProjectCard.module.css";

interface ProjectCardProps {
  project: InterviewProject;
  onClick?: (project: InterviewProject) => void;
}

const STATUS_LABELS: Record<ProjectStatus, string> = {
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
    month: "long",
    day: "numeric",
  });
}

export function ProjectCard({ project, onClick }: ProjectCardProps) {
  const router = useRouter();

  const handleClick = useCallback(() => {
    if (onClick) {
      onClick(project);
    } else {
      router.push(`/projects/${project.project_id}`);
    }
  }, [onClick, project, router]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleClick();
      }
    },
    [handleClick]
  );

  const interviewCount = project.interview_count ?? 0;

  return (
    <article
      className={styles.card}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-label={`${project.title} - ${STATUS_LABELS[project.status]} - ${interviewCount}件のインタビュー`}
    >
      {/* Header: Title and Status */}
      <header className={styles.header}>
        <h3 className={styles.title}>{project.title}</h3>
        <span className={`${styles.statusBadge} ${styles[`status${project.status}`]}`}>
          {STATUS_LABELS[project.status]}
        </span>
      </header>

      {/* Description */}
      {project.description && (
        <p className={styles.description}>{project.description}</p>
      )}

      {/* Metadata */}
      <div className={styles.metadata}>
        {project.recruitment_criteria && (
          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>対象者:</span>
            <span className={styles.metaValue}>{project.recruitment_criteria}</span>
          </div>
        )}
        {project.target_persona && (
          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>ペルソナ:</span>
            <span className={styles.metaValue}>{project.target_persona}</span>
          </div>
        )}
      </div>

      {/* Footer: Interview Count and Date */}
      <footer className={styles.footer}>
        <div className={styles.interviewCount}>
          <span className={styles.countNumber}>{interviewCount}</span>
          <span className={styles.countLabel}>インタビュー</span>
        </div>
        <span className={styles.date}>{formatDate(project.created_at)}</span>
      </footer>
    </article>
  );
}

export default ProjectCard;
