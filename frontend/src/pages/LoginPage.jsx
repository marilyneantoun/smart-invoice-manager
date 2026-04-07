import React from 'react';
import LeftPanel  from '../components/LeftPanel/LeftPanel';
import LoginForm  from '../components/LoginForm/LoginForm';
import './LoginPage.css';

/* ============================================================
   LoginPage
   Top-level page that lays out the two-panel login layout:
     Left  → decorative brand panel (hidden on mobile)
     Right → the login form
   ============================================================ */

export default function LoginPage() {
  return (
    <div className="login-page">
      <LeftPanel />
      <LoginForm />
    </div>
  );
}
