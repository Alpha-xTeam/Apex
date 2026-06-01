import { useState } from 'react';
import { Navbar } from './components/Navbar';
import { Hero } from './components/Hero';
import { Concept } from './components/Concept';
import { Features } from './components/Features';
import { Goal } from './components/Goal';
import { ScrollStory } from './components/ScrollStory';
import { Footer } from './components/Footer';
import { AuthPage } from './components/AuthPage';
import { Dashboard } from './components/Dashboard';
import { Profile } from './components/Profile';
import { TrainingPath } from './components/TrainingPath';
import { TrainingSession } from './components/TrainingSession';

type Page = 'home' | 'auth' | 'dashboard' | 'profile' | 'training-path' | 'training-session';

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
  const [page, setPage] = useState<Page>(storedUser ? 'dashboard' : 'home');
  const [user, setUser] = useState<{ id: string; name: string; email: string } | null>(storedUser);
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

  const handleAuth = () => {
    const raw = localStorage.getItem('apex_session');
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

  // Challenge grid card → Training Session
  const handleSelectChallenge = (categoryId: string, pathId: string, moduleId: string, moduleTitle: string, teamRole: 'red' | 'blue', challengeId?: string) => {
    setNav({ categoryId, pathId, moduleId, moduleTitle, teamRole, challengeId });
    setPage('training-session');
  };

  const handleSelectChallengeFromPath = (moduleId: string, moduleTitle: string, challengeId?: string) => {
    setNav(prev => ({ ...prev, moduleId, moduleTitle, challengeId }));
    setPage('training-session');
  };

  return (
    <>
      {page === 'home' && <Navbar user={user} onLogin={() => setPage('auth')} onLogout={handleLogout} />}
      {page === 'home' ? (
        <div className="app-container">
          <main className="content-wrapper">
            <Hero />
            <Concept />
            <Features />
            <ScrollStory />
            <Goal />
          </main>
        </div>
      ) : null}
      {page === 'home' && <Footer />}

      {page === 'auth' && (
        <AuthPage onBack={() => setPage('home')} onAuth={handleAuth} />
      )}

      {page === 'dashboard' && user && (
        <Dashboard 
          user={user} 
          onSelectChallenge={handleSelectChallenge} 
          onViewProfile={() => setPage('profile')}
          onLogout={handleLogout} 
        />
      )}

      {page === 'profile' && user && (
        <Profile user={user} onBack={() => setPage('dashboard')} />
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
    </>
  );
}

export default App;
