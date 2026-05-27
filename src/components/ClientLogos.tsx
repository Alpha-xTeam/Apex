import React from 'react';

export const ClientLogos: React.FC = () => {
  return (
    <div className="client-logos-container">
      <p className="client-logos-title">Trusted by teams of every scale</p>
      <div className="logo-grid">
        <div className="logo-item">
          {/* Mercury Logo */}
          <svg viewBox="0 0 120 28" className="logo-svg">
            <text x="0" y="20" className="logo-text font-heavy">MERCURY</text>
          </svg>
        </div>
        <div className="logo-item">
          {/* Ramp Logo */}
          <svg viewBox="0 0 100 28" className="logo-svg">
            <path d="M5 22h40v-4H17.8L45 5.5V5H5v4h27.2L5 21.5V22z" fill="currentColor" />
            <text x="50" y="20" className="logo-text font-bold">ramp</text>
          </svg>
        </div>
        <div className="logo-item">
          {/* Hex Logo */}
          <svg viewBox="0 0 80 28" className="logo-svg">
            <polygon points="12,4 24,10 24,22 12,28 0,22 0,10" fill="currentColor" />
            <text x="32" y="21" className="logo-text font-heavy">HEX</text>
          </svg>
        </div>
        <div className="logo-item">
          {/* Vercel Logo */}
          <svg viewBox="0 0 90 28" className="logo-svg">
            <polygon points="12,3 24,24 0,24" fill="currentColor" />
            <text x="32" y="21" className="logo-text font-bold">Vercel</text>
          </svg>
        </div>
        <div className="logo-item">
          {/* Descript Logo */}
          <svg viewBox="0 0 110 28" className="logo-svg">
            <circle cx="10" cy="14" r="8" fill="none" stroke="currentColor" strokeWidth="4" />
            <text x="26" y="21" className="logo-text font-bold">descript</text>
          </svg>
        </div>
        <div className="logo-item">
          {/* Cash App */}
          <svg viewBox="0 0 110 28" className="logo-svg">
            <path d="M12 4v20M8 8h6a3 3 0 0 1 0 6H8a3 3 0 0 0 0 6h8" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            <text x="28" y="21" className="logo-text font-bold">Cash App</text>
          </svg>
        </div>
        <div className="logo-item">
          {/* Supercell */}
          <svg viewBox="0 0 50 28" className="logo-svg">
            <rect x="0" y="4" width="6" height="6" fill="currentColor" />
            <rect x="8" y="4" width="6" height="6" fill="currentColor" />
            <rect x="16" y="4" width="6" height="6" fill="currentColor" />
            <rect x="0" y="12" width="6" height="6" fill="currentColor" />
            <rect x="8" y="12" width="6" height="6" fill="currentColor" />
            <rect x="16" y="12" width="6" height="6" fill="currentColor" />
            <rect x="0" y="20" width="6" height="6" fill="currentColor" />
            <rect x="8" y="20" width="6" height="6" fill="currentColor" />
            <rect x="16" y="20" width="6" height="6" fill="currentColor" />
            <text x="26" y="20" className="logo-text font-supercell">SUP<br/>ELL</text>
          </svg>
        </div>
        <div className="logo-item">
          {/* Runway */}
          <svg viewBox="0 0 100 28" className="logo-svg">
            <path d="M5 22V6h6a4 4 0 0 1 4 4v2a4 4 0 0 1-4 4H5m10 6l-6-6" fill="none" stroke="currentColor" strokeWidth="3" />
            <text x="24" y="21" className="logo-text font-bold">runway</text>
          </svg>
        </div>
      </div>
    </div>
  );
};
