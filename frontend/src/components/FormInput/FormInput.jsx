import React from 'react';

// ============================================================
// FormInput — matches original HTML structure exactly
// Icon is positioned absolute (left: 13px) inside .input-wrap
// The .field, .field-label, .input-wrap, .form-input,
// .eye-toggle, .field-error classes all come from LoginForm.css
// ============================================================

export default function FormInput({
  id,
  label,
  type = 'text',
  value,
  onChange,
  placeholder,
  error,
  icon,
  rightSlot,
  autoComplete,
}) {
  return (
    <div className="field">

      <div className="field-label">
        <label htmlFor={id}>{label}</label>
      </div>

      <div className="input-wrap">
        {icon && (
          <span className="ico">{icon}</span>
        )}

        <input
          id={id}
          type={type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          autoComplete={autoComplete}
          spellCheck={false}
          className={`form-input ${error ? 'has-error' : ''}`}
        />

        {rightSlot}
      </div>

      <div className={`field-error ${error ? 'show' : ''}`}>
        <ErrorIcon />
        {error}
      </div>
    </div>
  );
}

function ErrorIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}
