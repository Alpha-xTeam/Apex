import React, { useState } from 'react';
import { navigateTo } from '../App';
import { useI18n } from '../i18n/I18nContext';
import { LanguageSwitcher } from './LanguageSwitcher';

type AuthMode = 'login' | 'signup';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8090/api';

export const AuthPage: React.FC<{ onBack: () => void; onAuth: () => void }> = ({ onBack, onAuth }) => {
  const { t, lang } = useI18n();
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: mode, email, password, name }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.detail || 'حدث خطأ');
        return;
      }

      localStorage.setItem('cyberarena_session', JSON.stringify(data));
      onAuth();
    } catch {
      setError(t.auth.networkError);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-bg-grid" aria-hidden="true" />

      <nav className="auth-nav">
        <a
          href="/"
          onClick={(e) => { e.preventDefault(); navigateTo('home'); onBack(); }}
          className="auth-back"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"></line>
            <polyline points="12 19 5 12 12 5"></polyline>
          </svg>
          <span>{t.auth.back}</span>
        </a>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <LanguageSwitcher />
          <a href="/" className="auth-logo" onClick={(e) => { e.preventDefault(); navigateTo('home'); onBack(); }}>
            CyberArena<sup>®</sup>
          </a>
        </div>
      </nav>

      <div className="auth-shell">
        <div className="auth-visual" aria-hidden="true">
          <div className="auth-visual-shield">
            <svg viewBox="0 0 200 240" fill="none">
              <defs>
                <linearGradient id="authShieldFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#1a1a1a" />
                  <stop offset="100%" stopColor="#0a0a0a" />
                </linearGradient>
              </defs>
              <path
                d="M100 8 L182 48 L182 128 Q182 198 100 232 Q18 198 18 128 L18 48 Z"
                fill="url(#authShieldFill)"
                stroke="#10b981"
                strokeWidth="3"
              />
              <path
                d="M100 22 L168 56 L168 128 Q168 188 100 216 Q32 188 32 128 L32 56 Z"
                stroke="rgba(16,185,129,0.25)"
                strokeWidth="1"
                strokeDasharray="3 4"
                fill="none"
              />
              <rect x="72" y="118" width="56" height="48" rx="6" fill="#10b981" />
              <path d="M82 118 V102 a18 18 0 0 1 36 0 V118" stroke="#10b981" strokeWidth="6" fill="none" strokeLinecap="round" />
              <circle cx="100" cy="138" r="5" fill="#0a0a0a" />
              <rect x="97.5" y="138" width="5" height="14" rx="1" fill="#0a0a0a" />
            </svg>
            <div className="auth-shield-glow" />
          </div>
          <div className="auth-orbit-ring" />
          <div className="auth-orbit-ring auth-orbit-ring-2" />
          <div className="auth-orbit-node auth-orbit-node-1" />
          <div className="auth-orbit-node auth-orbit-node-2" />
          <div className="auth-orbit-node auth-orbit-node-3" />
          <div className="auth-orbit-node auth-orbit-node-4" />
            <h2 className="auth-visual-title">{t.auth.taglineTitle}</h2>
            <p className="auth-visual-desc">{t.auth.taglineDesc}</p>
          </div>

          <div className="auth-card">
            <div className="auth-header">
              <h1 className="auth-title">{mode === 'login' ? t.auth.loginTitle : t.auth.signupTitle}</h1>
              <p className="auth-subtitle">
                {mode === 'login' ? t.auth.welcomeBack : t.auth.signupDesc}
              </p>
            </div>

            <form className="auth-form" onSubmit={handleSubmit}>
              {mode === 'signup' && (
                <div className="auth-field">
                  <label htmlFor="name">{t.auth.fullName}</label>
                  <input
                    id="name"
                    type="text"
                    placeholder={t.auth.fullNamePh}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
              )}

              <div className="auth-field">
                <label htmlFor="email">{t.auth.email}</label>
                <input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  dir={lang === 'ar' ? 'rtl' : 'ltr'}
                />
              </div>

              <div className="auth-field">
                <label htmlFor="password">{t.auth.password}</label>
                <input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  dir="ltr"
                />
              </div>

              {mode === 'login' && (
                <a href="#" className="auth-forgot" onClick={(e) => e.preventDefault()}>
                  {t.auth.forgot}
                </a>
              )}

              {error && <p className="auth-error">{error}</p>}

              <button type="submit" className="auth-submit" disabled={loading}>
                <span>{loading ? t.auth.loading : mode === 'login' ? t.auth.submitLogin : t.auth.submitSignup}</span>
                <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="7" y1="17" x2="17" y2="7"></line>
                  <polyline points="7 7 17 7 17 17"></polyline>
                </svg>
              </button>
            </form>

            <div className="auth-divider">
              <span>{t.auth.or}</span>
            </div>

          <div className="auth-social">
            <button className="auth-social-btn" type="button">
              <svg viewBox="0 0 24 24" width="16" height="16">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              <span>Google</span>
            </button>
            <button className="auth-social-btn" type="button">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
              </svg>
              <span>GitHub</span>
            </button>
          </div>

          <p className="auth-switch">
            {mode === 'login' ? (
              <>{t.auth.switchToSignup.split('?')[0]}? <button type="button" onClick={() => setMode('signup')}>{t.auth.switchToSignup.split('?')[1]?.trim()}</button></>
            ) : (
              <>{t.auth.switchToLogin.split('?')[0]}? <button type="button" onClick={() => setMode('login')}>{t.auth.switchToLogin.split('?')[1]?.trim()}</button></>
            )}
          </p>
        </div>
      </div>
    </div>
  );
};
