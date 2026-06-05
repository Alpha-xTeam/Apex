import { useState, useEffect, useRef } from 'react';

interface Hint {
  level: number;
  text: string;
  xp_cost: number;
}

interface LogAnalysisChallenge {
  id: string;
  scenarioId: string;
  title: string;
  story: string;
  task_outline: string;
  log_type: string;
  storage_path: string;
  log_url: string;
  is_inline: boolean;
  file_size_bytes: number;
  vulnerability_description: string;
  difficulty: string;
  xp_reward: number;
  hints: Hint[];
}

interface LogAnalysisResult {
  passed: boolean;
  score: number;
  correct_fields: string[];
  feedback: string;
  xp_awarded: number;
}

interface LogAnalysisEditorProps {
  challenge: LogAnalysisChallenge;
  onSubmit: (data: {
    attackType: string;
    attackerIp: string;
    timestamp: string;
    ioc: string;
    explanation: string;
  }) => Promise<void>;
  onBack: () => void;
  isVerifying: boolean;
  result: LogAnalysisResult | null;
}

const ATTACK_TYPES_AR: Record<string, { label: string; icon: string }> = {
  'brute-force':         { label: 'هجوم القوة الغاشمة (Brute Force)',         icon: '🔓' },
  'sqli':                { label: 'حقن SQL (SQL Injection)',                  icon: '💉' },
  'webshell':            { label: 'رفع WebShell',                              icon: '🐚' },
  'c2':                  { label: 'اتصال خادم القيادة والسيطرة (C2)',         icon: '📡' },
  'exfiltration':        { label: 'تسريب البيانات (Data Exfiltration)',       icon: '📤' },
  'xss':                 { label: 'هجوم XSS (Cross-Site Scripting)',          icon: '⚡' },
  'ransomware':          { label: 'برمجية الفدية (Ransomware)',                icon: '🔒' },
  'phishing':            { label: 'هجوم التصيد (Phishing)',                    icon: '🎣' },
  'lateral-movement':    { label: 'الحركة الجانبية (Lateral Movement)',        icon: '↔️' },
  'privilege-escalation':{ label: 'تصعيد الصلاحيات (Privilege Escalation)',    icon: '⬆️' },
  'dos':                 { label: 'هجوم حجب الخدمة (DoS/DDoS)',                icon: '🌊' },
  'malware':             { label: 'برمجية خبيثة (Malware)',                    icon: '🦠' },
  'reconnaissance':      { label: 'الاستطلاع والاستكشاف (Reconnaissance)',     icon: '🔍' },
  'insider-threat':      { label: 'تهديد داخلي (Insider Threat)',              icon: '👤' },
};

const LOG_TYPE_META: Record<string, { label: string; icon: string; gradient: string }> = {
  'apache':   { label: 'سجل Apache',         icon: '🪶', gradient: 'linear-gradient(135deg, #d62828, #ad1f1f)' },
  'nginx':    { label: 'سجل Nginx',          icon: '🟢', gradient: 'linear-gradient(135deg, #009639, #007a2e)' },
  'syslog':   { label: 'سجل النظام (Syslog)', icon: '🖥️', gradient: 'linear-gradient(135deg, #4b5563, #1f2937)' },
  'auth':     { label: 'سجل المصادقة (Auth)', icon: '🔐', gradient: 'linear-gradient(135deg, #2563eb, #1d4ed8)' },
  'firewall': { label: 'سجل الجدار الناري',   icon: '🧱', gradient: 'linear-gradient(135deg, #ea580c, #c2410c)' },
  'waf':      { label: 'سجل WAF',             icon: '🛡️', gradient: 'linear-gradient(135deg, #0ea5e9, #0369a1)' },
  'iis':      { label: 'سجل IIS',             icon: '🪟', gradient: 'linear-gradient(135deg, #0078d4, #005a9e)' },
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const DIFFICULTY_META: Record<string, { color: string; bg: string; border: string }> = {
  'مبتدئ':  { color: '#34d399', bg: 'rgba(52, 211, 153, 0.12)',  border: 'rgba(52, 211, 153, 0.35)' },
  'متوسط':  { color: '#fbbf24', bg: 'rgba(251, 191, 36, 0.12)',  border: 'rgba(251, 191, 36, 0.35)' },
  'قوي':    { color: '#f87171', bg: 'rgba(248, 113, 113, 0.12)', border: 'rgba(248, 113, 113, 0.35)' },
};

export default function LogAnalysisEditor({
  challenge,
  onSubmit,
  onBack,
  isVerifying,
  result,
}: LogAnalysisEditorProps) {
  const [attackType, setAttackType] = useState('');
  const [attackerIp, setAttackerIp] = useState('');
  const [timestamp, setTimestamp] = useState('');
  const [ioc, setIoc] = useState('');
  const [explanation, setExplanation] = useState('');
  const [showHints, setShowHints] = useState(false);
  const [usedHints, setUsedHints] = useState<number[]>([]);
  const [downloadStatus, setDownloadStatus] = useState<'idle' | 'downloading' | 'downloaded' | 'error'>('idle');
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadError, setDownloadError] = useState('');
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const submitAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setAttackType('');
    setAttackerIp('');
    setTimestamp('');
    setIoc('');
    setExplanation('');
    setShowHints(false);
    setUsedHints([]);
    setDownloadStatus('idle');
    setDownloadError('');
    setDownloadProgress(0);
  }, [challenge?.id]);

  const handleDownload = async () => {
    if (!challenge.log_url) {
      setDownloadError('رابط الملف غير متوفر');
      setDownloadStatus('error');
      return;
    }
    setDownloadStatus('downloading');
    setDownloadError('');
    setDownloadProgress(0);

    try {
      const fileName = challenge.storage_path?.split('/').pop() || `log-${challenge.scenarioId.slice(0, 8)}.log`;
      const res = await fetch(challenge.log_url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const contentLength = +(res.headers.get('Content-Length') ?? '0') || challenge.file_size_bytes || 0;
      const reader = res.body?.getReader();
      const chunks: BlobPart[] = [];
      let received = 0;

      if (reader && contentLength) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          received += value.length;
          setDownloadProgress(Math.round((received / contentLength) * 100));
        }
      } else {
        const blob = await res.blob();
        chunks.push(new Uint8Array(await blob.arrayBuffer()));
        setDownloadProgress(100);
      }

      const blob = new Blob(chunks as BlobPart[]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setDownloadStatus('downloaded');
      setDownloadProgress(100);
    } catch (e) {
      setDownloadError('فشل تنزيل الملف');
      setDownloadStatus('error');
    }
  };

  const handleShowHints = () => {
    if (!showHints) {
      const allLevels = challenge.hints?.map(h => h.level) || [];
      setUsedHints(allLevels);
    }
    setShowHints(!showHints);
  };

  const isValid = attackType.trim() && attackerIp.trim() && timestamp.trim() && ioc.trim();
  const canSubmit = !isVerifying && isValid && downloadStatus === 'downloaded';

  const handleSubmit = async () => {
    if (!canSubmit) {
      submitAreaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    await onSubmit({ attackType, attackerIp, timestamp, ioc, explanation });
  };

  const logTypeMeta = LOG_TYPE_META[challenge.log_type] || {
    label: challenge.log_type,
    icon: '📄',
    gradient: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
  };
  const diffMeta = DIFFICULTY_META[challenge.difficulty] || DIFFICULTY_META['متوسط'];
  const fileName = challenge.storage_path?.split('/').pop() || `log-${challenge.scenarioId?.slice(0, 8)}.log`;

  const fields = [
    { id: 'attackType', num: 1, label: 'نوع الهجوم', value: attackType, set: setAttackType, type: 'select' },
    { id: 'attackerIp', num: 2, label: 'عنوان IP المهاجم', value: attackerIp, set: setAttackerIp, type: 'input', placeholder: 'مثال: 185.220.101.45' },
    { id: 'timestamp', num: 3, label: 'الطابع الزمني للحادثة', value: timestamp, set: setTimestamp, type: 'input', placeholder: 'مثال: 15/Dec/2024:14:32:18' },
    { id: 'ioc', num: 4, label: 'مؤشر الاختراق (IOC)', value: ioc, set: setIoc, type: 'input', placeholder: 'URL, hash, UA, payload...' },
  ];

  return (
    <div className="log-analysis-v2">
      {/* Animated background */}
      <div className="la-bg-grid" aria-hidden="true" />
      <div className="la-bg-glow la-bg-glow-1" aria-hidden="true" />
      <div className="la-bg-glow la-bg-glow-2" aria-hidden="true" />

      {/* Mission bar (sticky) */}
      <div className="la-mission-bar">
        <div className="la-mb-brand">
          <div className="la-mb-brand-icon">CA</div>
          <div className="la-mb-brand-text">
            <span className="la-mb-brand-name">CYBERARENA</span>
            <span className="la-mb-brand-sub">SOC Console</span>
          </div>
        </div>

        <div className="la-mb-divider" />

        <div className="la-mb-mission">
          <span className="la-mb-mission-label">Mission</span>
          <span className="la-mb-mission-id">{challenge.scenarioId?.slice(0, 8) || 'live'}</span>
        </div>

        <div className="la-mb-status">
          <span className="la-pulse-dot" />
          <span>Live</span>
        </div>

        <button onClick={onBack} className="la-mb-back">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
          <span>العودة</span>
        </button>
      </div>

      {/* Mission header */}
      <div className="la-mission-header">
        <div className="la-mh-icon" style={{ background: logTypeMeta.gradient }}>
          <span>{logTypeMeta.icon}</span>
        </div>
        <div className="la-mh-content">
          <div className="la-mh-eyebrow">
            <span>◆</span>
            <span>Log Analysis Mission</span>
          </div>
          <h1 className="la-mh-title">{challenge.title}</h1>
          <div className="la-mh-chips">
            <span className="la-chip">
              <span className="la-chip-dot" style={{ background: logTypeMeta.gradient }} />
              {logTypeMeta.label}
            </span>
            <span className="la-chip" style={{ color: diffMeta.color, background: diffMeta.bg, borderColor: diffMeta.border }}>
              {challenge.difficulty}
            </span>
            <span className="la-chip la-chip-mono">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
              {formatBytes(challenge.file_size_bytes || 0)}
            </span>
            <span className="la-chip la-chip-xp">
              <span className="la-chip-xp-icon">⚡</span>
              <span>+{challenge.xp_reward} XP</span>
            </span>
          </div>
        </div>
        <div className="la-mh-side">
          <div className="la-mh-threat">
            <span className="la-mh-threat-label">Threat</span>
            <span className="la-mh-threat-value" style={{ color: diffMeta.color }}>{challenge.difficulty}</span>
          </div>
        </div>
      </div>

      {/* Story & task */}
      <section className="la-info-grid">
        <div className="la-info-card la-info-card-story">
          <div className="la-info-card-header">
            <span className="la-info-icon la-info-icon-story">📖</span>
            <h3>القصة</h3>
            <span className="la-info-card-tag">CONTEXT</span>
          </div>
          <p>{challenge.story}</p>
        </div>
        <div className="la-info-card la-info-card-task">
          <div className="la-info-card-header">
            <span className="la-info-icon la-info-icon-task">🎯</span>
            <h3>المهمة</h3>
            <span className="la-info-card-tag">OBJECTIVE</span>
          </div>
          <p>{challenge.task_outline || 'قم بتنزيل السجل وتحليله، ثم حدد نوع الهجوم وعنوان IP المهاجم والطابع الزمني ومؤشر الاختراق.'}</p>
        </div>
      </section>

      {/* 2-column main grid: main content + sidebar */}
      <div className="la-main-grid">
        {/* Main column */}
        <div className="la-main-column">
          {/* Form */}
          <section className="la-pane la-form-section">
            <div className="la-pane-header">
              <span className="la-pane-header-icon">✏️</span>
              <h2 className="la-pane-header-title">تحليلك</h2>
              <span className="la-pane-header-tag">STEP 02</span>
            </div>
            <p className="la-form-subtitle">حدّد الحقول أدناه بدقة — كل حقل صحيح يمنحك 25% من النتيجة</p>

            <div className="la-fields-grid">
              {fields.map((field) => (
                <div
                  key={field.id}
                  className={`la-field ${focusedField === field.id ? 'focused' : ''} ${field.value ? 'filled' : ''}`}
                >
                  <label className="la-field-label">
                    <span className="la-field-num">{field.num}</span>
                    <span>{field.label}</span>
                    <span className="la-field-required">*</span>
                  </label>
                  {field.type === 'select' ? (
                    <div className="la-field-select-wrap">
                      <select
                        className="la-field-input la-field-select"
                        value={field.value}
                        onChange={(e) => field.set(e.target.value)}
                        onFocus={() => setFocusedField(field.id)}
                        onBlur={() => setFocusedField(null)}
                        disabled={isVerifying}
                        dir="rtl"
                      >
                        <option value="">— اختر نوع الهجوم —</option>
                        {Object.entries(ATTACK_TYPES_AR).map(([key, { label, icon }]) => (
                          <option key={key} value={key}>{icon}  {label}</option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <input
                      type="text"
                      className="la-field-input"
                      value={field.value}
                      onChange={(e) => field.set(e.target.value)}
                      onFocus={() => setFocusedField(field.id)}
                      onBlur={() => setFocusedField(null)}
                      placeholder={field.placeholder}
                      dir="ltr"
                      disabled={isVerifying}
                    />
                  )}
                  {field.id === 'ioc' && (
                    <span className="la-field-helper">أي قيمة مميزة في السجل (URL, hash, UA, payload...)</span>
                  )}
                </div>
              ))}

              {/* Explanation */}
              <div className={`la-field la-field-full ${focusedField === 'explanation' ? 'focused' : ''}`}>
                <label className="la-field-label">
                  <span className="la-field-num la-field-num-optional">5</span>
                  <span>تحليل حر (اختياري)</span>
                </label>
                <textarea
                  className="la-field-textarea"
                  value={explanation}
                  onChange={(e) => setExplanation(e.target.value)}
                  onFocus={() => setFocusedField('explanation')}
                  onBlur={() => setFocusedField(null)}
                  placeholder="اشرح كيف وصلت إلى استنتاجاتك، ما السطور في السجل التي أوقعت في الشبهة، وما رأيك في حجم الهجوم وأثره..."
                  dir="rtl"
                  rows={4}
                  disabled={isVerifying}
                />
              </div>
            </div>
          </section>

          {/* Submit area */}
          <div className="la-submit-area" ref={submitAreaRef}>
            <button
              className={`la-submit-btn ${isVerifying ? 'loading' : ''} ${canSubmit ? 'ready' : ''}`}
              onClick={handleSubmit}
              disabled={isVerifying}
              type="button"
            >
              {isVerifying ? (
                <>
                  <svg className="la-spin" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M21 12a9 9 0 11-6.219-8.56" />
                  </svg>
                  <span>جارٍ التقييم...</span>
                </>
              ) : (
                <>
                  <span>أرسل التحليل</span>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="5" y1="12" x2="19" y2="12" />
                    <polyline points="12 5 19 12 12 19" />
                  </svg>
                </>
              )}
            </button>
          </div>

          {/* Result */}
          {result && (
            <section className={`la-pane la-result ${result.passed ? 'passed' : 'failed'}`}>
              <div className="la-pane-header">
                <span className="la-pane-header-icon">{result.passed ? '✅' : '⚠️'}</span>
                <h2 className="la-pane-header-title">نتيجة التحليل</h2>
                <span className="la-pane-header-tag">{result.passed ? 'PASSED' : 'INCOMPLETE'}</span>
              </div>

              <div className="la-result-header">
                <div className={`la-result-badge ${result.passed ? 'badge-pass' : 'badge-fail'}`}>
                  {result.passed ? (
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  )}
                </div>
                <div className="la-result-title-wrap">
                  <h2>{result.passed ? 'تحليل ممتاز!' : 'التحليل غير مكتمل'}</h2>
                  <p>{result.passed ? 'تم اجتياز التحدي بنجاح' : 'تحتاج لمراجعة بعض الحقول'}</p>
                </div>
                <div className="la-result-score">
                  <div className="la-result-score-num">{result.score}<span>%</span></div>
                  <div className="la-result-score-label">{result.correct_fields.length}/4 حقول صحيحة</div>
                </div>
              </div>

              <div className="la-result-progress">
                <div className="la-result-progress-fill" style={{ width: `${result.score}%` }} />
              </div>

              <div className="la-result-fields">
                {[
                  { key: 'نوع الهجوم', id: 'sqli' },
                  { key: 'عنوان IP المهاجم', id: 'attackerIp' },
                  { key: 'الطابع الزمني', id: 'timestamp' },
                  { key: 'مؤشر الاختراق (IOC)', id: 'ioc' },
                ].map((f) => {
                  const correct = result.correct_fields.includes(f.key);
                  return (
                    <div key={f.id} className={`la-result-field ${correct ? 'correct' : 'wrong'}`}>
                      <span className="la-result-field-icon">
                        {correct ? (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                        ) : (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                        )}
                      </span>
                      <span>{f.key}</span>
                    </div>
                  );
                })}
              </div>

              <div className="la-result-feedback">
                <h4>التغذية الراجعة</h4>
                <p>{result.feedback}</p>
              </div>
            </section>
          )}
        </div>

        {/* Sidebar */}
        <aside className="la-sidebar">
          {/* Download panel */}
          <section className={`la-pane la-download ${downloadStatus}`}>
            <div className="la-pane-header">
              <span className="la-pane-header-icon">⬇</span>
              <h2 className="la-pane-header-title">الدليل</h2>
              <span className="la-pane-header-tag">EVIDENCE</span>
            </div>
            <div className="la-download-content">
              <div className="la-download-info">
                <h3 className="la-download-title">{fileName}</h3>
                <div className="la-download-meta">
                  <span>{formatBytes(challenge.file_size_bytes || 0)}</span>
                  <span className="la-download-dot">•</span>
                  <span>{logTypeMeta.label}</span>
                </div>
                {downloadStatus === 'downloading' && (
                  <div className="la-progress">
                    <div className="la-progress-bar" style={{ width: `${downloadProgress}%` }} />
                    <span className="la-progress-text">{downloadProgress}%</span>
                  </div>
                )}
                {downloadStatus === 'error' && (
                  <div className="la-download-error">{downloadError || 'فشل تنزيل الملف'}</div>
                )}
                {downloadStatus === 'idle' && (
                  <div className="la-download-hint">⬆️ حمّل الملف أولاً للبدء بالتحليل</div>
                )}
              </div>
              <button
                className={`la-download-btn ${downloadStatus === 'downloading' ? 'loading' : ''} ${downloadStatus === 'downloaded' ? 'done' : ''}`}
                onClick={handleDownload}
                disabled={downloadStatus === 'downloading'}
              >
                {downloadStatus === 'downloading' ? (
                  <svg className="la-spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M21 12a9 9 0 11-6.219-8.56" />
                  </svg>
                ) : downloadStatus === 'downloaded' ? (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    <span>تم التنزيل</span>
                  </>
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    <span>تنزيل</span>
                  </>
                )}
              </button>
            </div>
          </section>

          {/* Stats card */}
          <section className="la-pane">
            <div className="la-pane-header">
              <span className="la-pane-header-icon">📊</span>
              <h2 className="la-pane-header-title">معلومات التحدي</h2>
              <span className="la-pane-header-tag">INTEL</span>
            </div>
            <div className="la-stats-grid">
              <div className="la-stat">
                <div className="la-stat-label">نوع السجل</div>
                <div className="la-stat-value">
                  <span className="la-stat-dot" style={{ background: logTypeMeta.gradient }} />
                  <span style={{ fontSize: '12px' }}>{logTypeMeta.label}</span>
                </div>
              </div>
              <div className="la-stat">
                <div className="la-stat-label">المستوى</div>
                <div className="la-stat-value" style={{ color: diffMeta.color, fontSize: '13px' }}>{challenge.difficulty}</div>
              </div>
              <div className="la-stat">
                <div className="la-stat-label">حجم الملف</div>
                <div className="la-stat-value" style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '12px' }}>{formatBytes(challenge.file_size_bytes || 0)}</div>
              </div>
              <div className="la-stat">
                <div className="la-stat-label">المكافأة</div>
                <div className="la-stat-value la-stat-xp" style={{ fontSize: '12px' }}>⚡ +{challenge.xp_reward} XP</div>
              </div>
            </div>
          </section>

          {/* Hints card */}
          <section className="la-pane">
            <button
              className={`la-pane-header la-hints-sidebar-btn ${showHints ? 'active' : ''}`}
              onClick={handleShowHints}
              type="button"
            >
              <span className="la-pane-header-icon">💡</span>
              <h2 className="la-pane-header-title">التلميحات</h2>
              <span className="la-hints-count">{usedHints.length}/{challenge.hints?.length || 0}</span>
              <span className="la-pane-header-tag" style={{ marginRight: 'auto' }}>HINTS</span>
            </button>
            {showHints && challenge.hints && (
              <div className="la-hints-list">
                {challenge.hints.map((hint) => (
                  <div key={hint.level} className="la-hint-card">
                    <div className="la-hint-header">
                      <span className="la-hint-level">تلميح {hint.level}</span>
                      <span className="la-hint-cost">-{hint.xp_cost} XP</span>
                    </div>
                    <p className="la-hint-text">{hint.text}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </aside>
      </div>

      {result && result.passed && (
        <SuccessCelebration
          xpReward={result.xp_awarded}
          feedback={result.feedback}
          onContinue={onBack}
        />
      )}
    </div>
  );
}


function SuccessCelebration({ xpReward, feedback, onContinue }: { xpReward: number; feedback: string; onContinue: () => void }) {
  const [count, setCount] = useState(0);
  const [confettiPieces] = useState(() =>
    Array.from({ length: 100 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 0.4,
      duration: 2 + Math.random() * 2,
      rotate: Math.random() * 360,
      color: ['#3b82f6', '#60a5fa', '#22d3ee', '#34d399', '#a78bfa', '#fbbf24'][Math.floor(Math.random() * 6)],
    }))
  );

  useEffect(() => {
    let start = 0;
    const duration = 1200;
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
    <div className="la-celebrate" role="dialog" aria-modal="true">
      <div className="la-celebrate-confetti">
        {confettiPieces.map((p) => (
          <span
            key={p.id}
            className="la-confetti-piece"
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

      <div className="la-celebrate-card">
        <div className="la-celebrate-ring">
          <svg className="la-celebrate-check" viewBox="0 0 52 52">
            <circle className="la-celebrate-check-circle" cx="26" cy="26" r="24" />
            <path className="la-celebrate-check-path" d="M14 27l7 7 16-16" />
          </svg>
        </div>
        <h2 className="la-celebrate-title">🔍 تحقيق ناجح!</h2>
        <p className="la-celebrate-subtitle">تم تحليل السجل بنجاح</p>

        <div className="la-celebrate-xp">
          <span className="la-celebrate-xp-plus">+</span>
          <span className="la-celebrate-xp-count">{count}</span>
          <span className="la-celebrate-xp-label">XP</span>
        </div>

        <p className="la-celebrate-feedback">{feedback}</p>

        <button className="la-celebrate-btn" onClick={onContinue}>
          <span>متابعة</span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>
    </div>
  );
}
