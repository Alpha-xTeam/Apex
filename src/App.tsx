import { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { Hero } from './components/Hero';
import { About } from './components/About';
import { Concept } from './components/Concept';
import { Features } from './components/Features';
import { Pills } from './components/Pills';
import { ScrollStory } from './components/ScrollStory';
import { Goal } from './components/Goal';
import { Footer } from './components/Footer';
import { AuthPage } from './components/AuthPage';
import { Dashboard } from './components/Dashboard';
import { Profile } from './components/Profile';
import { TrainingPath } from './components/TrainingPath';
import { TrainingSession } from './components/TrainingSession';
import { Leaderboard } from './components/Leaderboard';
import { LegalPage } from './components/LegalPage';
import { Intro, hasSeenIntro } from './components/Intro';
import { OneVOneLobby } from './components/OneVOneLobby';
import { OneVOneArena } from './components/OneVOneArena';
import { BlueVsRed } from './components/BlueVsRed';
import { CertificateVerify } from './components/CertificateVerify';
import { useScrollReveal } from './hooks/useScrollReveal';

type Page = 'home' | 'auth' | 'dashboard' | 'profile' | 'training-path' | 'training-session' | 'leaderboard' | 'legal' | 'onevone-lobby' | 'onevone-arena' | 'verify' | 'bluevsred';

export function navigateTo(page: Page) {
  window.dispatchEvent(new CustomEvent('apex:navigate', { detail: page }));
}

function Home() {
  useScrollReveal();
  return (
    <div className="z-home">
      <Hero />
      <About />
      <Concept />
      <Pills />
      <Features />
      <ScrollStory />
      <Goal />
    </div>
  );
}

function App() {
  const getStoredUser = () => {
    try {
      const raw = localStorage.getItem('cyberarena_session');
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const userData = parsed.user || parsed;
      return {
        id: userData.id || '',
        email: userData.email || '',
        name: userData.user_metadata?.name || userData.name || '',
      };
    } catch { return null; }
  };

  const storedUser = getStoredUser();
  const [page, setPage] = useState<Page>(() => {
    // Detect deep-link to /verify?code=... (so the QR code on a printed PDF works)
    if (typeof window !== 'undefined' && window.location.pathname.startsWith('/verify')) {
      return 'verify';
    }
    return storedUser ? 'dashboard' : 'home';
  });
  const [user, setUser] = useState<{ id: string; name: string; email: string } | null>(storedUser);
  const [showIntro, setShowIntro] = useState<boolean>(() => !storedUser && !hasSeenIntro());
  const [authChecked, setAuthChecked] = useState<boolean>(false);

  const [nav, setNav] = useState<{
    categoryId: string;
    pathId: string;
    moduleId: string;
    moduleTitle: string;
    teamRole: 'red' | 'blue';
    challengeId?: string;
  }>({
    categoryId: '',
    pathId: '',
    moduleId: '',
    moduleTitle: '',
    teamRole: 'blue',
  });

  // 1v1 navigation state (separate to keep the existing `nav` shape intact)
  const [onevone, setOnevone] = useState<{ code: string; room: any } | null>(null);

  const handleAuth = () => {
    const raw = localStorage.getItem('cyberarena_session');
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        const userData = parsed.user || parsed;
        setUser({
          id: userData.id || '',
          email: userData.email || '',
          name: userData.user_metadata?.name || userData.name || '',
        });
        setPage('dashboard');
        return;
      } catch {}
    }
    setPage('home');
  };

  const handleLogout = () => {
    localStorage.removeItem('cyberarena_session');
    setUser(null);
    setPage('home');
  };

  // Listen for Supabase OAuth session changes
  useEffect(() => {
    import('./lib/supabase').then(({ supabase }) => {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session?.user) {
          const u = session.user;
          const name = u.user_metadata?.full_name || u.user_metadata?.name || u.email || '';
          const token = session.access_token;
          const userData = { id: u.id, email: u.email || '', name };
          setUser(userData);
          localStorage.setItem('cyberarena_session', JSON.stringify({
            user: { id: u.id, email: u.email, user_metadata: u.user_metadata },
            access_token: token,
            provider: 'supabase',
          }));
          setPage('dashboard');
        } else {
          // Only clear if the session in localStorage is a Supabase session
          const raw = localStorage.getItem('cyberarena_session');
          if (raw) {
            try {
              const parsed = JSON.parse(raw);
              if (parsed.provider === 'supabase') {
                localStorage.removeItem('cyberarena_session');
                setUser(null);
                setPage('home');
              }
            } catch {
              localStorage.removeItem('cyberarena_session');
              setUser(null);
              setPage('home');
            }
          }
        }
        setAuthChecked(true);
      }).catch(() => {
        // Network error or Supabase unreachable — keep stored session if any
        setAuthChecked(true);
      });

      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        if (session?.user) {
          const u = session.user;
          const token = session.access_token;
          const userData = { id: u.id, email: u.email || '', name: u.user_metadata?.full_name || u.user_metadata?.name || '' };
          setUser(userData);
          localStorage.setItem('cyberarena_session', JSON.stringify({
            user: { id: u.id, email: u.email, user_metadata: u.user_metadata },
            access_token: token,
            provider: 'supabase',
          }));
          setPage('dashboard');
        } else {
          const raw = localStorage.getItem('cyberarena_session');
          if (raw) {
            try {
              const parsed = JSON.parse(raw);
              if (parsed.provider === 'supabase') {
                localStorage.removeItem('cyberarena_session');
                setUser(null);
                setPage('home');
              }
            } catch {
              localStorage.removeItem('cyberarena_session');
              setUser(null);
              setPage('home');
            }
          }
        }
      });

      return () => subscription.unsubscribe();
    });
  }, []);

  // Listen for global navigation events from anywhere in the app
  useEffect(() => {
    const handler = (e: Event) => {
      const page = (e as CustomEvent<Page>).detail;
      setPage(page);
    };
    window.addEventListener('apex:navigate', handler);
    return () => window.removeEventListener('apex:navigate', handler);
  }, []);

  // Challenge grid card → Training Session
  const handleSelectChallenge = (categoryId: string, pathId: string, moduleId: string, moduleTitle: string, teamRole: 'red' | 'blue', challengeId?: string) => {
    setNav({ categoryId, pathId, moduleId, moduleTitle, teamRole, challengeId });
    setPage('training-session');
  };

  const handleSelectChallengeFromPath = (moduleId: string, moduleTitle: string, challengeId?: string) => {
    setNav(prev => ({ ...prev, moduleId, moduleTitle, challengeId }));
    setPage('training-session');
  };

  if (!authChecked) {
    return (
      <div style={{
        minHeight: '100vh',
        background: '#0a0a0a',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'rgba(243,241,236,0.4)',
        fontSize: '14px',
        fontFamily: 'var(--font-arabic)',
      }}>
        جاري التحميل...
      </div>
    );
  }

  return (
    <>
      {showIntro && <Intro onComplete={() => setShowIntro(false)} />}
      {page === 'home' && <Navbar user={user} onLogin={() => setPage('auth')} onLogout={handleLogout} />}
      {page === 'home' ? (
        <Home />
      ) : null}
      {page === 'home' && <Footer />}

      {page === 'auth' && (
        <AuthPage onBack={() => setPage('home')} onAuth={handleAuth} />
      )}

      {page === 'legal' && <LegalPage />}

      {page === 'dashboard' && user && (
        <Dashboard
          user={user}
          onSelectChallenge={handleSelectChallenge}
          onViewProfile={() => setPage('profile')}
          onViewLeaderboard={() => setPage('leaderboard')}
          onLogout={handleLogout}
          onOpenOneVOne={() => setPage('onevone-lobby')}
          onOpenBlueVsRed={() => setPage('bluevsred')}
        />
      )}

      {page === 'leaderboard' && (
        <Leaderboard
          currentUser={user}
          onBack={() => setPage('dashboard')}
        />
      )}

      {page === 'profile' && user && (
        <Profile user={user} onBack={() => setPage('dashboard')} onLogout={handleLogout} />
      )}

      {page === 'training-path' && (
        <TrainingPath
          categoryId={nav.categoryId}
          pathId={nav.pathId}
          teamRole={nav.teamRole}
          onSelectModule={handleSelectChallengeFromPath}
          onBack={() => setPage('dashboard')}
        />
      )}

      {page === 'training-session' && (
        <TrainingSession
          moduleTitle={nav.moduleTitle}
          categoryId={nav.categoryId}
          pathId={nav.pathId}
          moduleId={nav.moduleId}
          teamRole={nav.teamRole}
          challengeId={nav.challengeId}
          onBack={() => setPage('dashboard')}
        />
      )}

      {page === 'onevone-lobby' && user && (
        <OneVOneLobby
          user={user}
          onEnterArena={(code, room) => {
            setOnevone({ code, room });
            setPage('onevone-arena');
          }}
          onBack={() => setPage('dashboard')}
        />
      )}

      {page === 'onevone-arena' && user && onevone && (
        <OneVOneArena
          user={user}
          code={onevone.code}
          room={onevone.room}
          onBack={() => {
            setOnevone(null);
            setPage('onevone-lobby');
          }}
        />
      )}

      {page === 'bluevsred' && user && (
        <BlueVsRed
          onSelectChallenge={handleSelectChallenge}
          onBack={() => setPage('dashboard')}
        />
      )}

      {page === 'verify' && (
        <CertificateVerify
          verifyCode={new URLSearchParams(window.location.search).get('code') || undefined}
          onBack={() => setPage(user ? 'dashboard' : 'home')}
        />
      )}
    </>
  );
}

export default App;
