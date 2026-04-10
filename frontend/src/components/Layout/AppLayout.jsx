// ============================================================
// components/Layout/AppLayout.jsx
// Wraps every authenticated page with the sidebar + main area.
// ============================================================

import React from 'react';
import Sidebar from './Sidebar';
import './AppLayout.css';

export default function AppLayout({ children }) {
  return (
    <div className="shell">
      <Sidebar />
      <main className="main">
        <div className="main-glow" />
        {children}
      </main>
    </div>
  );
}