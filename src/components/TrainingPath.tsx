import React, { useState, useEffect } from 'react';
import { Lock, ChevronLeft, Loader2, ArrowRight } from 'lucide-react';
import { PathIcon } from './TeamIcons';
import { useI18n } from '../i18n/I18nContext';
import { LanguageSwitcher } from './LanguageSwitcher';
import { Sidebar } from './Sidebar';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8090/api';

interface Module {
  id: string;
  title: string;
  desc: string;
}

interface DBChallenge {
  id: string;
  title: string;
  module: string;
  category: string;
  path: string;
  difficulty: string;
  xpReward: number;
}

interface PathData {
  id: string;
  title: string;
  desc: string;
  modules: Module[];
}

interface TrainingPathProps {
  categoryId: string;
  pathId: string;
  teamRole?: 'red' | 'blue';
  onSelectModule: (moduleId: string, moduleTitle: string, challengeId?: string) => void;
  onBack: () => void;
}

export const TrainingPath: React.FC<TrainingPathProps> = ({ categoryId, pathId, teamRole = 'blue', onSelectModule, onBack }) => {
  const { t } = useI18n();
  const pathInfo = t.paths[pathId as keyof typeof t.paths] as { title: string; desc: string; modules?: Record<string, { title: string; desc: string }> } | undefined;
  const moduleInfo = pathInfo && 'modules' in pathInfo ? pathInfo.modules : undefined;
  const path: PathData | null = pathInfo ? {
    id: pathId,
    title: pathInfo.title,
    desc: pathInfo.desc,
    modules: moduleInfo
      ? Object.entries(moduleInfo).map(([id, m]) => ({ id, title: m.title, desc: m.desc }))
      : [],
  } : null;

  const [dbChallenges, setDbChallenges] = useState<DBChallenge[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchChallenges = async () => {
      try {
        const res = await fetch(`${API_URL}/training/list?team_role=${teamRole}&limit=2000`);
        const data = await res.json();
        const list = Array.isArray(data.items) ? data.items : [];
        const filtered = list.filter((c: DBChallenge) => c.path === pathId);
        setDbChallenges(filtered);
      } catch (err) {
        console.error('Failed to fetch challenges:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchChallenges();
  }, [teamRole, pathId]);

  if (!path) return null;

  const itemsToRender = dbChallenges.length > 0
    ? dbChallenges.map(c => ({
        id: c.id,
        moduleId: c.module,
        title: c.title,
        desc: t.trainingPath.challengeDesc(c.module, c.difficulty, c.xpReward),
        difficulty: c.difficulty,
        xp: c.xpReward,
      }))
    : path.modules.map(m => ({
        id: m.id,
        moduleId: m.id,
        title: m.title,
        desc: m.desc,
        difficulty: t.trainingPath.midDifficulty,
        xp: 100,
      }));

  const totalXp = itemsToRender.reduce((sum, it) => sum + (it.xp || 0), 0);
  const accent = teamRole === 'blue' ? '#3b82f6' : '#ef4444';
  const accentSoft = teamRole === 'blue' ? 'rgba(59, 130, 246, 0.08)' : 'rgba(239, 68, 68, 0.08)';
  const teamLabel = teamRole === 'blue' ? t.trainingPath.teamLabels.blue : t.trainingPath.teamLabels.red;
  const teamSubtitle = teamRole === 'blue' ? t.trainingPath.teamSubs.blue : t.trainingPath.teamSubs.red;

  return (
    <div className="dash-page" style={{ '--accent': accent, '--accent-soft': accentSoft } as React.CSSProperties}>
      <Sidebar
        bottom={
          <>
            <LanguageSwitcher />
            <button onClick={onBack} className="path-back-link">
              <ArrowRight size={18} />
            </button>
          </>
        }
      />

      <main className="dash-main">
        <div className="dash-container">
          <section className="path-hero">
            <div className="path-hero-icon">
              <PathIcon size={64} />
            </div>
            <div className="path-hero-content">
              <span className="path-hero-team-badge" style={{ color: accent, background: accentSoft, borderColor: accentSoft }}>
                {teamLabel} • {teamSubtitle}
              </span>
              <h1>{path.title}</h1>
              <p>{path.desc}</p>
              <div className="path-hero-stats">
                <div className="path-hero-stat">
                  <span className="path-hero-stat-value">{itemsToRender.length}</span>
                  <span className="path-hero-stat-label">{t.trainingPath.available}</span>
                </div>
                <div className="path-hero-stat">
                  <span className="path-hero-stat-value">{totalXp.toLocaleString()}</span>
                  <span className="path-hero-stat-label">{t.trainingPath.totalXp}</span>
                </div>
              </div>
            </div>
          </section>

          <section className="path-timeline">
            {loading ? (
              <div className="path-loading">
                <Loader2 size={20} className="animate-spin" />
                <span>{t.trainingPath.loading}</span>
              </div>
            ) : (
              itemsToRender.map((item, index) => (
                <div
                  key={item.id}
                  className="path-step"
                  style={{ '--accent': accent, '--accent-soft': accentSoft } as React.CSSProperties}
                >
                  <div className="path-step-line">
                    <div className="path-step-dot">{index + 1}</div>
                    {index < itemsToRender.length - 1 && <div className="path-step-connector" />}
                  </div>
                  <button
                    className="path-step-card"
                    onClick={() => onSelectModule(item.moduleId, item.title, item.id)}
                  >
                    <div className="path-step-icon">
                      <Lock size={18} />
                    </div>
                    <div className="path-step-body">
                      <h3>{item.title}</h3>
                      <p>{item.desc}</p>
                    </div>
                    <div className="path-step-action">
                      <span className="path-step-cta">{t.trainingPath.start}</span>
                      <ChevronLeft size={16} />
                    </div>
                  </button>
                </div>
              ))
            )}
          </section>
        </div>
      </main>
    </div>
  );
};
