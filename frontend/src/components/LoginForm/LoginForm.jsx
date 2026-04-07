import React, { useState } from 'react';
import FormInput from '../FormInput/FormInput';
import Alert from '../Alert/Alert';
import './LoginForm.css';

// ============================================================
// LoginForm — right panel matching original HTML exactly
//
// Title:    "Sign in to your account"
// No subtitle paragraph (matches screenshot)
// Fields:   Email, Password (with eye toggle)
// Options:  Remember me + Forgot password?
// Button:   "Sign in" (full width, green)
// Footer:   "Secured with encryption"
// ============================================================

const API_URL = 'http://localhost:5000/api';

export default function LoginForm() {
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [showPw,   setShowPw]   = useState(false);

  const [emailError, setEmailError] = useState('');
  const [pwError,    setPwError]    = useState('');

  const [alert,   setAlert]   = useState({ type: null, message: '' });
  const [loading, setLoading] = useState(false);

  function validate() {
    let ok = true;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailError('Please enter a valid email address');
      ok = false;
    } else {
      setEmailError('');
    }
    if (!password) {
      setPwError('Password is required');
      ok = false;
    } else {
      setPwError('');
    }
    return ok;
  }

  async function handleSubmit() {
    setAlert({ type: null, message: '' });
    if (!validate()) return;

    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email, password }),
      });
      const data = await response.json();

      if (!response.ok) {
        setAlert({ type: 'error', message: data.message || 'Login failed.' });
        setLoading(false);
        return;
      }

      localStorage.setItem('token', data.token);
      localStorage.setItem('user',  JSON.stringify(data.user));
      setAlert({ type: 'success', message: 'Authenticating... Redirecting to your dashboard.' });

      setTimeout(() => {
        window.location.href = '/dashboard';
      }, 1200);

    } catch {
      setAlert({ type: 'error', message: 'Cannot reach the server. Please try again.' });
      setLoading(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') handleSubmit();
  }

  return (
    <div className="panel-right" onKeyDown={handleKeyDown}>
      <div className="login-container">

        {/* Header — matches screenshot exactly */}
        <div className="login-header">
          <h2>Sign in to your account</h2>
        </div>

        {/* Alert banner */}
        <Alert
          type={alert.type}
          message={alert.message}
          onClose={() => setAlert({ type: null, message: '' })}
        />

        {/* Email field */}
        <FormInput
          id="email"
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Enter your email"
          error={emailError}
          autoComplete="email"
          icon={<EmailIcon />}
        />

        {/* Password field */}
        <FormInput
          id="password"
          label="Password"
          type={showPw ? 'text' : 'password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Enter your password"
          error={pwError}
          autoComplete="current-password"
          icon={<LockIcon />}
          rightSlot={
            <button
              className="eye-toggle"
              type="button"
              onClick={() => setShowPw((v) => !v)}
              aria-label={showPw ? 'Hide password' : 'Show password'}
            >
              {showPw ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          }
        />

        {/* Remember me + Forgot password */}
        <div className="form-options">
          <label className="checkbox-wrap">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            <span>Remember me</span>
          </label>
          <a href="#" className="forgot-link">Forgot password?</a>
        </div>

        {/* Sign in button */}
        <button
          className={`btn-submit ${loading ? 'loading' : ''}`}
          onClick={handleSubmit}
          disabled={loading}
        >
          <span className="btn-label">Sign in</span>
          <div className="spinner" />
        </button>

        {/* Footer */}
        <div className="login-footer">
          <div className="encrypted-badge">
            <LockSmallIcon />
            Secured with encryption
          </div>
        </div>
      </div>

      <div className="version-tag">InvoiceShield v1.0</div>
    </div>
  );
}

/* ---- SVG Icons ---- */
function EmailIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 01-2.06 0L2 7" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0110 0v4" />
    </svg>
  );
}

function LockSmallIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0110 0v4" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}
