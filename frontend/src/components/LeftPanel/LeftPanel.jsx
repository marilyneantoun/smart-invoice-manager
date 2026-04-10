import React from 'react';
import './LeftPanel.css';
import logimg from '../../assets/loginImg.jpg';

// ============================================================
// LeftPanel — matches the preview v6 design exactly
// Left panel: neon background image, brand, headline, stats row
// Brand mark 34px, wordmark 17px (same as dashboard sidebar)
// ============================================================

const STATS = [
  { value: '25+',  label: 'Invoices Processed' },
  { value: '12',   label: 'Detection Rules' },
  { value: '100%', label: 'Human Reviewed' },
];

export default function LeftPanel() {
  return (
    <div className="panel-left">

      {/* Background photo (neon2.jpg) */}
      <div
        className="bg-photo"
        style={{ backgroundImage: `url(${logimg})` }}
      />

      {/* Dark gradient overlay */}
      <div className="bg-overlay" />

      {/* Subtle green glow */}
      <div className="bg-glow" />

      {/* ---- Top: Brand — same 34px mark + 17px wordmark as dashboard sidebar ---- */}
      <div className="brand">
        <div className="brand-mark">
          <svg
            className="shield-icon"
            viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round"
          >
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          <svg
            className="check-icon"
            viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="3.5"
            strokeLinecap="round" strokeLinejoin="round"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <div className="brand-wordmark">
          Invoice<span>Shield</span>
        </div>
      </div>

      {/* ---- Middle: Headline ---- */}
      <div className="hero">
        <h1>
          Smart invoice review,<br />
          <em>zero blind spots</em>
        </h1>
      </div>

      {/* ---- Bottom: Stats row ---- */}
      <div className="stats-row">
        {STATS.map((s) => (
          <div className="stat-item" key={s.label}>
            <div className="stat-value">{s.value}</div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
