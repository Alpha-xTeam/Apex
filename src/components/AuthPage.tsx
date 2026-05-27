import React, { useState } from 'react';

type AuthMode = 'login' | 'signup';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080/api';

export const AuthPage: React.FC<{ onBack: () => void; onAuth: () => void }> = ({ onBack, onAuth }) => {
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

      localStorage.setItem('apex_session', JSON.stringify(data));
      onAuth();
    } catch {
      setError('تعذر الاتصال بالخادم');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <button className="auth-back" onClick={onBack}>← الرجوع للرئيسية</button>

      <div className="auth-card">
        <div className="auth-header">
          <h2 className="auth-title">{mode === 'login' ? 'تسجيل الدخول' : 'إنشاء حساب'}</h2>
          <p className="auth-subtitle">
            {mode === 'login'
              ? 'مرحباً بعودتك! سجل دخولك لمواصلة التدريب.'
              : 'ابدأ رحلتك التدريبية مع Apex.'}
          </p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          {mode === 'signup' && (
            <div className="auth-field">
              <label htmlFor="name">الاسم الكامل</label>
              <input
                id="name"
                type="text"
                placeholder="محمد أحمد"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
          )}

          <div className="auth-field">
            <label htmlFor="email">البريد الإلكتروني</label>
            <input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="auth-field">
            <label htmlFor="password">كلمة المرور</label>
            <input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </div>

          {mode === 'login' && (
            <a href="#" className="auth-forgot">نسيت كلمة المرور؟</a>
          )}

          {error && <p className="auth-error">{error}</p>}

          <button type="submit" className="auth-submit" disabled={loading}>
            {loading ? 'جاري التحميل...' : mode === 'login' ? 'تسجيل الدخول' : 'إنشاء حساب'}
          </button>
        </form>

        <div className="auth-divider">
          <span>أو</span>
        </div>

        <div className="auth-social">
          <button className="auth-social-btn" type="button">Google</button>
          <button className="auth-social-btn" type="button">GitHub</button>
        </div>

        <p className="auth-switch">
          {mode === 'login' ? (
            <>ليس لديك حساب؟ <button type="button" onClick={() => setMode('signup')}>إنشاء حساب</button></>
          ) : (
            <>لديك حساب بالفعل؟ <button type="button" onClick={() => setMode('login')}>تسجيل الدخول</button></>
          )}
        </p>
      </div>
    </div>
  );
};
