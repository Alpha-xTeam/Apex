import React, { useEffect, useState } from 'react';

interface IntroProps {
  onComplete: () => void;
}

const STORAGE_KEY = 'cyberarena_intro_seen';

export const Intro: React.FC<IntroProps> = ({ onComplete }) => {
  const [phase, setPhase] = useState<'enter' | 'hold' | 'exit' | 'done'>('enter');

  useEffect(() => {
    // Mark intro as seen immediately so refresh during animation doesn't replay
    try { localStorage.setItem(STORAGE_KEY, '1'); } catch {}

    const t1 = setTimeout(() => setPhase('hold'), 1200);
    const t2 = setTimeout(() => setPhase('exit'), 2600);
    const t3 = setTimeout(() => {
      setPhase('done');
      onComplete();
    }, 3700);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [onComplete]);

  if (phase === 'done') return null;

  return (
    <div className={`intro intro-${phase}`} aria-hidden="true">
      <div className="intro-bg-grid" />

      <div className="intro-center">
        <div className="intro-logo">
          <div className="intro-logo-mark">
            <svg viewBox="0 0 200 240" fill="none">
              <defs>
                <linearGradient id="introShieldFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#1a1a1a" />
                  <stop offset="100%" stopColor="#0a0a0a" />
                </linearGradient>
              </defs>
              <path
                d="M100 8 L182 48 L182 128 Q182 198 100 232 Q18 198 18 128 L18 48 Z"
                fill="url(#introShieldFill)"
                stroke="#10b981"
                strokeWidth="3"
              />
              <rect x="72" y="118" width="56" height="48" rx="6" fill="#10b981" />
              <path d="M82 118 V102 a18 18 0 0 1 36 0 V118" stroke="#10b981" strokeWidth="6" fill="none" strokeLinecap="round" />
              <circle cx="100" cy="138" r="5" fill="#0a0a0a" />
              <rect x="97.5" y="138" width="5" height="14" rx="1" fill="#0a0a0a" />
            </svg>
            <div className="intro-logo-glow" />
          </div>
          <div className="intro-logo-text">
            <span className="intro-logo-name">CyberArena</span>
            <span className="intro-logo-reg">®</span>
          </div>
        </div>
        <p className="intro-tagline">أهلاً بك في عالم الأمن</p>
        <div className="intro-loader">
          <span /><span /><span />
        </div>
      </div>
    </div>
  );
};

export function hasSeenIntro(): boolean {
  try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch { return false; }
}
