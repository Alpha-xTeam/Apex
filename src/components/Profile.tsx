import React, { useState, useEffect, useRef } from 'react';
import { 
  Award, 
  Verified, 
  Clock, 
  ChevronLeft, 
  Download, 
  ShieldCheck,
  Star
} from 'lucide-react';

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
}

export const Profile: React.FC<ProfileProps> = ({ user, onBack }) => {
  const [xp, setXp] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [showCert, setShowCert] = useState<Certificate | null>(null);
  const [customName, setCustomName] = useState(user.name);
  const certRef = useRef<HTMLDivElement>(null);

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

        // Fetch real certificates from DB
        console.log("Fetching certificates for user:", user.id);
        const certRes = await fetch(`${API_URL}/certificates`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'list', user_id: user.id }),
        });
        const certData = await certRes.json();
        console.log("Certificates received:", certData);
        if (certData.certificates) {
          setCertificates(certData.certificates);
        }
      } catch (err) {
        console.error('Error fetching profile:', err);
      }
    };
    fetchUserData();
  }, [user.id]);

  const levels = [
    { name: 'مبتدئ', min: 0, color: '#00d4aa' },
    { name: 'متقدم', min: 200, color: '#ffb300' },
    { name: 'خبير', min: 600, color: '#ff4d4d' },
    { name: 'سايبر ماستر', min: 1500, color: '#a855f7' }
  ];

  const userLevel = levels.slice().reverse().find(l => xp >= l.min) || levels[0];

  const handleDownloadCert = async (_cert: Certificate) => {
    if (!certRef.current) return;
    
    // Check if libraries are loaded from CDN
    if (!(window as any).html2canvas || !(window as any).jspdf) {
      alert('جاري تحميل أدوات تحويل PDF... يرجى الانتظار ثانية واحدة.');
      return;
    }

    try {
      const canvas = await (window as any).html2canvas(certRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff"
      });
      
      const imgData = canvas.toDataURL('image/png');
      const { jsPDF } = (window as any).jspdf;
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'px',
        format: [canvas.width, canvas.height]
      });
      
      pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
      pdf.save(`Certificate-${_cert.category}.pdf`);
    } catch (error) {
      console.error("PDF Export error:", error);
      alert('حدث خطأ أثناء تحميل الملف، سنقوم بفتح نافذة الطباعة كبديل.');
      window.print();
    }
  };

  return (
    <div className="profile-page" dir="rtl">
      <div className="profile-blur-1" />
      <div className="profile-blur-2" />

      <header className="profile-header">
        <button onClick={onBack} className="profile-back-btn">
          <ChevronLeft size={20} />
          العودة للوحة التحكم
        </button>
        <span className="profile-brand">CyberArena</span>
      </header>

      <main className="profile-content">
        {/* User Identity Card */}
        <section className="profile-id-card">
          <div className="profile-avatar-large">
            {user.name?.charAt(0) || 'U'}
          </div>
          <div className="profile-user-info">
            <h1>{user.name}</h1>
            <p>{user.email}</p>
            <div className="profile-tier-badge" style={{ backgroundColor: userLevel.color + '22', color: userLevel.color, borderColor: userLevel.color + '44' }}>
              <Star size={14} fill={userLevel.color} />
              {userLevel.name}
            </div>
          </div>
          <div className="profile-stats-row">
            <div className="p-stat">
              <span className="p-stat-val">{xp}</span>
              <span className="p-stat-lbl">XP مجموع النقاط</span>
            </div>
            <div className="p-stat">
              <span className="p-stat-val">{completedCount}</span>
              <span className="p-stat-lbl">تحدي مكتمل</span>
            </div>
          </div>
        </section>

        {/* Certificates Section */}
        <section className="profile-certs-section">
          <div className="section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Award size={24} className="text-yellow-500" />
              <h2>الشهادات الرقمية الذكية</h2>
            </div>
            <button 
              onClick={() => setShowCert({
                category: "Web Security Foundation",
                id: 'preview',
                issue_date: new Date().toISOString(),
                verify_code: "APEX-TEMP-2026",
                details: { full_name: customName || "Hasan Ali Hasan" }
              })}
              style={{ padding: '6px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#9ca3af', fontSize: '12px', cursor: 'pointer' }}
            >
              معاينة القالب
            </button>
          </div>

          <div style={{ marginBottom: '24px', background: 'rgba(31, 41, 55, 0.4)', padding: '20px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: '#9ca3af' }}>الاسم الذي سيظهر على الشهادة:</label>
            <input 
              type="text" 
              value={customName} 
              onChange={(e) => setCustomName(e.target.value)}
              style={{ width: '100%', padding: '12px', background: '#0b0e14', color: '#fff', border: '1px solid #333', borderRadius: '8px', fontFamily: 'inherit' }}
              placeholder="ادخل الاسم الكامل للشهادة..."
            />
          </div>
          
          {certificates.length === 0 ? (
            <div className="empty-certs">
              <ShieldCheck size={48} className="text-slate-700" />
              <p>لم تحصل على أي شهادات بعد. اكمل مساراً تعليمياً كاملاً للحصول على شهادتك الأولى!</p>
            </div>
          ) : (
            <div className="certs-grid">
              {certificates.map(cert => (
                <div key={cert.id} className="cert-card" onClick={() => setShowCert(cert)}>
                  <div className="cert-card-icon">
                    <Verified size={32} className="text-indigo-400" />
                  </div>
                  <div className="cert-card-info">
                    <h3>شهادة اتمام: {cert.category}</h3>
                    <div className="cert-meta">
                      <span><Clock size={12} /> {new Date(cert.issue_date).toLocaleDateString('ar-EG')}</span>
                      <span><Verified size={12} /> {cert.verify_code}</span>
                    </div>
                  </div>
                  <button className="cert-view-btn">
                    عرض الشهادة
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      {/* Certificate Modal Overlay */}
      {showCert && (
        <div className="cert-modal-overlay" onClick={() => setShowCert(null)}>
          <div className="cert-modal-content" onClick={e => e.stopPropagation()}>
            <div className="cert-document" ref={certRef}>
              <div className="cert-border" />
              <div className="cert-inner">
                <div className="cert-header">
                  <div className="cert-logo">CyberArena</div>
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
                    <div className="qr-placeholder" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px' }}>
                      <img src="/ALPHA-LOGO.png" alt="Logo" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                    </div>
                    <div className="verify-info">
                      <span className="v-label">Verification Code:</span>
                      <span className="v-code">{showCert.verify_code}</span>
                    </div>
                  </div>
                  <div className="cert-date">
                    <span className="v-label">Issue Date:</span>
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
              <button className="download-btn" onClick={() => handleDownloadCert(showCert)}>
                <Download size={18} /> Download as PDF
              </button>
              <button className="close-btn" onClick={() => setShowCert(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .profile-page {
          min-height: 100vh;
          background-color: #030712;
          color: #f3f4f6;
          position: relative;
          font-family: var(--font-arabic);
          overflow-x: hidden;
          padding-bottom: 60px;
        }

        .profile-blur-1 {
          position: absolute;
          top: -100px;
          right: -100px;
          width: 400px;
          height: 400px;
          background: radial-gradient(circle, rgba(99, 102, 241, 0.15) 0%, transparent 70%);
          filter: blur(60px);
          z-index: 0;
        }

        .profile-blur-2 {
          position: absolute;
          bottom: -100px;
          left: -100px;
          width: 400px;
          height: 400px;
          background: radial-gradient(circle, rgba(236, 72, 153, 0.1) 0%, transparent 70%);
          filter: blur(60px);
          z-index: 0;
        }

        .profile-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 24px 5%;
          position: relative;
          z-index: 10;
        }

        .profile-back-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          background: rgba(31, 41, 55, 0.5);
          border: 1px solid rgba(75, 85, 99, 0.3);
          color: #9ca3af;
          padding: 8px 16px;
          border-radius: 12px;
          cursor: pointer;
          font-family: inherit;
          transition: 0.2s;
        }

        .profile-back-btn:hover {
          color: #fff;
          background: rgba(31, 41, 55, 0.8);
          border-color: #6366f1;
        }

        .profile-brand {
          font-size: 24px;
          font-weight: 800;
          background: linear-gradient(to right, #6366f1, #a855f7);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .profile-content {
          max-width: 1000px;
          margin: 0 auto;
          padding: 0 20px;
          position: relative;
          z-index: 10;
        }

        .profile-id-card {
          background: rgba(17, 24, 39, 0.7);
          border: 1px solid rgba(255, 255, 255, 0.05);
          backdrop-filter: blur(20px);
          border-radius: 32px;
          padding: 40px;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          margin-bottom: 40px;
          box-shadow: 0 20px 50px -12px rgba(0, 0, 0, 0.5);
        }

        .profile-avatar-large {
          width: 120px;
          height: 120px;
          background: linear-gradient(135deg, #6366f1, #a855f7);
          border-radius: 40px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 48px;
          font-weight: bold;
          margin-bottom: 24px;
          box-shadow: 0 10px 30px rgba(99, 102, 241, 0.4);
        }

        .profile-user-info h1 {
          font-size: 32px;
          margin-bottom: 8px;
        }

        .profile-user-info p {
          color: #9ca3af;
          margin-bottom: 16px;
        }

        .profile-tier-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 14px;
          border-radius: 99px;
          font-weight: 600;
          font-size: 14px;
          border: 1px solid;
          margin-bottom: 32px;
        }

        .profile-stats-row {
          display: flex;
          gap: 40px;
          border-top: 1px solid rgba(255, 255, 255, 0.05);
          padding-top: 32px;
          width: 100%;
          justify-content: center;
        }

        .p-stat {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .p-stat-val {
          font-size: 28px;
          font-weight: 800;
          color: #fff;
        }

        .p-stat-lbl {
          font-size: 14px;
          color: #6b7280;
        }

        .section-title {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 24px;
        }

        .section-title h2 {
          font-size: 22px;
          font-weight: 700;
        }

        .empty-certs {
          background: rgba(17, 24, 39, 0.4);
          border: 2px dashed rgba(255, 255, 255, 0.05);
          border-radius: 24px;
          padding: 60px;
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 16px;
          color: #6b7280;
        }

        .certs-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 20px;
        }

        .cert-card {
          background: rgba(31, 41, 55, 0.4);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 20px;
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 16px;
          cursor: pointer;
          transition: 0.3s;
        }

        .cert-card:hover {
          background: rgba(31, 41, 55, 0.7);
          transform: translateY(-5px);
          border-color: #6366f1;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
        }

        .cert-card-info h3 {
          font-size: 18px;
          margin-bottom: 8px;
        }

        .cert-meta {
          display: flex;
          gap: 16px;
          font-size: 12px;
          color: #9ca3af;
        }

        .cert-meta span {
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .cert-view-btn {
          margin-top: 8px;
          background: rgba(99, 102, 241, 0.1);
          border: 1px solid rgba(99, 102, 241, 0.2);
          color: #818cf8;
          padding: 10px;
          border-radius: 12px;
          font-size: 14px;
          font-family: inherit;
          cursor: pointer;
          transition: 0.2s;
        }

        .cert-view-btn:hover {
          background: #6366f1;
          color: #fff;
        }

        /* Certificate Modal styles */
        .cert-modal-overlay {
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0, 0, 0, 0.9);
          backdrop-filter: blur(10px);
          z-index: 1000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }

        .cert-modal-content {
          max-width: 800px;
          width: 100%;
          display: flex;
          flex-direction: column;
          gap: 24px;
          animation: certPop 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }

        @keyframes certPop {
          from { transform: scale(0.9) translateY(20px); opacity: 0; }
          to { transform: scale(1) translateY(0); opacity: 1; }
        }

        .cert-document {
          background: #ffffff;
          color: #1f2937;
          border-radius: 12px;
          padding: 40px;
          position: relative;
          box-shadow: 0 40px 100px rgba(0, 0, 0, 0.8);
          aspect-ratio: 1.414 / 1;
          display: flex;
          flex-direction: column;
        }

        .cert-border {
          position: absolute;
          top: 15px; left: 15px; right: 15px; bottom: 15px;
          border: 1px solid #e5e7eb;
          pointer-events: none;
        }

        .cert-border::after {
          content: '';
          position: absolute;
          top: 5px; left: 5px; right: 5px; bottom: 5px;
          border: 2px solid #555c68;
        }

        .cert-inner {
          position: relative;
          height: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          z-index: 1;
        }

        .cert-logo {
          font-size: 28px;
          font-weight: 900;
          color: #030712;
          letter-spacing: -1px;
          margin-bottom: 5px;
        }

        .cert-type {
          font-size: 14px;
          text-transform: uppercase;
          letter-spacing: 2px;
          color: #6366f1;
          font-weight: 600;
          margin-bottom: 40px;
        }

        .cert-intro { font-size: 18px; margin-bottom: 10px; color: #6b7280; }
        .cert-user-name { font-size: 40px; font-weight: 800; color: #111827; margin-bottom: 20px; text-decoration: underline; text-decoration-color: #6366f1; }
        .cert-text { font-size: 18px; color: #4b5563; }
        .cert-category-name { font-size: 32px; font-weight: 700; color: #4f46e5; margin: 15px 0; }
        .cert-divider { width: 100px; height: 3px; background: #e5e7eb; margin: 20px auto; }
        .cert-details { font-size: 16px; line-height: 1.6; color: #6b7280; max-width: 600px; }

        .cert-footer {
          margin-top: auto;
          width: 100%;
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
        }

        .qr-placeholder {
          width: 70px;
          height: 70px;
          background: #f3f4f6;
          border: 1px solid #e5e7eb;
          margin-bottom: 8px;
        }

        .verify-info { display: flex; flex-direction: column; align-items: flex-start; }
        .v-label { font-size: 10px; color: #9ca3af; text-transform: uppercase; }
        .v-code { font-size: 12px; font-weight: 700; color: #374151; }

        .cert-date { display: flex; flex-direction: column; align-items: center; }
        .cert-sign { display: flex; flex-direction: column; align-items: center; gap: 8px; }
        .sign-line { width: 140px; height: 1px; background: #111827; }
        .cert-sign span { font-size: 14px; font-weight: 600; }

        .cert-modal-actions {
          display: flex;
          justify-content: center;
          gap: 16px;
        }

        .download-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          background: #6366f1;
          color: #fff;
          border: none;
          padding: 12px 24px;
          border-radius: 14px;
          font-weight: 600;
          cursor: pointer;
          font-family: inherit;
        }

        .close-btn {
          background: rgba(255, 255, 255, 0.1);
          color: #fff;
          border: 1px solid rgba(255, 255, 255, 0.2);
          padding: 12px 24px;
          border-radius: 14px;
          font-weight: 600;
          cursor: pointer;
          font-family: inherit;
        }

        @media (max-width: 768px) {
          .cert-document { padding: 20px; aspect-ratio: auto; min-height: 500px; }
          .cert-user-name { font-size: 28px; }
          .cert-category-name { font-size: 22px; }
          .cert-footer { flex-direction: column; align-items: center; gap: 20px; }
          .verify-info { align-items: center; }
        }

        @media print {
          body * {
            visibility: hidden;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .cert-modal-overlay, .cert-modal-overlay * {
            visibility: visible;
          }
          .cert-modal-overlay {
            position: fixed;
            left: 0;
            top: 0;
            width: 100%;
            height: 100%;
            background: white !important;
            padding: 0 !important;
            margin: 0 !important;
            display: block !important;
          }
          .cert-modal-content {
            box-shadow: none !important;
            transform: none !important;
            width: 100% !important;
            max-width: none !important;
            padding: 0 !important;
            margin: 0 !important;
            background: white !important;
          }
          .cert-document {
            width: 297mm !important;
            height: 210mm !important;
            margin: 0 auto !important;
            border: none !important;
            background: white !important;
            page-break-after: avoid;
            box-shadow: none !important;
          }
          .cert-modal-actions {
            display: none !important;
          }
          @page {
            size: landscape;
            margin: 0;
          }
        }
      `}</style>
    </div>
  );
};
