"use client";

import { useState, useCallback, useMemo } from "react";
import type {
  ProductSegment,
  UserSegment,
  ReviewStatus,
  JudgmentType,
} from "../lib/graphql/types";
import styles from "./InterviewFilter.module.css";

/**
 * Interview processing status options
 */
export type ProcessingStatus = "processing" | "completed" | "failed";

/**
 * Filter state for interview list
 */
export interface InterviewFilterState {
  productSegment: ProductSegment | null;
  userSegment: UserSegment | null;
  reviewStatus: ReviewStatus | null;
  status: ProcessingStatus | null;
  judgment: JudgmentType | null;
  scoreMin: number | null;
  scoreMax: number | null;
  dateFrom: string | null;
  dateTo: string | null;
  keyword: string;
}

/**
 * Default empty filter state
 */
export const defaultFilterState: InterviewFilterState = {
  productSegment: null,
  userSegment: null,
  reviewStatus: null,
  status: null,
  judgment: null,
  scoreMin: null,
  scoreMax: null,
  dateFrom: null,
  dateTo: null,
  keyword: "",
};

interface InterviewFilterProps {
  filters: InterviewFilterState;
  onChange: (filters: InterviewFilterState) => void;
  onReset?: () => void;
  collapsible?: boolean;
  defaultExpanded?: boolean;
}

/**
 * Product segment options with Japanese labels
 */
const productSegmentOptions: { value: ProductSegment; label: string }[] = [
  { value: "HEMS", label: "HEMS" },
  { value: "EV", label: "EV" },
  { value: "Solar", label: "太陽光" },
  { value: "Storage", label: "蓄電池" },
  { value: "Other", label: "その他" },
];

/**
 * User segment options with Japanese labels
 */
const userSegmentOptions: { value: UserSegment; label: string }[] = [
  { value: "A", label: "A: 省エネ意識高" },
  { value: "B", label: "B: ガジェット好き" },
  { value: "C", label: "C: 便利さ追求" },
  { value: "D", label: "D: ライト層" },
];

/**
 * Review status options with Japanese labels
 */
const reviewStatusOptions: { value: ReviewStatus; label: string }[] = [
  { value: "unreviewed", label: "未レビュー" },
  { value: "reviewed", label: "レビュー済み" },
];

/**
 * Processing status options with Japanese labels
 */
const processingStatusOptions: { value: ProcessingStatus; label: string }[] = [
  { value: "processing", label: "処理中" },
  { value: "completed", label: "完了" },
  { value: "failed", label: "失敗" },
];

/**
 * Judgment options with Japanese labels
 */
const judgmentOptions: { value: JudgmentType; label: string }[] = [
  { value: "priority", label: "最優先ターゲット" },
  { value: "promising", label: "有望ターゲット" },
  { value: "review", label: "要検討" },
  { value: "outside", label: "ターゲット外" },
];

/**
 * InterviewFilter Component (v2.1)
 *
 * Dashboard filter and search component for interview list.
 */
export function InterviewFilter({
  filters,
  onChange,
  onReset,
  collapsible = false,
  defaultExpanded = false,
}: InterviewFilterProps) {
  const [isExpanded, setIsExpanded] = useState(
    collapsible ? defaultExpanded : true
  );

  // Count active filters
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.productSegment) count++;
    if (filters.userSegment) count++;
    if (filters.reviewStatus) count++;
    if (filters.status) count++;
    if (filters.judgment) count++;
    if (filters.scoreMin !== null) count++;
    if (filters.scoreMax !== null) count++;
    if (filters.dateFrom) count++;
    if (filters.dateTo) count++;
    if (filters.keyword) count++;
    return count;
  }, [filters]);

  // Handle select change
  const handleSelectChange = useCallback(
    <K extends keyof InterviewFilterState>(
      key: K,
      value: InterviewFilterState[K] | ""
    ) => {
      onChange({
        ...filters,
        [key]: value === "" ? null : value,
      });
    },
    [filters, onChange]
  );

  // Handle number input change
  const handleNumberChange = useCallback(
    (key: "scoreMin" | "scoreMax", value: string) => {
      const numValue = value === "" ? null : parseInt(value, 10);
      onChange({
        ...filters,
        [key]: isNaN(numValue as number) ? null : numValue,
      });
    },
    [filters, onChange]
  );

  // Handle keyword change
  const handleKeywordChange = useCallback(
    (value: string) => {
      onChange({
        ...filters,
        keyword: value,
      });
    },
    [filters, onChange]
  );

  // Handle date change
  const handleDateChange = useCallback(
    (key: "dateFrom" | "dateTo", value: string) => {
      onChange({
        ...filters,
        [key]: value === "" ? null : value,
      });
    },
    [filters, onChange]
  );

  // Toggle expanded state
  const toggleExpanded = useCallback(() => {
    if (collapsible) {
      setIsExpanded((prev) => !prev);
    }
  }, [collapsible]);

  return (
    <div className={styles.container} role="search">
      {/* Header */}
      <div className={styles.header}>
        {collapsible ? (
          <button
            type="button"
            className={styles.headerToggle}
            onClick={toggleExpanded}
            aria-expanded={isExpanded}
          >
            <span className={styles.headerTitle}>フィルター</span>
            <span className={styles.headerIcon}>
              {isExpanded ? "▼" : "▶"}
            </span>
          </button>
        ) : (
          <span className={styles.headerTitle}>フィルター</span>
        )}

        {activeFilterCount > 0 && (
          <span className={styles.activeCount}>
            {activeFilterCount}件のフィルター適用中
          </span>
        )}

        {onReset && (
          <button
            type="button"
            className={styles.resetButton}
            onClick={onReset}
          >
            リセット
          </button>
        )}
      </div>

      {/* Filter content */}
      {isExpanded && (
        <div className={styles.content}>
          {/* Keyword search */}
          <div className={styles.searchRow}>
            <input
              type="text"
              className={styles.searchInput}
              placeholder="キーワード検索..."
              value={filters.keyword}
              onChange={(e) => handleKeywordChange(e.target.value)}
            />
          </div>

          {/* Filter grid */}
          <div className={styles.filterGrid}>
            {/* Product Segment */}
            <div className={styles.filterItem}>
              <label
                htmlFor="filter-product-segment"
                className={styles.filterLabel}
              >
                製品セグメント
              </label>
              <select
                id="filter-product-segment"
                className={styles.filterSelect}
                value={filters.productSegment ?? ""}
                onChange={(e) =>
                  handleSelectChange(
                    "productSegment",
                    e.target.value as ProductSegment
                  )
                }
              >
                <option value="">すべて</option>
                {productSegmentOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* User Segment */}
            <div className={styles.filterItem}>
              <label
                htmlFor="filter-user-segment"
                className={styles.filterLabel}
              >
                ユーザーセグメント
              </label>
              <select
                id="filter-user-segment"
                className={styles.filterSelect}
                value={filters.userSegment ?? ""}
                onChange={(e) =>
                  handleSelectChange(
                    "userSegment",
                    e.target.value as UserSegment
                  )
                }
              >
                <option value="">すべて</option>
                {userSegmentOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Review Status */}
            <div className={styles.filterItem}>
              <label
                htmlFor="filter-review-status"
                className={styles.filterLabel}
              >
                レビュー状態
              </label>
              <select
                id="filter-review-status"
                className={styles.filterSelect}
                value={filters.reviewStatus ?? ""}
                onChange={(e) =>
                  handleSelectChange(
                    "reviewStatus",
                    e.target.value as ReviewStatus
                  )
                }
              >
                <option value="">すべて</option>
                {reviewStatusOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Processing Status */}
            <div className={styles.filterItem}>
              <label htmlFor="filter-status" className={styles.filterLabel}>
                処理状態
              </label>
              <select
                id="filter-status"
                className={styles.filterSelect}
                value={filters.status ?? ""}
                onChange={(e) =>
                  handleSelectChange(
                    "status",
                    e.target.value as ProcessingStatus
                  )
                }
              >
                <option value="">すべて</option>
                {processingStatusOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Judgment */}
            <div className={styles.filterItem}>
              <label htmlFor="filter-judgment" className={styles.filterLabel}>
                判定
              </label>
              <select
                id="filter-judgment"
                className={styles.filterSelect}
                value={filters.judgment ?? ""}
                onChange={(e) =>
                  handleSelectChange(
                    "judgment",
                    e.target.value as JudgmentType
                  )
                }
              >
                <option value="">すべて</option>
                {judgmentOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Score Range */}
            <div className={styles.filterItem}>
              <label htmlFor="filter-score-min" className={styles.filterLabel}>
                スコア下限
              </label>
              <input
                type="number"
                id="filter-score-min"
                className={styles.filterInput}
                min={0}
                max={30}
                value={filters.scoreMin ?? ""}
                onChange={(e) => handleNumberChange("scoreMin", e.target.value)}
              />
            </div>

            <div className={styles.filterItem}>
              <label htmlFor="filter-score-max" className={styles.filterLabel}>
                スコア上限
              </label>
              <input
                type="number"
                id="filter-score-max"
                className={styles.filterInput}
                min={0}
                max={30}
                value={filters.scoreMax ?? ""}
                onChange={(e) => handleNumberChange("scoreMax", e.target.value)}
              />
            </div>

            {/* Date Range */}
            <div className={styles.filterItem}>
              <label htmlFor="filter-date-from" className={styles.filterLabel}>
                日付開始
              </label>
              <input
                type="date"
                id="filter-date-from"
                className={styles.filterInput}
                value={filters.dateFrom ?? ""}
                onChange={(e) => handleDateChange("dateFrom", e.target.value)}
              />
            </div>

            <div className={styles.filterItem}>
              <label htmlFor="filter-date-to" className={styles.filterLabel}>
                日付終了
              </label>
              <input
                type="date"
                id="filter-date-to"
                className={styles.filterInput}
                value={filters.dateTo ?? ""}
                onChange={(e) => handleDateChange("dateTo", e.target.value)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default InterviewFilter;
