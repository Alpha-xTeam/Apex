import React, { useState, useEffect } from 'react';
import { useI18n } from '../i18n/I18nContext';
import { ArrowLeft, X, Check } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8090/api';

interface VerifyData {
  valid: boolean;
  verify_code: string;
  certificate_id: string;
  user_name: string;
  category: string;
  title: string;
  issue_date: string;
}

export const CertificateVerify: React.FC<{ verifyCode?: string; onBack: () => void }> = ({ verifyCode, onBack }) => {
  const { t, lang } = useI18n();
  const [data, setData] = useState<VerifyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      if (!verifyCode) {
        setError('No verification code provided');
        setLoading(false);
        return;
      }
      try {
        const r = await fetch(`${API_URL}/certificates/verify/${encodeURIComponent(verifyCode)}`);
        if (!r.ok) {
          if (r.status === 404) {
            setError('Certificate not found');
          } else {
            setError(`HTTP ${r.status}`);
          }
          setLoading(false);
          return;
        }
        const d = await r.json();
        if (d.valid) {
          setData(d);
        } else {
          setError(d.error || 'Invalid certificate');
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Network error');
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [verifyCode]);

  return (
    <div className="cert-verify-page" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <header className="cert-verify-header">
        <button onClick={onBack} className="cert-verify-back">
          <ArrowLeft size={16} />
          <span>{t.certVerify?.back || 'Back'}</span>
        </button>
        <div className="cert-verify-brand">CyberArena</div>
      </header>

      <main className="cert-verify-main">
        <div className={`cert-verify-card ${data ? 'valid' : error ? 'invalid' : ''}`}>
          {loading ? (
            <div className="cert-verify-loading">
              <div className="cert-verify-spinner" />
              <p>{t.certVerify?.checking || 'Verifying...'}</p>
            </div>
          ) : data ? (
            <>
              <div className="cert-verify-icon valid-icon">
                <Check size={48} />
              </div>
              <h1 className="cert-verify-title">
                {t.certVerify?.validTitle || 'Valid Certificate'}
              </h1>
              <p className="cert-verify-subtitle">
                {t.certVerify?.validSub || 'This certificate has been verified by CyberArena.'}
              </p>

              <div className="cert-verify-details">
                <div className="cert-verify-field">
                  <span className="cert-verify-label">{t.certVerify?.name || 'Recipient'}</span>
                  <span className="cert-verify-value" dir="auto">{data.user_name}</span>
                </div>
                <div className="cert-verify-field">
                  <span className="cert-verify-label">{t.certVerify?.title || 'Title'}</span>
                  <span className="cert-verify-value">{data.title || data.category}</span>
                </div>
                <div className="cert-verify-field">
                  <span className="cert-verify-label">{t.certVerify?.category || 'Category'}</span>
                  <span className="cert-verify-value mono">{data.category}</span>
                </div>
                <div className="cert-verify-field">
                  <span className="cert-verify-label">{t.certVerify?.date || 'Issue Date'}</span>
                  <span className="cert-verify-value">
                    {new Date(data.issue_date).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US', {
                      year: 'numeric', month: 'long', day: 'numeric',
                    })}
                  </span>
                </div>
                <div className="cert-verify-field">
                  <span className="cert-verify-label">{t.certVerify?.code || 'Verification Code'}</span>
                  <span className="cert-verify-value mono">{data.verify_code}</span>
                </div>
              </div>

              <div className="cert-verify-status">
                <span className="cert-verify-status-dot" />
                <span>{t.certVerify?.authentic || 'Authentic'}</span>
              </div>
            </>
          ) : (
            <>
              <div className="cert-verify-icon invalid-icon">
                <X size={48} />
              </div>
              <h1 className="cert-verify-title">
                {t.certVerify?.invalidTitle || 'Invalid Certificate'}
              </h1>
              <p className="cert-verify-subtitle">
                {error || (t.certVerify?.invalidSub || 'This verification code is not recognized.')}
              </p>
            </>
          )}
        </div>
      </main>
    </div>
  );
};
