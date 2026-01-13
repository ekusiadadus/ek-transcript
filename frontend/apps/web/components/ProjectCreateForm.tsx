"use client";

/**
 * ProjectCreateForm Component
 *
 * Form for creating a new interview project.
 * Collects title, description, recruitment criteria,
 * research questions, and target persona.
 */

import { useState, useCallback, FormEvent } from "react";
import type { CreateInterviewProjectInput } from "../lib/graphql/types";
import styles from "./ProjectCreateForm.module.css";

interface ProjectCreateFormProps {
  onSubmit: (data: CreateInterviewProjectInput) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export function ProjectCreateForm({
  onSubmit,
  onCancel,
  isLoading = false,
}: ProjectCreateFormProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [recruitmentCriteria, setRecruitmentCriteria] = useState("");
  const [researchQuestions, setResearchQuestions] = useState("");
  const [targetPersona, setTargetPersona] = useState("");

  const handleSubmit = useCallback(
    (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();

      if (!title.trim()) {
        return;
      }

      onSubmit({
        title: title.trim(),
        description: description.trim(),
        recruitment_criteria: recruitmentCriteria.trim(),
        research_questions: researchQuestions.trim(),
        target_persona: targetPersona.trim(),
      });
    },
    [title, description, recruitmentCriteria, researchQuestions, targetPersona, onSubmit]
  );

  return (
    <form
      className={styles.form}
      onSubmit={handleSubmit}
      role="form"
      aria-label="プロジェクト作成フォーム"
    >
      {/* Title (Required) */}
      <div className={styles.fieldGroup}>
        <label className={styles.label} htmlFor="project-title">
          タイトル
          <span className={styles.required}>*</span>
        </label>
        <input
          id="project-title"
          type="text"
          className={styles.input}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="例: 電気代節約意識調査 2026年1月"
          required
        />
      </div>

      {/* Description */}
      <div className={styles.fieldGroup}>
        <label className={styles.label} htmlFor="project-description">
          説明
        </label>
        <textarea
          id="project-description"
          className={styles.textarea}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="このインタビュープロジェクトの目的や概要を記入してください"
        />
      </div>

      {/* Recruitment Criteria */}
      <div className={styles.fieldGroup}>
        <label className={styles.label} htmlFor="project-criteria">
          募集条件
        </label>
        <input
          id="project-criteria"
          type="text"
          className={styles.input}
          value={recruitmentCriteria}
          onChange={(e) => setRecruitmentCriteria(e.target.value)}
          placeholder="例: 30代以上、持ち家、電気代月1万円以上"
        />
        <span className={styles.hint}>
          インタビュー対象者の募集条件を記入してください
        </span>
      </div>

      {/* Research Questions */}
      <div className={styles.fieldGroup}>
        <label className={styles.label} htmlFor="project-questions">
          リサーチ課題
        </label>
        <textarea
          id="project-questions"
          className={styles.textarea}
          value={researchQuestions}
          onChange={(e) => setResearchQuestions(e.target.value)}
          placeholder="例: 省エネ意識が高い人は実際に行動しているか？"
        />
        <span className={styles.hint}>
          このインタビューで検証したい仮説や課題を記入してください
        </span>
      </div>

      {/* Target Persona */}
      <div className={styles.fieldGroup}>
        <label className={styles.label} htmlFor="project-persona">
          ターゲットペルソナ
        </label>
        <input
          id="project-persona"
          type="text"
          className={styles.input}
          value={targetPersona}
          onChange={(e) => setTargetPersona(e.target.value)}
          placeholder="例: 共働き世帯、子供あり"
        />
        <span className={styles.hint}>
          想定するユーザー像を記入してください
        </span>
      </div>

      {/* Actions */}
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.cancelButton}
          onClick={onCancel}
        >
          キャンセル
        </button>
        <button
          type="submit"
          className={styles.submitButton}
          disabled={isLoading || !title.trim()}
        >
          {isLoading ? "作成中..." : "作成"}
        </button>
      </div>
    </form>
  );
}

export default ProjectCreateForm;
