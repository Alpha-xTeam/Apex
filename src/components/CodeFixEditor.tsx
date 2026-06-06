import { useState, useEffect } from 'react';
import { useI18n } from '../i18n/I18nContext';

interface Hint {
  level: number;
  text: string;
  xp_cost: number;
}

interface CodeFixChallenge {
  id: string;
  scenarioId: string;
  language: string;
  title: string;
  story: string;
  task_outline: string;
  vulnerable_code: string;
  vulnerability_type: string;
  vulnerability_description: string;
  difficulty: string;
  xp_reward: number;
  hints: Hint[];
}

interface CodeFixEditorProps {
  challenge: CodeFixChallenge;
  onSubmit: (fixedCode: string) => Promise<void>;
  onBack: () => void;
  isVerifying: boolean;
  result: { success: boolean; feedback: string } | null;
  /**
   * When running inside a 1v1 match, the in-editor success celebration
   * (confetti + "Continue" button) is suppressed so the OneVOneResultModal
   * is the single source of truth for the match outcome. Without this, the
   * celebration modal (z-index 9999) covers the 1v1 modal (z-index 1000) and
   * the "Continue" button ends up navigating the user out of a match whose
   * server-side win was already recorded.
   */
  inOneVOne?: boolean;
}

const VULN_TYPE_AR: Record<string, string> = {
  'buffer-overflow': 'Hijacking',
  'use-after-free': 'Use-After-Free',
  'format-string': 'Format String',
  'integer-overflow': 'Integer Overflow',
  'sql-injection': 'SQL Injection',
  'path-traversal': 'Path Traversal',
  'unsafe-deserialization': 'Unsafe Deserialization',
  'xss': 'XSS',
  'pickle-deserialization': 'Pickle Deserialization',
  'command-injection': 'Command Injection',
  'prototype-pollution': 'Prototype Pollution',
  'redos': 'ReDoS',
  'file-inclusion': 'File Inclusion',
  'type-juggling': 'Type Juggling',
  'unsafe-block': 'Unsafe Block',
  'unwrap-panic': 'Unwrap Panic',
};

function getFileExt(language: string): string {
  switch (language) {
    case 'C++': return 'cpp';
    case 'JAVA': return 'java';
    case 'PYTHON': return 'py';
    case 'JAVASCRIPT': return 'js';
    case 'PHP': return 'php';
    case 'RUST': return 'rs';
    default: return 'txt';
  }
}

export default function CodeFixEditor({
  challenge,
  onSubmit,
  onBack,
  inOneVOne = false,
  isVerifying,
  result,
}: CodeFixEditorProps) {
  const { t } = useI18n();
  const initialCode = challenge?.vulnerable_code ?? '';
  const [fixedCode, setFixedCode] = useState<string>(initialCode);
  const [showHints, setShowHints] = useState(false);
  const [usedHints, setUsedHints] = useState<number[]>([]);

  const vulnLabel = VULN_TYPE_AR[challenge.vulnerability_type] || challenge.vulnerability_type;
  const fileExt = getFileExt(challenge.language);
  const fileName = 'vulnerable';
  const lineCount = Math.max(1, fixedCode.split('\n').length);

  useEffect(() => {
    if (challenge?.vulnerable_code) {
      setFixedCode(challenge.vulnerable_code);
    }
  }, [challenge?.id, challenge?.vulnerable_code]);

  const handleSubmit = async () => {
    if (!fixedCode.trim() || isVerifying) return;
    await onSubmit(fixedCode);
  };

  const handleShowHints = () => {
    if (!showHints) {
      const allLevels = challenge.hints?.map(h => h.level) || [];
      setUsedHints(allLevels);
    }
    setShowHints(!showHints);
  };

  return (
    <div className="code-fix-container">
      <div className="code-fix-header">
        <div className="code-fix-header-right">
          <button onClick={onBack} className="code-fix-back">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="9 18 15 12 9 6" />
            </svg>
            {t.codeFix.back}
          </button>
          <div className="code-fix-title-section">
            <h2 className="code-fix-title">{challenge.title}</h2>
            <div className="code-fix-meta">
              <span className="code-fix-lang">{challenge.language}</span>
              <span className={`code-fix-diff ${challenge.difficulty === 'مبتدئ' ? 'easy' : challenge.difficulty === 'متوسط' ? 'medium' : 'hard'}`}>
                {challenge.difficulty}
              </span>
              <span className="code-fix-vuln">{vulnLabel}</span>
              <span className="code-fix-xp">+{challenge.xp_reward} XP</span>
            </div>
          </div>
        </div>
      </div>

      <div className="code-fix-info">
        <div className="code-fix-story">
          <h3>القصة</h3>
          <p>{challenge.story}</p>
        </div>
        <div className="code-fix-task">
          <h3>المهمة</h3>
          <p>{challenge.task_outline}</p>
        </div>
      </div>

      <div className="code-fix-editor-wrapper">
        <div className="code-fix-tabs">
          <div className="code-fix-tab active">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            <span>{fileName}.{fileExt}</span>
          </div>
        </div>

        <div className="code-fix-pane code-fix-pane-single">
          <div className="code-fix-pane-header">
            <span className="code-fix-pane-label">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
              {t.codeFix.fixHint}
            </span>
          </div>
          <div className="code-fix-monaco-host">
            <div className="code-fix-line-numbers">
              {Array.from({ length: lineCount }, (_, i) => (
                <div key={i}>{i + 1}</div>
              ))}
            </div>
            <textarea
              className="code-fix-textarea"
              value={fixedCode}
              onChange={(e) => setFixedCode(e.target.value)}
              spellCheck={false}
              dir="ltr"
              placeholder={t.codeFix.placeholder}
            />
          </div>
        </div>
      </div>

      <div className="code-fix-actions">
        <div className="code-fix-hints-section">
          <button
            className="code-fix-hints-btn"
            onClick={handleShowHints}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            التلميحات ({usedHints.length}/{challenge.hints?.length || 0})
          </button>

          {showHints && challenge.hints && (
            <div className="code-fix-hints-list">
              {challenge.hints.map((hint) => (
                <div
                  key={hint.level}
                  className={`code-fix-hint ${usedHints.includes(hint.level) ? 'used' : ''}`}
                >
                  <span className="hint-level">تلميح {hint.level}</span>
                  <span className="hint-text">{hint.text}</span>
                  <span className="hint-cost">-{hint.xp_cost} XP</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <button
          className={`code-fix-submit ${isVerifying ? 'verifying' : ''}`}
          onClick={handleSubmit}
          disabled={isVerifying || !fixedCode.trim()}
        >
          {isVerifying ? (
            <>
              <svg className="spinner" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12a9 9 0 11-6.219-8.56" />
              </svg>
              {t.codeFix.submitting}
            </>
          ) : (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
              {t.codeFix.submit}
            </>
          )}
        </button>
      </div>

      {result && (
        <div className={`code-fix-result ${result.success ? 'success' : 'failure'}`}>
          <div className="code-fix-result-icon">
            {result.success ? (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            ) : (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            )}
          </div>
          <div className="code-fix-result-content">
            <h4>{result.success ? (t.codeFix.successTitle) : (t.codeFix.failureTitle)}</h4>
            <p>{result.feedback}</p>
          </div>
        </div>
      )}

      {result && result.success && !inOneVOne && (
        <SuccessCelebration
          xpReward={challenge.xp_reward}
          feedback={result.feedback}
          onContinue={onBack}
        />
      )}
    </div>
  );
}


function SuccessCelebration({ xpReward, feedback, onContinue }: { xpReward: number; feedback: string; onContinue: () => void }) {
  const { t } = useI18n();
  const [count, setCount] = useState(0);
  const [confettiPieces] = useState(() =>
    Array.from({ length: 80 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 0.4,
      duration: 2 + Math.random() * 2,
      rotate: Math.random() * 360,
      color: ['#fbbf24', '#34d399', '#60a5fa', '#a78bfa', '#f472b6', '#22d3ee'][Math.floor(Math.random() * 6)],
    }))
  );

  useEffect(() => {
    let start = 0;
    const duration = 1100;
    const step = (ts: number) => {
      if (!start) start = ts;
      const progress = Math.min(1, (ts - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.floor(eased * xpReward));
      if (progress < 1) requestAnimationFrame(step);
      else setCount(xpReward);
    };
    requestAnimationFrame(step);
  }, [xpReward]);

  return (
    <div className="celebration-overlay" role="dialog" aria-modal="true">
      <div className="celebration-confetti">
        {confettiPieces.map((p) => (
          <span
            key={p.id}
            className="confetti-piece"
            style={{
              left: `${p.left}%`,
              background: p.color,
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.duration}s`,
              transform: `rotate(${p.rotate}deg)`,
            }}
          />
        ))}
      </div>

      <div className="celebration-card">
        <div className="celebration-ring">
          <svg className="celebration-checkmark" viewBox="0 0 52 52">
            <circle className="celebration-checkmark-circle" cx="26" cy="26" r="24" />
            <path className="celebration-checkmark-check" d="M14 27l7 7 16-16" />
          </svg>
        </div>

        <h2 className="celebration-title">{t.codeFix.celebrateTitle}</h2>
        <p className="celebration-subtitle">{t.codeFix.celebrateSub}</p>

        <div className="celebration-xp">
          <span className="celebration-xp-plus">+</span>
          <span className="celebration-xp-count">{count}</span>
          <span className="celebration-xp-label">XP</span>
        </div>

        <p className="celebration-feedback">{feedback}</p>

        <button className="celebration-btn" onClick={onContinue}>
          {t.codeFix.continue}
        </button>
      </div>
    </div>
  );
}
