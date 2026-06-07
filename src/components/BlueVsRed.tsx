import React, { useState, useEffect } from 'react';
import {
  Lock,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import { LanguageSwitcher } from './LanguageSwitcher';
import './blue-vs-red.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8090/api';

interface DBChallenge {
  id: string;
  title: string;
  module: string;
  category: string;
  path: string;
  difficulty: string;
  xpReward: number;
}

interface BlueVsRedProps {
  onSelectChallenge: (categoryId: string, pathId: string, moduleId: string, moduleTitle: string, teamRole: 'red' | 'blue', challengeId?: string) => void;
  onBack: () => void;
}

const RedHackerSVG: React.FC = () => (
  <svg viewBox="0 0 400 400" className="bvr-character-svg red-hacker-svg" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="redGlow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#ff003c" stopOpacity="0.55" />
        <stop offset="100%" stopColor="#ff003c" stopOpacity="0" />
      </radialGradient>
      <linearGradient id="cyberRed" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#ff003c" />
        <stop offset="100%" stopColor="#80001e" />
      </linearGradient>
      <linearGradient id="screenGlowRed" x1="0%" y1="100%" x2="0%" y2="0%">
        <stop offset="0%" stopColor="#ff003c" stopOpacity="0.9" />
        <stop offset="100%" stopColor="#ff003c" stopOpacity="0" />
      </linearGradient>
    </defs>
    
    {/* Glow background */}
    <circle cx="200" cy="200" r="180" fill="url(#redGlow)" />
    
    {/* Grid/Matrix lines */}
    <g stroke="rgba(255, 0, 60, 0.25)" strokeWidth="1">
      <line x1="50" y1="200" x2="350" y2="200" />
      <line x1="200" y1="50" x2="200" y2="350" />
      <circle cx="200" cy="200" r="120" fill="none" strokeDasharray="5 5" />
      <circle cx="200" cy="200" r="80" fill="none" />
    </g>

    {/* Floating binary code bits */}
    <text x="70" y="120" fill="rgba(255, 0, 60, 0.45)" fontSize="13" fontFamily="monospace" fontWeight="bold">01</text>
    <text x="310" y="140" fill="rgba(255, 0, 60, 0.45)" fontSize="13" fontFamily="monospace" fontWeight="bold">10</text>
    <text x="80" y="280" fill="rgba(255, 0, 60, 0.45)" fontSize="13" fontFamily="monospace" fontWeight="bold">EXE</text>
    <text x="290" y="290" fill="rgba(255, 0, 60, 0.45)" fontSize="13" fontFamily="monospace" fontWeight="bold">0xCC</text>
    
    {/* Hacker silhouette */}
    {/* Hoodie outline */}
    <path d="M110 330 C110 260, 140 220, 140 160 C140 100, 260 100, 260 160 C260 220, 290 260, 290 330 Z" fill="#140205" stroke="url(#cyberRed)" strokeWidth="3.5" />
    
    {/* Inner shadow / Face area */}
    <path d="M150 170 C150 120, 250 120, 250 170 C250 200, 230 230, 200 230 C170 230, 150 200, 150 170 Z" fill="#050001" />
    
    {/* Glowing Mask/Visor */}
    <path d="M165 170 Q200 160 235 170 Q240 190 200 195 Q160 190 165 170 Z" fill="rgba(255, 0, 60, 0.15)" stroke="#ff003c" strokeWidth="2.5" />
    <line x1="175" y1="180" x2="225" y2="180" stroke="#ff3366" strokeWidth="4.5" strokeLinecap="round" className="bvr-neon-pulse" />
    
    {/* Glitch/Cyber details on hoodie */}
    <path d="M115 310 L140 270 L170 280" fill="none" stroke="rgba(255, 0, 60, 0.65)" strokeWidth="2.5" />
    <path d="M285 310 L260 270 L230 280" fill="none" stroke="rgba(255, 0, 60, 0.65)" strokeWidth="2.5" />
    
    {/* Cybernetic details (Lines & circles) */}
    <circle cx="200" cy="90" r="4.5" fill="#ff003c" />
    <path d="M200 50 L200 85" fill="none" stroke="#ff003c" strokeWidth="2" />
    
    {/* Laptop screen glowing from below */}
    <polygon points="130,350 270,350 290,380 110,380" fill="#0a0103" stroke="url(#cyberRed)" strokeWidth="2.5" />
    <polygon points="140,355 260,355 275,375 125,375" fill="rgba(255, 0, 60, 0.25)" />
    
    {/* Screen light glow */}
    <path d="M140 355 L160 300 L240 300 L260 355 Z" fill="url(#screenGlowRed)" opacity="0.45" style={{ mixBlendMode: 'screen' }} />
  </svg>
);

const BlueDefenderSVG: React.FC = () => (
  <svg viewBox="0 0 400 400" className="bvr-character-svg blue-defender-svg" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="blueGlow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#0052ff" stopOpacity="0.55" />
        <stop offset="100%" stopColor="#0052ff" stopOpacity="0" />
      </radialGradient>
      <linearGradient id="cyberBlue" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#0052ff" />
        <stop offset="100%" stopColor="#001a66" />
      </linearGradient>
      <linearGradient id="neonBlueLine" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#00f0ff" />
        <stop offset="50%" stopColor="#0052ff" />
        <stop offset="100%" stopColor="#001a66" />
      </linearGradient>
    </defs>
    
    {/* Glow background */}
    <circle cx="200" cy="200" r="180" fill="url(#blueGlow)" />
    
    {/* Radar/Defense scanning rings */}
    <g stroke="rgba(0, 240, 255, 0.25)" strokeWidth="1">
      <line x1="50" y1="200" x2="350" y2="200" />
      <line x1="200" y1="50" x2="200" y2="350" />
      <circle cx="200" cy="200" r="130" fill="none" strokeDasharray="10 5" />
      <path d="M 110 110 A 127 127 0 0 1 290 110" fill="none" stroke="rgba(0, 240, 255, 0.4)" strokeWidth="2" strokeDasharray="30 15" />
      <circle cx="200" cy="200" r="75" fill="none" />
    </g>

    {/* Floating hex / security code bits */}
    <text x="65" y="130" fill="rgba(0, 240, 255, 0.45)" fontSize="12" fontFamily="monospace" fontWeight="bold">SEC</text>
    <text x="310" y="130" fill="rgba(0, 240, 255, 0.45)" fontSize="12" fontFamily="monospace" fontWeight="bold">OK</text>
    <text x="60" y="270" fill="rgba(0, 240, 255, 0.45)" fontSize="12" fontFamily="monospace" fontWeight="bold">AES</text>
    <text x="300" y="270" fill="rgba(0, 240, 255, 0.45)" fontSize="12" fontFamily="monospace" fontWeight="bold">0x7F</text>

    {/* Guardian silhouette */}
    {/* Shoulders and chest */}
    <path d="M120 330 C120 270, 150 230, 150 170 C150 110, 250 110, 250 170 C250 230, 280 270, 280 330 Z" fill="#010614" stroke="url(#cyberBlue)" strokeWidth="3.5" />
    
    {/* Helmet/Facial shield shadow */}
    <path d="M155 170 C155 125, 245 125, 245 170 C245 205, 230 225, 200 225 C170 225, 155 205, 155 170 Z" fill="#000208" />
    
    {/* Glowing Visor (horizontal T-shape or tech visor) */}
    <path d="M170 165 L230 165 L225 185 L208 185 L208 205 L192 205 L192 185 L175 185 Z" fill="rgba(0, 82, 255, 0.2)" stroke="#0052ff" strokeWidth="2.5" />
    <line x1="178" y1="175" x2="222" y2="175" stroke="#00f0ff" strokeWidth="4.5" strokeLinecap="round" className="bvr-neon-pulse" />
    <circle cx="200" cy="195" r="2.5" fill="#00f0ff" />

    {/* Cyber Shield in front */}
    <path d="M160 270 L240 270 L240 310 C240 340, 200 365, 200 365 C200 365, 160 340, 160 310 Z" fill="#02091c" stroke="url(#neonBlueLine)" strokeWidth="3" />
    
    {/* Shield details - lock or tick */}
    <path d="M190 300 C190 290, 210 290, 210 300 L210 310 L190 310 Z" fill="none" stroke="#0052ff" strokeWidth="2" />
    <rect x="185" y="310" width="30" height="20" rx="3" fill="#0052ff" />
    <circle cx="200" cy="320" r="2.5" fill="#010614" />
  </svg>
);

const BlueDefenseDecorations: React.FC = () => (
  <>
    <svg className="bvr-bg-shape bvr-shape-1" viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="0.5" xmlns="http://www.w3.org/2000/svg">
      <circle cx="50" cy="50" r="45" strokeDasharray="3 3" />
      <circle cx="50" cy="50" r="30" />
      <circle cx="50" cy="50" r="15" strokeDasharray="5 5" />
      <path d="M50 5 L50 95 M5 50 L95 50" />
      <path d="M20 20 L80 80 M20 80 L80 20" strokeDasharray="2 2" />
    </svg>
    <svg className="bvr-bg-shape bvr-shape-2" viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="0.5" xmlns="http://www.w3.org/2000/svg">
      <path d="M50 10 L80 25 L80 55 C80 75 50 90 50 90 C50 90 20 75 20 55 L20 25 Z" />
      <path d="M35 45 L45 55 L65 35" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="50" cy="20" r="1.5" fill="currentColor" />
      <circle cx="80" cy="40" r="1.5" fill="currentColor" />
      <circle cx="20" cy="40" r="1.5" fill="currentColor" />
    </svg>
  </>
);

const RedOffenseDecorations: React.FC = () => (
  <>
    <svg className="bvr-bg-shape bvr-shape-1" viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="0.5" xmlns="http://www.w3.org/2000/svg">
      <circle cx="50" cy="50" r="40" />
      <circle cx="50" cy="50" r="25" />
      <circle cx="50" cy="50" r="8" fill="currentColor" />
      <path d="M50 2 L50 20 M50 80 L50 98 M2 50 L20 50 M80 50 L98 50" strokeWidth="1" />
      <path d="M15 15 L25 25 M75 75 L85 85" />
    </svg>
    <svg className="bvr-bg-shape bvr-shape-2" viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="0.5" xmlns="http://www.w3.org/2000/svg">
      <rect x="10" y="10" width="30" height="20" rx="2" />
      <rect x="50" y="20" width="40" height="30" rx="3" strokeDasharray="2 2" />
      <line x1="15" y1="18" x2="25" y2="18" strokeWidth="1" />
      <line x1="15" y1="24" x2="35" y2="24" strokeWidth="1" />
      <path d="M 60 35 L 80 35 L 70 45 Z" fill="currentColor" />
      <circle cx="20" cy="75" r="5" />
      <circle cx="80" cy="75" r="5" />
      <line x1="25" y1="75" x2="75" y2="75" />
    </svg>
  </>
);

export const BlueVsRed: React.FC<BlueVsRedProps> = ({ onSelectChallenge, onBack }) => {
  const { t, lang } = useI18n();
  const redQuote = lang === 'ar'
    ? "« أفضل طريقة للدفاع هي الهجوم المستمر. اخترق لتكشف مواطن الضعف. »"
    : "“The best defense is a constant offense. Penetrate to reveal vulnerabilities.”";

  const blueQuote = lang === 'ar'
    ? "« حماية الأنظمة لا تبدأ بعد الاختراق، بل ببناء قلاع برمجية حصينة لا تُهزم. »"
    : "“System security doesn't start after breach, but by building impregnable fortresses.”";

  const [blueChallenges, setBlueChallenges] = useState<DBChallenge[]>([]);
  const [redChallenges, setRedChallenges] = useState<DBChallenge[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');
  
  // State for locking in a specific team (split container goes full screen for that team)
  const [lockedTeam, setLockedTeam] = useState<'red' | 'blue' | null>(null);
  const [activeSection, setActiveSection] = useState<{ teamId: string; category: string; challenges: DBChallenge[] } | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setFetchError('');
      try {
        const [blueRes, redRes] = await Promise.all([
          fetch(`${API_URL}/training/list?team_role=blue&limit=1000`),
          fetch(`${API_URL}/training/list?team_role=red&limit=1000`)
        ]);

        if (!blueRes.ok || !redRes.ok) {
          throw new Error(`Backend unavailable (${blueRes.status}/${redRes.status}). ${t.dashboard.fetchError}`);
        }

        const blueData = await blueRes.json();
        const redData = await redRes.json();
        setBlueChallenges(blueData.items || []);
        setRedChallenges(redData.items || []);
      } catch (err) {
        console.error('Error fetching dashboard data', err);
        setFetchError(err instanceof Error ? err.message : t.dashboard.fetchError);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [t.dashboard.fetchError]);

  const groupByCategory = (challenges: DBChallenge[]) => {
    const groups: { [cat: string]: DBChallenge[] } = {};
    challenges.forEach(c => {
      const cat = c.category || (lang === 'ar' ? 'تحديات عامة' : 'General challenges');
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(c);
    });
    return groups;
  };

  const blueGroups = groupByCategory(blueChallenges);
  const redGroups = groupByCategory(redChallenges);

  const teamsData = [
    { id: 'blue', title: t.dashboard.blueTitle, subtitle: t.dashboard.blueSubtitle, desc: t.dashboard.blueDesc, groups: blueGroups },
    { id: 'red', title: t.dashboard.redTitle, subtitle: t.dashboard.redSubtitle, desc: t.dashboard.redDesc, groups: redGroups }
  ];

  return (
    <div className="bvr-page" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      {/* Restored the exact original header classes and structure */}
      <header className="dash-header">
        <div className="dash-header-inner">
          <a href="/" className="dash-logo">CyberArena</a>
          <div className="dash-header-right">
            <LanguageSwitcher />
            <button onClick={onBack} className="dash-back-to-dash">
              {lang === 'ar' ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
              <span>{t.dashboard.backToDashboard || 'العودة للوحة التحكم'}</span>
            </button>
          </div>
        </div>
      </header>

      {fetchError && (
        <div className="bvr-error-alert">
          {fetchError}
        </div>
      )}

      {loading ? (
        <div className="bvr-loading-container">
          <div className="bvr-spinner" />
          <span>{t.dashboard.loading}</span>
        </div>
      ) : (
        <main className={`bvr-split-container ${activeSection ? 'bvr-has-active' : ''} ${lockedTeam ? `bvr-locked bvr-locked-${lockedTeam}` : ''}`}>
          {teamsData.map((team) => {
            const isRed = team.id === 'red';
            const isSelected = lockedTeam === team.id;
            const isActive = activeSection?.teamId === team.id;
            
            return (
              <section 
                key={team.id}
                className={`bvr-half bvr-${team.id}-half ${isActive ? 'bvr-half-active' : ''} ${lockedTeam && lockedTeam !== team.id ? 'bvr-half-inactive' : ''}`}
              >
                <div className="bvr-tech-grid" />
                
                {/* Custom defensive/offensive decorative background shapes */}
                {isRed ? <RedOffenseDecorations /> : <BlueDefenseDecorations />}
                
                {/* View 1: When no team is locked/selected */}
                {lockedTeam === null && (
                  <div className="bvr-half-content">
                    {isRed ? <RedHackerSVG /> : <BlueDefenderSVG />}
                    <span className="bvr-subtitle">{team.subtitle}</span>
                    <h2 className="bvr-title">{team.title}</h2>
                    <p className="bvr-desc">{team.desc}</p>
                    <p className="bvr-quote">
                      {isRed ? redQuote : blueQuote}
                    </p>
                    <button
                      className="bvr-lock-btn"
                      onClick={() => setLockedTeam(team.id as 'red' | 'blue')}
                    >
                      {isRed 
                        ? (lang === 'ar' ? 'انضم كـ مهاجم (RED TEAM)' : 'BE A RED TEAM (ATTACKER)') 
                        : (lang === 'ar' ? 'انضم كـ مدافع (BLUE TEAM)' : 'BE A BLUE TEAM (DEFENDER)')}
                    </button>
                  </div>
                )}
                
                {/* View 2: When this specific team is locked/selected */}
                {isSelected && (
                  <div className="bvr-locked-body">
                    {/* Visual Panel: Large Character on Left/Start */}
                    <div className="bvr-locked-visual">
                      {isRed ? <RedHackerSVG /> : <BlueDefenderSVG />}
                      <span className="bvr-subtitle">{team.subtitle}</span>
                      <h2 className="bvr-title">{team.title}</h2>
                      <p className="bvr-desc">{team.desc}</p>
                      <p className="bvr-locked-quote">
                        {isRed ? redQuote : blueQuote}
                      </p>
                    </div>

                    {/* Interactive Panel: Categories & Challenges on Right/End */}
                    <div className="bvr-locked-interactive">
                      {/* Back to split screen button */}
                      <button 
                        onClick={() => { setLockedTeam(null); setActiveSection(null); }} 
                        className="bvr-change-team-btn"
                      >
                        <ArrowLeft size={14} style={{ transform: lang === 'ar' ? 'rotate(180deg)' : 'none' }} />
                        <span>{lang === 'ar' ? 'العودة لاختيار الفرق' : 'Back to Teams'}</span>
                      </button>

                      {/* Challenges list inside categories */}
                      {isActive ? (
                        <div className="bvr-active-content">
                          <button onClick={() => setActiveSection(null)} className="bvr-section-back-btn">
                            <ArrowLeft size={14} style={{ transform: lang === 'ar' ? 'rotate(180deg)' : 'none' }} />
                            <span>{t.dashboard.backToCategories || 'العودة للتصنيفات'}</span>
                          </button>
                          <h3 className="bvr-section-title">{activeSection.category}</h3>
                          
                          <div className="bvr-challenges-list">
                            {activeSection.challenges.map((challenge) => (
                              <button
                                key={challenge.id}
                                className="bvr-challenge-item"
                                onClick={() => onSelectChallenge(
                                  challenge.category, challenge.path, challenge.module,
                                  challenge.title, team.id as 'red' | 'blue', challenge.id
                                )}
                              >
                                <div className="bvr-challenge-info">
                                  <span className="bvr-challenge-name">{challenge.title}</span>
                                  <span className="bvr-challenge-meta">
                                    {challenge.module} • <strong>{challenge.difficulty}</strong>
                                  </span>
                                </div>
                                <div className="bvr-challenge-reward">
                                  <span className="bvr-challenge-xp">+{challenge.xpReward} XP</span>
                                  {lang === 'ar' ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
                                </div>
                              </button>
                            ))}
                            {activeSection.challenges.length === 0 && (
                              <div className="bvr-empty-state">{t.dashboard.noChallenges || 'لا توجد تحديات متاحة'}</div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="bvr-categories">
                          {Object.keys(team.groups).map(category => {
                            const challenges = team.groups[category];
                            return (
                              <button
                                key={category}
                                className="bvr-category-btn"
                                onClick={() => setActiveSection({ teamId: team.id, category, challenges })}
                              >
                                <div className="bvr-category-info">
                                  <Lock size={16} className="bvr-category-icon" />
                                  <span>{category}</span>
                                </div>
                                <span className="bvr-category-count">{challenges.length}</span>
                              </button>
                            );
                          })}
                          {Object.keys(team.groups).length === 0 && (
                            <div className="bvr-empty-state">{t.dashboard.noChallenges || 'لا توجد تحديات متاحة'}</div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </section>
            );
          })}
        </main>
      )}
    </div>
  );
};
