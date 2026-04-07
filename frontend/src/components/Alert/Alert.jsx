import React from 'react';

// ============================================================
// Alert — matches original HTML .alert structure
// Styles come from LoginForm.css (.alert, .alert-error, .alert-success)
// ============================================================

export default function Alert({ type, message, onClose }) {
  if (!type || !message) return null;

  return (
    <div className={`alert alert-${type}`}>
      {type === 'error'
        ? <WarnIcon />
        : <CheckIcon />
      }
      <span>{message}</span>
    </div>
  );
}

function WarnIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5"
      strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}
