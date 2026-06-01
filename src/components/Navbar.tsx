import React from 'react';

interface NavbarProps {
  user: { id: string; name: string; email: string } | null;
  onLogin: () => void;
  onLogout: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ user, onLogin, onLogout }) => {
  const initial = user?.name?.charAt(0) || user?.email?.charAt(0) || '?';

  return (
    <nav className="navbar">
      <div className="nav-left">
        <a href="/" className="logo">
          CyberArena
        </a>
        <div className="nav-links">
          <a href="#concept">الفكرة</a>
          <a href="#features">المميزات</a>
          <a href="#goal">الهدف</a>
        </div>
      </div>
      <div className="nav-right">
        {user ? (
          <div className="nav-user-menu">
            <div className="nav-avatar">{initial}</div>
            <span className="nav-name">{user.name || user.email}</span>
            <button onClick={onLogout} className="nav-logout">تسجيل خروج</button>
          </div>
        ) : (
          <>
            <button onClick={onLogin} className="nav-login">تسجيل الدخول</button>
            <button onClick={onLogin} className="btn btn-primary btn-try">جرب الآن</button>
          </>
        )}
      </div>
    </nav>
  );
};
