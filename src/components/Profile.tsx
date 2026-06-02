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

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080/api';

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

const LEVELS = [
  { name: 'مبتدئ', minXp: 0, color: '#10b981', rank: 'L1' },
  { name: 'متقدم', minXp: 200, color: '#f59e0b', rank: 'L2' },
  { name: 'خبير', minXp: 600, color: '#ef4444', rank: 'L3' },
  { name: 'سايبر ماستر', minXp: 1500, color: '#8b5cf6', rank: 'L4' },
];

function getLevel(xp: number) {
  let level = LEVELS[0];
  for (const l of LEVELS) if (xp >= l.minXp) level = l;
  return level;
}

function getNextLevelXp(xp: number) {
  for (const l of LEVELS) if (xp < l.minXp) return l.minXp;
  return LEVELS[LEVELS.length - 1].minXp;
}

// Stable pseudo hash from user id (for display only)
function makeHash(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  const hex = Math.abs(h).toString(16).padStart(8, '0');
  return (hex + hex.split('').reverse().join('')).slice(0, 16).toUpperCase();
}

export const Profile: React.FC<ProfileProps> = ({ user, onBack, onLogout }) => {
  const [xp, setXp] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [showCert, setShowCert] = useState<Certificate | null>(null);
  const [customName, setCustomName] = useState(user.name);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState(user.name);
  const [now, setNow] = useState(() => new Date());
  const certRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const res = await fetch(`${API_URL}/xp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'get', user_id: user.id }),
        });
        const data = await res.json();
        setXp(data.xp || 0);
        setCompletedCount(data.completed_trainings || 0);

        const certRes = await fetch(`${API_URL}/certificates`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'list', user_id: user.id }),
        });
        const certData = await certRes.json();
        if (certData.certificates) setCertificates(certData.certificates);
      } catch (err) {
        console.error('Error fetching profile:', err);
      }
    };
    fetchUserData();
  }, [user.id]);

  const level = getLevel(xp);
  const nextLevelXp = getNextLevelXp(xp);
  const xpProgress = nextLevelXp > 0 ? Math.min((xp / nextLevelXp) * 100, 100) : 100;
  const isMaxLevel = xp >= LEVELS[LEVELS.length - 1].minXp;
  const userHash = makeHash(user.id || user.email);
  const joinDate = new Date(2024, 0, 1);
  const daysActive = Math.max(1, Math.floor((now.getTime() - joinDate.getTime()) / 86_400_000));

  const handleDownloadCert = async (_cert: Certificate) => {
    if (!certRef.current) return;
    if (!(window as any).html2canvas || !(window as any).jspdf) {
      alert('جاري تحميل أدوات تحويل PDF... يرجى الانتظار ثانية واحدة.');
      return;
    }
    try {
      const canvas = await (window as any).html2canvas(certRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
      });
      const imgData = canvas.toDataURL('image/png');
      const { jsPDF } = (window as any).jspdf;
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'px',
        format: [canvas.width, canvas.height],
      });
      pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
      pdf.save(`Certificate-${_cert.category}.pdf`);
    } catch (error) {
      console.error('PDF Export error:', error);
      alert('حدث خطأ أثناء تحميل الملف، سنقوم بفتح نافذة الطباعة كبديل.');
      window.print();
    }
  };

  const saveName = () => {
    if (editedName.trim()) {
      setCustomName(editedName.trim());
      setIsEditingName(false);
    }
  };

  return (
    <div className="profile-page" dir="rtl">
      {/* Decorative background */}
      <div className="profile-grid-bg" aria-hidden="true" />
      <div className="profile-glow profile-glow-1" aria-hidden="true" />
      <div className="profile-glow profile-glow-2" aria-hidden="true" />
      <div className="profile-scanline" aria-hidden="true" />

      <header className="dash-header">
        <div className="dash-header-inner">
          <a href="/" className="dash-logo">CyberArena</a>
          <div className="dash-header-right">
            <div className="profile-status-pill">
              <span className="profile-status-dot" />
              <span>اتصال آمن</span>
            </div>
            <button onClick={onBack} className="dash-back-pill">
              <ChevronLeft size={16} />
              <span>العودة للوحة التحكم</span>
            </button>
            <button onClick={onLogout} className="dash-logout">
              <LogOut size={14} />
              <span>خروج</span>
            </button>
          </div>
        </div>
      </header>

      <main className="profile-main">
        <div className="profile-container">
          {/* HERO: identity + shield visual */}
          <section className="profile-hero">
            <div className="profile-hero-card">
              <div className="profile-hero-left">
                <div className="profile-hero-eyebrow">
                  <Fingerprint size={14} />
                  <span>هوية المتدرب</span>
                </div>
                <h1 className="profile-hero-title">مرحباً بعودتك، {customName?.split(' ')[0] || 'متدرب'}</h1>
                <p className="profile-hero-sub">
                  أنت متصل الآن بمنصة CyberArena التدريبية. رحلتك في عالم الأمن السيبراني مستمرة.
                </p>

                <div className="profile-hero-stats">
                  <div className="profile-hero-stat">
                    <span className="profile-hero-stat-label">المستوى</span>
                    <span className="profile-hero-stat-value" style={{ color: level.color }}>
                      {level.name}
                    </span>
                  </div>
                  <div className="profile-hero-stat-divider" />
                  <div className="profile-hero-stat">
                    <span className="profile-hero-stat-label">الرتبة</span>
                    <span className="profile-hero-stat-value mono">{level.rank}</span>
                  </div>
                  <div className="profile-hero-stat-divider" />
                  <div className="profile-hero-stat">
                    <span className="profile-hero-stat-label">النقاط</span>
                    <span className="profile-hero-stat-value mono">{xp.toLocaleString()}</span>
                  </div>
                </div>

                <div className="profile-progress">
                  <div className="profile-progress-info">
                    <span>التقدم للمستوى التالي</span>
                    <span className="mono" style={{ color: level.color }}>
                      {isMaxLevel ? '◆ أعلى مستوى' : `${xp} / ${nextLevelXp}`}
                    </span>
                  </div>
                  <div className="profile-progress-bar">
                    <div
                      className="profile-progress-fill"
                      style={{ width: `${xpProgress}%`, background: level.color }}
                    />
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
                  <span>درعك الرقمي • مُفعّل</span>
                </div>
              </div>
            </div>

            <div className="profile-hero-bottom">
              <div className="profile-meta-item">
                <Hash size={14} />
                <span className="profile-meta-label">ID</span>
                <span className="mono profile-meta-value">{userHash}</span>
              </div>
              <div className="profile-meta-divider" />
              <div className="profile-meta-item">
                <Calendar size={14} />
                <span className="profile-meta-label">نشط منذ</span>
                <span className="profile-meta-value">{daysActive} يوم</span>
              </div>
              <div className="profile-meta-divider" />
              <div className="profile-meta-item">
                <Activity size={14} />
                <span className="profile-meta-label">آخر نشاط</span>
                <span className="profile-meta-value">الآن</span>
              </div>
            </div>
          </section>

          {/* IDENTITY EDIT + ACCOUNT INFO */}
          <section className="profile-section profile-id-section">
            <div className="profile-section-head">
              <div className="profile-section-title">
                <span className="profile-section-tag">
                  <Shield size={12} />
                  <span>الحساب</span>
                </span>
                <h2>معلومات الحساب</h2>
              </div>
            </div>

            <div className="profile-id-grid">
              <div className="profile-field">
                <label>
                  <Edit3 size={12} />
                  <span>الاسم الظاهر</span>
                </label>
                {isEditingName ? (
                  <div className="profile-field-edit">
                    <input
                      type="text"
                      value={editedName}
                      onChange={(e) => setEditedName(e.target.value)}
                      autoFocus
                    />
                    <button onClick={saveName} className="profile-field-save" aria-label="حفظ">
                      <Check size={14} />
                    </button>
                    <button
                      onClick={() => {
                        setIsEditingName(false);
                        setEditedName(customName);
                      }}
                      className="profile-field-cancel"
                      aria-label="إلغاء"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <div className="profile-field-read">
                    <span>{customName || user.email}</span>
                    <button onClick={() => setIsEditingName(true)} aria-label="تعديل">
                      <Edit3 size={14} />
                    </button>
                  </div>
                )}
              </div>

              <div className="profile-field">
                <label>
                  <Globe size={12} />
                  <span>البريد الإلكتروني</span>
                </label>
                <div className="profile-field-read profile-field-read-mono">
                  <span>{user.email}</span>
                </div>
              </div>

              <div className="profile-field">
                <label>
                  <Fingerprint size={12} />
                  <span>معرّف المتدرب</span>
                </label>
                <div className="profile-field-read profile-field-read-mono">
                  <span>{userHash}</span>
                </div>
              </div>

              <div className="profile-field">
                <label>
                  <Cpu size={12} />
                  <span>المنطقة</span>
                </label>
                <div className="profile-field-read">
                  <span>🇮🇶 بابل، العراق</span>
                </div>
              </div>
            </div>
          </section>

          {/* 4 METRIC CARDS */}
          <section className="profile-metrics">
            <div className="profile-metric">
              <div className="profile-metric-icon" style={{ background: 'rgba(245,158,11,0.12)', color: '#f59e0b' }}>
                <Zap size={20} />
              </div>
              <div className="profile-metric-body">
                <span className="profile-metric-value mono">{xp.toLocaleString()}</span>
                <span className="profile-metric-label">نقاط الخبرة</span>
              </div>
              <div className="profile-metric-spark" />
            </div>

            <div className="profile-metric">
              <div className="profile-metric-icon" style={{ background: 'rgba(16,185,129,0.12)', color: '#10b981' }}>
                <Crosshair size={20} />
              </div>
              <div className="profile-metric-body">
                <span className="profile-metric-value mono">{completedCount}</span>
                <span className="profile-metric-label">مهمة مكتملة</span>
              </div>
              <div className="profile-metric-spark" />
            </div>

            <div className="profile-metric">
              <div className="profile-metric-icon" style={{ background: 'rgba(139,92,246,0.12)', color: '#8b5cf6' }}>
                <Award size={20} />
              </div>
              <div className="profile-metric-body">
                <span className="profile-metric-value mono">{certificates.length}</span>
                <span className="profile-metric-label">شهادة ممنوحة</span>
              </div>
              <div className="profile-metric-spark" />
            </div>

            <div className="profile-metric">
              <div className="profile-metric-icon" style={{ background: `${level.color}1f`, color: level.color }}>
                <Trophy size={20} />
              </div>
              <div className="profile-metric-body">
                <span className="profile-metric-value" style={{ color: level.color }}>{level.name}</span>
                <span className="profile-metric-label">الرتبة الحالية</span>
              </div>
              <div className="profile-metric-spark" />
            </div>
          </section>

          {/* CERTIFICATES */}
          <section className="profile-section">
            <div className="profile-section-head">
              <div className="profile-section-title">
                <span className="profile-section-tag">
                  <Award size={12} />
                  <span>الإنجازات</span>
                </span>
                <h2>الشهادات الرقمية</h2>
                <p>كل شهادة هي رمز وصول لمجال متقدم في الأمن السيبراني.</p>
              </div>
              <div className="profile-cert-name-field">
                <label>الاسم على الشهادة</label>
                <input
                  type="text"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="ادخل اسمك الكامل"
                />
              </div>
            </div>

            {certificates.length === 0 ? (
              <div className="profile-empty">
                <div className="profile-empty-icon">
                  <ShieldCheck size={36} />
                </div>
                <h3>لا توجد شهادات بعد</h3>
                <p>أكمل مسارك التدريبي الأول لتحصل على أول رمز وصول.</p>
                <button onClick={onBack} className="profile-empty-cta">
                  ابدأ التدريب
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
                      <span className="profile-cert-tag">شهادة مُتحققة</span>
                      <h3>{cert.category}</h3>
                      <div className="profile-cert-meta">
                        <span>
                          <Calendar size={11} />
                          {new Date(cert.issue_date).toLocaleDateString('ar-EG', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
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
                  <div className="cert-type">Cybersecurity Achievement Certificate</div>
                </div>

                <div className="cert-body">
                  <p className="cert-intro">This is to certify that</p>
                  <h2 className="cert-user-name">{customName || user.name}</h2>
                  <p className="cert-text">
                    Has successfully completed all interactive challenges and practical labs in:
                  </p>
                  <h3 className="cert-category-name">{showCert.category}</h3>
                  <div className="cert-divider" />
                  <p className="cert-details">
                    The recipient has demonstrated exceptional proficiency in vulnerability analysis,
                    system hardening, and active defense strategies using AI-driven security simulations.
                  </p>
                </div>

                <div className="cert-footer">
                  <div className="cert-verification">
                    <div className="qr-placeholder">
                      <img src="/ALPHA-LOGO.png" alt="Logo" />
                    </div>
                    <div className="verify-info">
                      <span className="v-label">Verification Code</span>
                      <span className="v-code">{showCert.verify_code}</span>
                    </div>
                  </div>
                  <div className="cert-date">
                    <span className="v-label">Issue Date</span>
                    <span className="v-code">{new Date(showCert.issue_date).toLocaleDateString('en-US')}</span>
                  </div>
                  <div className="cert-sign">
                    <div className="sign-line" />
                    <span>Academic Board Administration</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="cert-modal-actions">
              <button className="cert-download-btn" onClick={() => handleDownloadCert(showCert)}>
                <Download size={16} />
                <span>تحميل PDF</span>
              </button>
              <button className="cert-close-btn" onClick={() => setShowCert(null)}>
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
