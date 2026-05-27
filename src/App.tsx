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
import { TrainingPath } from './components/TrainingPath';
import { TrainingSession } from './components/TrainingSession';

type Page = 'home' | 'auth' | 'dashboard' | 'training-path' | 'training-session';

function App() {
  const getStoredUser = () => {
    try {
      const raw = localStorage.getItem('apex_session');
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
  const [nav, setNav] = useState<{ categoryId: string; pathId: string; moduleId: string; moduleTitle: string }>({
    categoryId: '',
    pathId: '',
    moduleId: '',
    moduleTitle: '',
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
    localStorage.removeItem('apex_session');
    setUser(null);
    setPage('home');
  };

  const handleSelectPath = (categoryId: string, pathId: string) => {
    setNav({ ...nav, categoryId, pathId });
    setPage('training-path');
  };

  const handleSelectModule = (moduleId: string, moduleTitle: string) => {
    setNav({ ...nav, moduleId, moduleTitle });
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
        <Dashboard user={user} onSelectPath={handleSelectPath} onLogout={handleLogout} />
      )}

      {page === 'training-path' && (
        <TrainingPath
          categoryId={nav.categoryId}
          pathId={nav.pathId}
          onSelectModule={handleSelectModule}
          onBack={() => setPage('dashboard')}
        />
      )}

      {page === 'training-session' && (
        <TrainingSession
          moduleTitle={nav.moduleTitle}
          categoryId={nav.categoryId}
          pathId={nav.pathId}
          moduleId={nav.moduleId}
          onBack={() => setPage('training-path')}
        />
      )}
    </>
  );
}

export default App;
