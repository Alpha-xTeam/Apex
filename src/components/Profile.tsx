import React, { useState, useEffect, useRef } from 'react';
import {
  Award,
  ChevronLeft,
  Download,
  ShieldCheck,
  Trophy,
  Zap,
  Calendar,
  Hash,
  Edit3,
  Check,
  X,
  LogOut,
  Lock,
  Activity,
  Shield,
  Cpu,
  Globe,
  Fingerprint,
  Crosshair,
} from 'lucide-react';
import { ShieldMark } from './ShieldMark';
import { useI18n } from '../i18n/I18nContext';
import { LanguageSwitcher } from './LanguageSwitcher';
import { Sidebar } from './Sidebar';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8090/api';

interface Certificate {
  id: string;
  category: string;
  issue_date: string;
  verify_code: string;
  details: any;
}

interface ProfileProps {
  user: { id: string; name: string; email: string };
  onBack: () => void;
  onLogout: () => void;
}

function getLevel(xp: number, levels: { minXp: number; name: string; color: string; rank: string }[]) {
  let level = levels[0];
  for (const l of levels) if (xp >= l.minXp) level = l;
  return level;
}

function getNextLevelXp(xp: number, levels: { minXp: number }[]) {
  for (const l of levels) if (xp < l.minXp) return l.minXp;
  return levels[levels.length - 1].minXp;
}

// Stable pseudo hash from user id (for display only)
function makeHash(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  const hex = Math.abs(h).toString(16).padStart(8, '0');
  return (hex + hex.split('').reverse().join('')).slice(0, 16).toUpperCase();
}

const getAuthHeaders = () => {
  const rawSession = localStorage.getItem('cyberarena_session');
  let token = '';
  if (rawSession) {
    try {
      const parsed = JSON.parse(rawSession);
      token = parsed.access_token || parsed.session?.access_token || '';
    } catch {}
  }
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  };
};

export const Profile: React.FC<ProfileProps> = ({ user, onBack, onLogout }) => {
  const { t, lang } = useI18n();
  const LEVELS = [
    { name: t.levels.beginner, minXp: 0, color: '#10b981', rank: 'L1' },
    { name: t.levels.advanced, minXp: 200, color: '#f59e0b', rank: 'L2' },
    { name: t.levels.expert, minXp: 600, color: '#ef4444', rank: 'L3' },
    { name: t.levels.master, minXp: 1500, color: '#8b5cf6', rank: 'L4' },
  ];
  const [xp, setXp] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [showCert, setShowCert] = useState<Certificate | null>(null);
  const [customName, setCustomName] = useState(user.name);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState(user.name);
  const [now, setNow] = useState(() => new Date());
  const [progress, setProgress] = useState<Record<string, { completions: number; required: number; ready: boolean }>>({});
  const [downloading, setDownloading] = useState(false);
  const certRef = useRef<HTMLDivElement>(null);

  const CERT_CATEGORIES = [
    { key: 'code-fixing', label: t.profile.catCodeFixing || 'Code Fixing', icon: '🛠' },
    { key: 'log-analysis', label: t.profile.catLogAnalysis || 'Log Analysis', icon: '🔍' },
    { key: 'vulnerability-hunter', label: t.profile.catVulnHunter || 'Vulnerability Hunter', icon: '🎯' },
  ];
  const CERT_REQUIRED = 50;

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const headers = getAuthHeaders();
        const res = await fetch(`${API_URL}/xp`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ action: 'get', user_id: user.id }),
        });
        const data = await res.json();
        setXp(data.xp || 0);
        setCompletedCount(data.completed_trainings || 0);

        const certRes = await fetch(`${API_URL}/certificates`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ action: 'list', user_id: user.id }),
        });
        const certData = await certRes.json();
        if (certData.certificates) setCertificates(certData.certificates);

        // Fetch per-category progress for the bars
        const prog: Record<string, { completions: number; required: number; ready: boolean }> = {};
        await Promise.all(CERT_CATEGORIES.map(async (c) => {
          try {
            const r = await fetch(
              `${API_URL}/certificates/progress?user_id=${encodeURIComponent(user.id)}&category=${encodeURIComponent(c.key)}`,
              { headers }
            );
            const pd = await r.json();
            prog[c.key] = { completions: pd.completions || 0, required: pd.required || CERT_REQUIRED, ready: !!pd.ready };
          } catch {
            prog[c.key] = { completions: 0, required: CERT_REQUIRED, ready: false };
          }
        }));
        setProgress(prog);
      } catch (err) {
        console.error('Error fetching profile:', err);
      }
    };
    fetchUserData();
  }, [user.id]);

  const level = getLevel(xp, LEVELS);
  const nextLevelXp = getNextLevelXp(xp, LEVELS);
  const xpProgress = nextLevelXp > 0 ? Math.min((xp / nextLevelXp) * 100, 100) : 100;
  const isMaxLevel = xp >= LEVELS[LEVELS.length - 1].minXp;
  const userHash = makeHash(user.id || user.email);
  const joinDate = new Date(2024, 0, 1);
  const daysActive = Math.max(1, Math.floor((now.getTime() - joinDate.getTime()) / 86_400_000));

  const handleDownloadCert = async (_cert: Certificate) => {
    setDownloading(true);
    try {
      const res = await fetch(`${API_URL}/certificates/${encodeURIComponent(_cert.id)}/pdf?lang=${encodeURIComponent(lang)}`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `CyberArena-Certificate-${_cert.category}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      console.error('PDF download error:', err);
      alert(t.profile.certDownloadError || 'PDF download failed');
    } finally {
      setDownloading(false);
    }
  };

  const handleIssueCert = async (category: string) => {
    try {
      const headers = getAuthHeaders();
      const res = await fetch(`${API_URL}/certificates`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ action: 'issue', user_id: user.id, category }),
      });
      const data = await res.json();
      if (data.status === 'issued' || data.status === 'already_issued') {
        const cert = data.certificate;
        // refresh list
        const certRes = await fetch(`${API_URL}/certificates`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ action: 'list', user_id: user.id }),
        });
        const certData = await certRes.json();
        if (certData.certificates) setCertificates(certData.certificates);
        setShowCert(cert);
      } else if (data.status === 'not_eligible') {
        alert(`${t.profile.certNotEligible || 'Not eligible'} (${data.completions}/${data.required})`);
      }
    } catch (err) {
      console.error('Issue cert error:', err);
    }
  };

  const saveName = () => {
    if (editedName.trim()) {
      setCustomName(editedName.trim());
      setIsEditingName(false);
    }
  };

  return (
    <div className="profile-page dash-page" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <div className="profile-grid-bg" aria-hidden="true" />
      <div className="profile-glow profile-glow-1" aria-hidden="true" />
      <div className="profile-glow profile-glow-2" aria-hidden="true" />
      <div className="profile-scanline" aria-hidden="true" />

      <Sidebar
        bottom={
          <>
            <div className="dash-nav-status" title={t.profile.secureConn}>
              <span className="dash-status-dot" />
            </div>
            <LanguageSwitcher />
            <button onClick={onBack} className="path-back-link">
              <ChevronLeft size={18} />
            </button>
            <button onClick={onLogout} className="dash-logout" />
          </>
        }
      />

      <main className="profile-main">
        <div className="profile-container">
          <section className="profile-hero">
            <div className="profile-hero-card">
              <div className="profile-hero-left">
                <div className="profile-hero-eyebrow">
                  <Fingerprint size={14} />
                  <span>{t.profile.identityTag}</span>
                </div>
                <h1 className="profile-hero-title">{t.profile.welcomeBack}، {customName?.split(' ')[0] || t.profile.traineeFallback}</h1>
                <p className="profile-hero-sub">{t.profile.welcomeSub}</p>

                <div className="profile-hero-stats">
                  <div className="profile-hero-stat">
                    <span className="profile-hero-stat-label">{t.profile.levelLabel}</span>
                    <span className="profile-hero-stat-value" style={{ color: level.color }}>{level.name}</span>
                  </div>
                  <div className="profile-hero-stat-divider" />
                  <div className="profile-hero-stat">
                    <span className="profile-hero-stat-label">{t.profile.rankLabel}</span>
                    <span className="profile-hero-stat-value mono">{level.rank}</span>
                  </div>
                  <div className="profile-hero-stat-divider" />
                  <div className="profile-hero-stat">
                    <span className="profile-hero-stat-label">{t.profile.xpLabel}</span>
                    <span className="profile-hero-stat-value mono">{xp.toLocaleString()}</span>
                  </div>
                </div>

                <div className="profile-progress">
                  <div className="profile-progress-info">
                    <span>{t.profile.progressLabel}</span>
                    <span className="mono" style={{ color: level.color }}>
                      {isMaxLevel ? t.profile.maxLevel : `${xp} / ${nextLevelXp}`}
                    </span>
                  </div>
                  <div className="profile-progress-bar">
                    <div className="profile-progress-fill" style={{ width: `${xpProgress}%`, background: level.color }} />
                  </div>
                </div>
              </div>

              <div className="profile-hero-right">
                <div className="profile-shield-stage">
                  <div className="profile-shield-halo" />
                  <ShieldMark size="lg" className="profile-shield" />
                  <div className="profile-shield-orbit profile-shield-orbit-1" />
                  <div className="profile-shield-orbit profile-shield-orbit-2" />
                </div>
                <div className="profile-hero-tagline">
                  <Lock size={12} />
                  <span>{t.profile.shieldActive}</span>
                </div>
              </div>
            </div>

            <div className="profile-hero-bottom">
              <div className="profile-meta-item">
                <Hash size={14} />
                <span className="profile-meta-label">{t.profile.idLabel}</span>
                <span className="mono profile-meta-value">{userHash}</span>
              </div>
              <div className="profile-meta-divider" />
              <div className="profile-meta-item">
                <Calendar size={14} />
                <span className="profile-meta-label">{t.profile.activeSince}</span>
                <span className="profile-meta-value">{daysActive} {t.profile.dayUnit}</span>
              </div>
              <div className="profile-meta-divider" />
              <div className="profile-meta-item">
                <Activity size={14} />
                <span className="profile-meta-label">{t.profile.lastActive}</span>
                <span className="profile-meta-value">{t.profile.now}</span>
              </div>
            </div>
          </section>

          <section className="profile-section profile-id-section">
            <div className="profile-section-head">
              <div className="profile-section-title">
                <span className="profile-section-tag">
                  <Shield size={12} />
                  <span>{t.profile.accountTag}</span>
                </span>
                <h2>{t.profile.accountInfo}</h2>
              </div>
            </div>

            <div className="profile-id-grid">
              <div className="profile-field">
                <label>
                  <Edit3 size={12} />
                  <span>{t.profile.displayName}</span>
                </label>
                {isEditingName ? (
                  <div className="profile-field-edit">
                    <input type="text" value={editedName} onChange={(e) => setEditedName(e.target.value)} autoFocus />
                    <button onClick={saveName} className="profile-field-save" aria-label={t.profile.save}>
                      <Check size={14} />
                    </button>
                    <button
                      onClick={() => { setIsEditingName(false); setEditedName(customName); }}
                      className="profile-field-cancel"
                      aria-label={t.profile.cancel}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <div className="profile-field-read">
                    <span>{customName || user.email}</span>
                    <button onClick={() => setIsEditingName(true)} aria-label={t.profile.edit}>
                      <Edit3 size={14} />
                    </button>
                  </div>
                )}
              </div>

              <div className="profile-field">
                <label>
                  <Globe size={12} />
                  <span>{t.profile.emailLabel}</span>
                </label>
                <div className="profile-field-read profile-field-read-mono">
                  <span>{user.email}</span>
                </div>
              </div>

              <div className="profile-field">
                <label>
                  <Fingerprint size={12} />
                  <span>{t.profile.traineeId}</span>
                </label>
                <div className="profile-field-read profile-field-read-mono">
                  <span>{userHash}</span>
                </div>
              </div>

              <div className="profile-field">
                <label>
                  <Cpu size={12} />
                  <span>{t.profile.region}</span>
                </label>
                <div className="profile-field-read">
                  <span>{t.profile.regionValue}</span>
                </div>
              </div>
            </div>
          </section>

          <section className="profile-metrics">
            <div className="profile-metric">
              <div className="profile-metric-icon" style={{ background: 'rgba(245,158,11,0.12)', color: '#f59e0b' }}>
                <Zap size={20} />
              </div>
              <div className="profile-metric-body">
                <span className="profile-metric-value mono">{xp.toLocaleString()}</span>
                <span className="profile-metric-label">{t.profile.metricXp}</span>
              </div>
              <div className="profile-metric-spark" />
            </div>

            <div className="profile-metric">
              <div className="profile-metric-icon" style={{ background: 'rgba(16,185,129,0.12)', color: '#10b981' }}>
                <Crosshair size={20} />
              </div>
              <div className="profile-metric-body">
                <span className="profile-metric-value mono">{completedCount}</span>
                <span className="profile-metric-label">{t.profile.metricCompleted}</span>
              </div>
              <div className="profile-metric-spark" />
            </div>

            <div className="profile-metric">
              <div className="profile-metric-icon" style={{ background: 'rgba(139,92,246,0.12)', color: '#8b5cf6' }}>
                <Award size={20} />
              </div>
              <div className="profile-metric-body">
                <span className="profile-metric-value mono">{certificates.length}</span>
                <span className="profile-metric-label">{t.profile.metricCerts}</span>
              </div>
              <div className="profile-metric-spark" />
            </div>

            <div className="profile-metric">
              <div className="profile-metric-icon" style={{ background: `${level.color}1f`, color: level.color }}>
                <Trophy size={20} />
              </div>
              <div className="profile-metric-body">
                <span className="profile-metric-value" style={{ color: level.color }}>{level.name}</span>
                <span className="profile-metric-label">{t.profile.metricRank}</span>
              </div>
              <div className="profile-metric-spark" />
            </div>
          </section>

          <section className="profile-section">
            <div className="profile-section-head">
              <div className="profile-section-title">
                <span className="profile-section-tag">
                  <Award size={12} />
                  <span>{t.profile.certTag}</span>
                </span>
                <h2>{t.profile.certTitle}</h2>
                <p>{t.profile.certSub}</p>
              </div>
              <div className="profile-cert-name-field">
                <label>{t.profile.certNameLabel}</label>
                <input
                  type="text"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder={t.profile.certNamePh}
                />
              </div>
            </div>

            <div className="profile-cert-progress">
              {CERT_CATEGORIES.map((c) => {
                const p = progress[c.key] || { completions: 0, required: CERT_REQUIRED, ready: false };
                const pct = p.required > 0 ? Math.min((p.completions / p.required) * 100, 100) : 0;
                const issued = certificates.some(cert => cert.category === c.key);
                return (
                  <div key={c.key} className={`profile-cert-progress-row ${p.ready || issued ? 'ready' : ''}`}>
                    <div className="profile-cert-progress-icon">{c.icon}</div>
                    <div className="profile-cert-progress-body">
                      <div className="profile-cert-progress-label">
                        <span>{c.label}</span>
                        <span className="mono">{p.completions}/{p.required}</span>
                      </div>
                      <div className="profile-cert-progress-bar">
                        <div className="profile-cert-progress-fill" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                    {!issued && (
                      <button
                        className="profile-cert-progress-btn"
                        onClick={() => handleIssueCert(c.key)}
                        disabled={!p.ready}
                        title={p.ready ? (t.profile.certIssue || 'Issue') : (t.profile.certNotEligible || 'Locked')}
                      >
                        {p.ready ? (t.profile.certIssue || 'Issue') : '🔒'}
                      </button>
                    )}
                    {issued && <span className="profile-cert-progress-badge">✓ {t.profile.certVerified}</span>}
                  </div>
                );
              })}
            </div>

            {certificates.length === 0 ? (
              <div className="profile-empty">
                <div className="profile-empty-icon">
                  <ShieldCheck size={36} />
                </div>
                <h3>{t.profile.certEmptyTitle}</h3>
                <p>{t.profile.certEmptySub}</p>
                <button onClick={onBack} className="profile-empty-cta">
                  {t.profile.certEmptyCta}
                </button>
              </div>
            ) : (
              <div className="profile-certs-grid">
                {certificates.map((cert) => (
                  <article
                    key={cert.id}
                    className="profile-cert-card"
                    onClick={() => setShowCert(cert)}
                  >
                    <div className="profile-cert-shield">
                      <ShieldMark size="sm" />
                    </div>
                    <div className="profile-cert-info">
                      <span className="profile-cert-tag">{t.profile.certVerified}</span>
                      <h3>{cert.category}</h3>
                      <div className="profile-cert-meta">
                        <span>
                          <Calendar size={11} />
                          {new Date(cert.issue_date).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US', {
                            year: 'numeric', month: 'long', day: 'numeric',
                          })}
                        </span>
                        <span className="mono">
                          <Hash size={11} />
                          {cert.verify_code}
                        </span>
                      </div>
                    </div>
                    <div className="profile-cert-arrow">
                      <ChevronLeft size={16} />
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>

      {/* CERTIFICATE MODAL */}
      {showCert && (
        <div className="cert-modal-overlay" onClick={() => setShowCert(null)}>
          <div className="cert-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="cert-document" ref={certRef}>
              <div className="cert-border" />
              <div className="cert-corner cert-corner-tl" />
              <div className="cert-corner cert-corner-tr" />
              <div className="cert-corner cert-corner-bl" />
              <div className="cert-corner cert-corner-br" />
              <div className="cert-inner">
                <div className="cert-header">
                  <div className="cert-brand">
                    <span className="cert-brand-mark">◆</span>
                    <span>CyberArena</span>
                  </div>
                  <div className="cert-type" dir="ltr">
                    {lang === 'ar' ? 'شهادة إتمام في الأمن السيبراني' : 'Cybersecurity Achievement Certificate'}
                  </div>
                </div>

                <div className="cert-body" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
                  <p className="cert-intro">
                    {lang === 'ar' ? 'نشهد بأن' : 'This is to certify that'}
                  </p>
                  <h2 className="cert-user-name" dir="auto">{customName || user.name}</h2>
                  <p className="cert-text">
                    {lang === 'ar'
                      ? 'قد أكمل بنجاح جميع التحديات التفاعلية والمختبرات العملية في:'
                      : 'Has successfully completed all interactive challenges and practical labs in:'}
                  </p>
                  <h3 className="cert-category-name" dir="ltr">{showCert.category}</h3>
                  <div className="cert-divider" />
                  <p className="cert-details">
                    {lang === 'ar'
                      ? 'أظهر المستلم كفاءة استثنائية في تحليل الثغرات وتحصين الأنظمة واستراتيجيات الدفاع النشط باستخدام محاكاة أمنية مدعومة بالذكاء الاصطناعي.'
                      : 'The recipient has demonstrated exceptional proficiency in vulnerability analysis, system hardening, and active defense strategies using AI-driven security simulations.'}
                  </p>
                </div>

                <div className="cert-footer">
                  <div className="cert-verification">
                    <div className="qr-placeholder">
                      <img src="/ALPHA-LOGO.png" alt="Logo" />
                    </div>
                    <div className="verify-info" dir="ltr">
                      <span className="v-label">{lang === 'ar' ? 'رمز التحقق' : 'Verification Code'}</span>
                      <span className="v-code">{showCert.verify_code}</span>
                    </div>
                  </div>
                  <div className="cert-date" dir="ltr">
                    <span className="v-label">{lang === 'ar' ? 'تاريخ الإصدار' : 'Issue Date'}</span>
                    <span className="v-code">{new Date(showCert.issue_date).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US')}</span>
                  </div>
                  <div className="cert-sign" dir="ltr">
                    <div className="sign-line" />
                    <span>{lang === 'ar' ? 'مجلس إدارة أكاديمية ألفا' : 'Alpha Academy Board'}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="cert-modal-actions">
              <button className="cert-download-btn" onClick={() => handleDownloadCert(showCert)} disabled={downloading}>
                <Download size={16} />
                <span>{downloading ? (t.profile.certDownloadLoading || '...') : t.profile.certDownload}</span>
              </button>
              <button className="cert-close-btn" onClick={() => setShowCert(null)}>
                {t.profile.certClose}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
