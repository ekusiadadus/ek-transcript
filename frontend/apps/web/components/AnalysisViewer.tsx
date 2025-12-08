"use client";

import { useS3Content } from "../lib/hooks/useS3Content";
import styles from "./AnalysisViewer.module.css";

// HEMS Interview Data structure (matching Python Pydantic model)
interface HEMSAnalysisData {
  interview_id?: string;
  interview_duration_minutes?: number;
  basic_attributes?: {
    age?: number;
    household_size?: number;
    residence_type?: string;
    area?: string;
    occupation_type?: string;
  };
  electricity_cost?: {
    recent_monthly_cost?: number;
    power_company?: string;
    has_switched_company?: boolean;
    bill_check_frequency?: string;
    pain_score?: number;
    past_year_actions?: string[];
  };
  device_info?: {
    devices_used?: string[];
    app_usage_frequency?: string;
    connected_devices_count?: number;
    automation_count?: number;
    most_used_feature?: string;
    satisfaction_points?: string[];
    dissatisfaction_points?: string[];
  };
  scoring?: {
    electricity_interest_score?: number;
    electricity_interest_details?: string;
    engagement_score?: number;
    engagement_details?: string;
    crowdfunding_fit_score?: number;
    crowdfunding_fit_details?: string;
    total_score?: number;
    segment?: string;
    segment_reason?: string;
  };
  insights?: {
    most_impressive_quote?: string;
    unexpected_findings?: string;
    non_negotiable_value?: string;
    good_signals?: string[];
    bad_signals?: string[];
    suggestion_for_500_supporters?: string;
  };
  summary?: string;
  action_items?: string[];
}

interface AnalysisViewerProps {
  analysisKey: string;
}

function ScoreBar({ score, max = 10, label }: { score: number; max?: number; label: string }) {
  const percentage = (score / max) * 100;
  return (
    <div className={styles.scoreItem}>
      <div className={styles.scoreLabel}>
        <span>{label}</span>
        <span className={styles.scoreValue}>{score}/{max}</span>
      </div>
      <div className={styles.scoreBarBg}>
        <div className={styles.scoreBarFill} style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={styles.section}>
      <h4 className={styles.sectionTitle}>{title}</h4>
      {children}
    </div>
  );
}

export function AnalysisViewer({ analysisKey }: AnalysisViewerProps) {
  const { data, loading, error } = useS3Content<HEMSAnalysisData>(analysisKey);

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>分析結果を読み込み中...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>{error}</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className={styles.container}>
        <div className={styles.empty}>分析データがありません</div>
      </div>
    );
  }

  const { scoring, insights, summary, action_items, basic_attributes, device_info } = data;

  return (
    <div className={styles.container}>
      {/* Summary */}
      {summary && (
        <Section title="要約">
          <p className={styles.summaryText}>{summary}</p>
        </Section>
      )}

      {/* Scoring */}
      {scoring && (
        <Section title="スコアリング">
          <div className={styles.scoreGrid}>
            {scoring.electricity_interest_score !== undefined && (
              <ScoreBar score={scoring.electricity_interest_score} label="電気代関心度" />
            )}
            {scoring.engagement_score !== undefined && (
              <ScoreBar score={scoring.engagement_score} label="エンゲージメント" />
            )}
            {scoring.crowdfunding_fit_score !== undefined && (
              <ScoreBar score={scoring.crowdfunding_fit_score} label="クラファン適合度" />
            )}
          </div>
          {scoring.total_score !== undefined && (
            <div className={styles.totalScore}>
              総合スコア: <strong>{scoring.total_score}</strong>/30
            </div>
          )}
          {scoring.segment && (
            <div className={styles.segment}>
              <span className={styles.segmentLabel}>セグメント:</span>
              <span className={styles.segmentValue}>{scoring.segment}</span>
              {scoring.segment_reason && (
                <p className={styles.segmentReason}>{scoring.segment_reason}</p>
              )}
            </div>
          )}
        </Section>
      )}

      {/* Insights */}
      {insights && (
        <Section title="インサイト">
          {insights.most_impressive_quote && (
            <div className={styles.quote}>
              <span className={styles.quoteLabel}>印象的な発言:</span>
              <blockquote>{insights.most_impressive_quote}</blockquote>
            </div>
          )}
          {insights.good_signals && insights.good_signals.length > 0 && (
            <div className={styles.signals}>
              <span className={styles.signalLabel}>有望なシグナル:</span>
              <ul className={styles.signalList}>
                {insights.good_signals.map((signal, i) => (
                  <li key={i} className={styles.goodSignal}>{signal}</li>
                ))}
              </ul>
            </div>
          )}
          {insights.bad_signals && insights.bad_signals.length > 0 && (
            <div className={styles.signals}>
              <span className={styles.signalLabel}>要注意なシグナル:</span>
              <ul className={styles.signalList}>
                {insights.bad_signals.map((signal, i) => (
                  <li key={i} className={styles.badSignal}>{signal}</li>
                ))}
              </ul>
            </div>
          )}
          {insights.suggestion_for_500_supporters && (
            <div className={styles.suggestion}>
              <span className={styles.suggestionLabel}>500人支援者獲得に向けた示唆:</span>
              <p>{insights.suggestion_for_500_supporters}</p>
            </div>
          )}
        </Section>
      )}

      {/* Action Items */}
      {action_items && action_items.length > 0 && (
        <Section title="アクション項目">
          <ul className={styles.actionList}>
            {action_items.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </Section>
      )}

      {/* Basic Info */}
      {basic_attributes && (
        <Section title="基本属性">
          <div className={styles.attributeGrid}>
            {basic_attributes.age && (
              <div className={styles.attribute}>
                <span className={styles.attrLabel}>年齢</span>
                <span className={styles.attrValue}>{basic_attributes.age}歳</span>
              </div>
            )}
            {basic_attributes.household_size && (
              <div className={styles.attribute}>
                <span className={styles.attrLabel}>世帯人数</span>
                <span className={styles.attrValue}>{basic_attributes.household_size}人</span>
              </div>
            )}
            {basic_attributes.residence_type && (
              <div className={styles.attribute}>
                <span className={styles.attrLabel}>住居形態</span>
                <span className={styles.attrValue}>{basic_attributes.residence_type}</span>
              </div>
            )}
            {basic_attributes.occupation_type && (
              <div className={styles.attribute}>
                <span className={styles.attrLabel}>職業</span>
                <span className={styles.attrValue}>{basic_attributes.occupation_type}</span>
              </div>
            )}
          </div>
        </Section>
      )}

      {/* Device Info */}
      {device_info && (
        <Section title="デバイス利用状況">
          <div className={styles.attributeGrid}>
            {device_info.devices_used && device_info.devices_used.length > 0 && (
              <div className={styles.attribute}>
                <span className={styles.attrLabel}>利用デバイス</span>
                <span className={styles.attrValue}>{device_info.devices_used.join(", ")}</span>
              </div>
            )}
            {device_info.connected_devices_count !== undefined && (
              <div className={styles.attribute}>
                <span className={styles.attrLabel}>連携家電数</span>
                <span className={styles.attrValue}>{device_info.connected_devices_count}台</span>
              </div>
            )}
            {device_info.automation_count !== undefined && (
              <div className={styles.attribute}>
                <span className={styles.attrLabel}>オートメーション</span>
                <span className={styles.attrValue}>{device_info.automation_count}個</span>
              </div>
            )}
            {device_info.app_usage_frequency && (
              <div className={styles.attribute}>
                <span className={styles.attrLabel}>アプリ利用頻度</span>
                <span className={styles.attrValue}>{device_info.app_usage_frequency}</span>
              </div>
            )}
          </div>
        </Section>
      )}
    </div>
  );
}
