// ============================================================
// components/Layout/Sidebar.jsx
// Persistent sidebar navigation — shared across all pages.
// Highlights the active route and conditionally renders
// menu items based on the logged-in user's role.
// ============================================================

import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import './Sidebar.css';

/* ── SVG icon components (inline to avoid extra deps) ── */
const icons = {
  dashboard: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="4" rx="1"/>
      <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="11" width="7" height="10" rx="1"/>
    </svg>
  ),
  invoices: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
      <line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/>
    </svg>
  ),
  upload: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
    </svg>
  ),
  admin: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>
    </svg>
  ),
  config: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
    </svg>
  ),
  audit: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
  ),
  logout: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
    </svg>
  ),
  collapse: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6"/>
    </svg>
  ),
};

/* ── Navigation structure per role ── */
const NAV_SECTIONS = [
  {
    title: 'Overview',
    items: [
      { key: 'dashboard', label: 'Dashboard', icon: 'dashboard', path: '/dashboard', roles: ['Admin', 'Accountant', 'Viewer'] },
    ],
  },
  {
    title: 'Invoices',
    items: [
      { key: 'invoices',  label: 'Invoice List',    icon: 'invoices', path: '/invoices',       roles: ['Admin', 'Accountant', 'Viewer'] },
      { key: 'upload',    label: 'Upload Invoice',  icon: 'upload',   path: '/upload-invoice', roles: ['Accountant'] },
    ],
  },
  {
    title: 'Management',
    items: [
      { key: 'admin',  label: 'Administration', icon: 'admin',  path: '/admin',  roles: ['Admin'] },
      { key: 'config', label: 'Configuration',  icon: 'config', path: '/config', roles: ['Admin'] },
    ],
  },
  {
    title: 'Logs',
    items: [
      { key: 'audit', label: 'Audit Trail', icon: 'audit', path: '/audit', roles: ['Admin', 'Viewer'] },
    ],
  },
];

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  // Read user info from localStorage (set during login)
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const userRole = user.role_name || 'Viewer';
  const userName = user.full_name || 'User';
  const initials = userName.split(' ').map(n => n[0]).join('').toUpperCase();
  console.log('SIDEBAR USER:', user);
  console.log('ROLE:', userRole);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/');
  };

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      {/* Collapse toggle */}
      <button className="collapse-btn" onClick={() => setCollapsed(!collapsed)}>
        {icons.collapse}
      </button>

      <div className="sidebar-inner">
        {/* Brand */}
        <div className="brand">
          <div className="brand-mark">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-45%)' }}>
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
          <div className="brand-wordmark">Invoice<span>Shield</span></div>
        </div>

        {/* Navigation */}
        <nav className="nav">
          {NAV_SECTIONS.map(section => {
            const visibleItems = section.items.filter(item => item.roles.includes(userRole));
            if (visibleItems.length === 0) return null;
            return (
              <React.Fragment key={section.title}>
                <div className="menu-title">{section.title}</div>
                {visibleItems.map(item => (
                  <button
                    key={item.key}
                    className={`nav-btn ${location.pathname.startsWith(item.path) ? 'active' : ''}`}
                    onClick={() => navigate(item.path)}
                  >
                    {icons[item.icon]}
                    <span className="nav-label">{item.label}</span>
                  </button>
                ))}
              </React.Fragment>
            );
          })}
        </nav>

        {/* User section */}
        <div className="user-section">
          <div className="user-avatar">{initials}</div>
          <div className="user-info">
            <div className="user-name">{userName}</div>
            <div className="user-role">{userRole}</div>
          </div>
          <button className="logout-btn" title="Log out" onClick={handleLogout}>
            {icons.logout}
          </button>
        </div>
      </div>
    </aside>
  );
}
