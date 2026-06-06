import React from 'react';
import { useI18n } from '../i18n/I18nContext';

export const LanguageSwitcher: React.FC<{ className?: string }> = ({ className }) => {
  const { lang, setLang, t } = useI18n();
  return (
    <button
      type="button"
      className={`lang-switcher ${className || ''}`}
      onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
      aria-label="Switch language"
      title={lang === 'ar' ? 'English' : 'العربية'}
    >
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="2" y1="12" x2="22" y2="12" />
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      </svg>
      <span>{t.common.langSwitch}</span>
    </button>
  );
};
