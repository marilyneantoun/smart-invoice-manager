// ============================================================
// pages/Administration/AdministrationPage.jsx
// Administration — Vendor Management + User Management tabs.
// Full CRUD with modals: Add, Edit, Deactivate/Reactivate,
// Approve toggle (vendors), Reset password (users).
//
// Vendor request flow additions:
//   - Pending-approval counter chip at the top of Vendor Management
//   - Yellow row highlight on unapproved vendors
//   - "Requested" tag on vendors whose vendor_code starts with REQ-
//     (these were submitted via the accountant request flow)
//   - Clicking the "Pending Review" badge on a placeholder vendor
//     opens the Edit modal (to force the admin to replace the
//     placeholder vendor_code/email) instead of the approve confirm
//   - Banner inside the Edit modal warning when placeholders are
//     still present
// ============================================================

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import AppLayout from '../../components/Layout/AppLayout';
import './AdministrationPage.css';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

/* ------------------------------------------------------------
   Fetch helper — attaches JWT and parses JSON safely.
   ------------------------------------------------------------ */
async function apiFetch(path, options = {}) {
  const token = localStorage.getItem('token');
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: token ? `Bearer ${token}` : '',
      ...(options.headers || {}),
    },
  });
  let body = null;
  try { body = await res.json(); } catch { /* may be empty */ }
  if (!res.ok) {
    const msg = (body && body.message) || `Request failed (${res.status})`;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return body;
}

/* ------------------------------------------------------------
   Utilities
   ------------------------------------------------------------ */
function formatDate(isoString) {
  if (!isoString) return '—';
  const d = new Date(isoString);
  if (isNaN(d)) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
}

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function avatarVariant(key) {
  if (!key) return '';
  const variants = ['alt-1', 'alt-2', 'alt-3', 'alt-4', ''];
  let hash = 0;
  const s = String(key);
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  return variants[hash % variants.length];
}

function roleBadgeClass(role) {
  if (!role) return 'badge-neutral';
  const r = role.toLowerCase();
  if (r === 'admin') return 'badge-blue';
  if (r === 'accountant') return 'badge-yellow';
  return 'badge-neutral';
}

/* Detect vendors that were submitted via the accountant request flow.
   The /vendors/request endpoint generates placeholder values with these
   exact prefixes, so this check uniquely identifies a "requested" vendor. */
function isRequestedVendor(v) {
  if (!v) return false;
  const code = String(v.vendor_code || '');
  const email = String(v.email || '');
  return code.startsWith('REQ-') || email.startsWith('pending+');
}

/* ------------------------------------------------------------
   Icons
   ------------------------------------------------------------ */
const Icon = {
  Search: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  ),
  Vendors: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  ),
  Users: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 00-3-3.87" />
      <path d="M16 3.13a4 4 0 010 7.75" />
    </svg>
  ),
  X: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  Plus: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  ),
  Edit: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  ),
  Trash: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
    </svg>
  ),
  Lock: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0110 0v4" />
    </svg>
  ),
  Refresh: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" />
      <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" />
    </svg>
  ),
  Check: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  ChevronLeft: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  ),
  ChevronRight: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  ),
  Close: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  Shield: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  ),
  Currency: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
    </svg>
  ),
  UserRole: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 4-7 8-7s8 3 8 7" />
    </svg>
  ),
  Power: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18.36 6.64a9 9 0 11-12.73 0" />
      <line x1="12" y1="2" x2="12" y2="12" />
    </svg>
  ),
  Bell: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  ),
  Warning: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
};

/* ============================================================
   Modal shell
   ============================================================ */
function Modal({ open, onClose, title, subtitle, children, footer, size }) {
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handler);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="admin-modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`admin-modal ${size === 'sm' ? 'sm' : ''}`}>
        <div className="admin-modal-header">
          <div>
            <h3 className="admin-modal-title">{title}</h3>
            {subtitle && <p className="admin-modal-subtitle">{subtitle}</p>}
          </div>
          <button className="admin-modal-close" onClick={onClose} aria-label="Close">
            <Icon.Close />
          </button>
        </div>
        <div className="admin-modal-body">{children}</div>
        <div className="admin-modal-footer">{footer}</div>
      </div>
    </div>
  );
}

/* ============================================================
   Vendor form modal — used for both Add and Edit
   ============================================================ */
function VendorModal({ open, onClose, vendor, onSaved }) {
  const isEdit = !!vendor;

  const [form, setForm] = useState({
    vendor_name: '',
    vendor_code: '',
    email: '',
    phone_number: '',
    address: '',
    country: '',
    default_currency: 'USD',
    is_approved: false,
  });

  const [phoneCountryCode, setPhoneCountryCode] = useState('+961');
  const [phoneDigits, setPhoneDigits] = useState('');
  const [phoneError, setPhoneError] = useState('');

  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const hasPlaceholderCode  = form.vendor_code.startsWith('REQ-');
  const hasPlaceholderEmail = form.email.startsWith('pending+');
  const hasPlaceholders     = hasPlaceholderCode || hasPlaceholderEmail;

  const splitPhoneNumber = (value) => {
    const clean = String(value || '').trim();

    if (!clean) {
      return { code: '+961', digits: '' };
    }

    const normalized = clean.replace(/\s+/g, '');
    const knownCodes = ['+961', '+971', '+44', '+1'];
    const matchedCode = knownCodes.find(code => normalized.startsWith(code));

    if (matchedCode) {
      return {
        code: matchedCode,
        digits: normalized.slice(matchedCode.length).replace(/\D/g, ''),
      };
    }

    return {
      code: '+961',
      digits: normalized.replace(/\D/g, ''),
    };
  };

  useEffect(() => {
    if (!open) return;

    if (vendor) {
      const parsedPhone = splitPhoneNumber(vendor.phone_number);

      setForm({
        vendor_name: vendor.vendor_name || '',
        vendor_code: vendor.vendor_code || '',
        email: vendor.email || '',
        phone_number: vendor.phone_number || '',
        address: vendor.address || '',
        country: vendor.country || '',
        default_currency: vendor.default_currency || vendor.currency || 'USD',
        is_approved: !!vendor.is_approved,
      });

      setPhoneCountryCode(parsedPhone.code);
      setPhoneDigits(parsedPhone.digits);
    } else {
      setForm({
        vendor_name: '',
        vendor_code: '',
        email: '',
        phone_number: '',
        address: '',
        country: '',
        default_currency: 'USD',
        is_approved: false,
      });

      setPhoneCountryCode('+961');
      setPhoneDigits('');
    }

    setPhoneError('');
    setError('');
  }, [open, vendor]);

  const update = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handlePhoneCountryCodeChange = (e) => {
    const rawValue = e.target.value;
    const digitsOnly = rawValue.replace(/\D/g, '');
    setPhoneCountryCode(digitsOnly ? `+${digitsOnly}` : '+');
  };

  const handlePhoneCountryCodeKeyDown = (e) => {
    const allowedKeys = [
      'Backspace',
      'Delete',
      'Tab',
      'ArrowLeft',
      'ArrowRight',
      'Home',
      'End',
    ];

    if (allowedKeys.includes(e.key)) return;
    if (e.ctrlKey || e.metaKey) return;

    if (!/^\d$/.test(e.key)) {
      e.preventDefault();
    }
  };

  const handlePhoneDigitsChange = (e) => {
    const rawValue = e.target.value;
    const digitsOnly = rawValue.replace(/\D/g, '');

    setPhoneDigits(digitsOnly);

    if (rawValue !== digitsOnly) {
      setPhoneError('Phone number can contain digits only.');
    } else {
      setPhoneError('');
    }
  };

  const handlePhoneKeyDown = (e) => {
    const allowedKeys = [
      'Backspace',
      'Delete',
      'Tab',
      'ArrowLeft',
      'ArrowRight',
      'Home',
      'End',
    ];

    if (allowedKeys.includes(e.key)) return;
    if (e.ctrlKey || e.metaKey) return;

    if (!/^\d$/.test(e.key)) {
      e.preventDefault();
      setPhoneError('Phone number can contain digits only.');
    }
  };

  const handleSubmit = async () => {
    setError('');

    if (!form.vendor_name.trim() || !form.vendor_code.trim() || !form.email.trim()) {
      setError('Vendor name, code, and email are required.');
      return;
    }

    if (phoneError) {
      setError('Please enter a valid phone number using digits only.');
      return;
    }

    if (phoneDigits && !/^\+\d+$/.test(phoneCountryCode)) {
      setError('Please enter a valid country code, for example +961.');
      return;
    }

    if (phoneDigits && !/^\d+$/.test(phoneDigits)) {
      setError('Phone number must contain digits only.');
      return;
    }

    if (form.is_approved && (form.vendor_code.startsWith('REQ-') || form.email.startsWith('pending+'))) {
      setError('Please replace with real vendor code and email before approving.');
      return;
    }

    const cleanPhoneNumber = phoneDigits
      ? `${phoneCountryCode}${phoneDigits}`
      : '';

    setSubmitting(true);

    try {
      if (isEdit) {
        await apiFetch(`/vendors/${vendor.vendor_id}`, {
          method: 'PUT',
          body: JSON.stringify({
            ...form,
            phone_number: cleanPhoneNumber,
          }),
        });
      } else {
        await apiFetch(`/vendors`, {
          method: 'POST',
          body: JSON.stringify({
            ...form,
            phone_number: cleanPhoneNumber,
          }),
        });
      }

      onSaved();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit Vendor' : 'Add Vendor'}
      subtitle={isEdit ? 'Update vendor details.' : 'Enter vendor details. Code and email must be unique.'}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={submitting}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={submitting}>
            {!submitting && <Icon.Check />}
            {submitting ? 'Saving…' : (isEdit ? 'Save Changes' : 'Add Vendor')}
          </button>
        </>
      }
    >
      <div className="admin-form-grid">
        {isEdit && hasPlaceholders && (
          <div className="admin-form-warning">
            <Icon.Warning />
            <div>
              <strong>This vendor was submitted by an accountant for approval.</strong>
              <div>
                Please replace the temporary vendor code and email
                {hasPlaceholderCode && hasPlaceholderEmail ? ' vendor code and email' :
                 hasPlaceholderCode ? ' vendor code' : ' email'}
                {' '}with real values before approving.
              </div>
            </div>
          </div>
        )}

        {error && <div className="admin-form-error">{error}</div>}

        <div className="admin-form-field">
          <label>Vendor Name<span className="req"> *</span></label>
          <input
            type="text"
            value={form.vendor_name}
            onChange={e => update('vendor_name', e.target.value)}
            autoFocus
          />
        </div>

        <div className="admin-form-field">
          <label>Vendor Code<span className="req"> *</span></label>
          <input
            className={`mono ${hasPlaceholderCode ? 'placeholder-value' : ''}`}
            type="text"
            value={form.vendor_code}
            onChange={e => update('vendor_code', e.target.value)}
            placeholder="VND-011"
          />
          {hasPlaceholderCode && (
            <span className="admin-form-hint">Enter the official vendor code.</span>
          )}
        </div>

        <div className="admin-form-field full">
          <label>Email<span className="req"> *</span></label>
          <input
            className={hasPlaceholderEmail ? 'placeholder-value' : ''}
            type="email"
            value={form.email}
            onChange={e => update('email', e.target.value)}
            placeholder="contact@vendor.com"
          />
          {hasPlaceholderEmail && (
            <span className="admin-form-hint">Enter the official vendor email.</span>
          )}
        </div>

        <div className="admin-form-field">
          <label>Phone</label>

          <div className="phone-input-group">
            <input
              className="phone-country-code-input"
              type="text"
              inputMode="numeric"
              value={phoneCountryCode}
              onChange={handlePhoneCountryCodeChange}
              onKeyDown={handlePhoneCountryCodeKeyDown}
              placeholder="+961"
              aria-label="Country code"
              autoComplete="tel-country-code"
            />

            <input
              className={`phone-number-input ${phoneError ? 'input-error' : ''}`}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={phoneDigits}
              onChange={handlePhoneDigitsChange}
              onKeyDown={handlePhoneKeyDown}
              placeholder="70123456"
              autoComplete="tel-national"
            />
          </div>

          {phoneError && (
            <span className="admin-form-hint error">{phoneError}</span>
          )}
        </div>

        <div className="admin-form-field">
          <label>Country</label>
          <input
            type="text"
            value={form.country}
            onChange={e => update('country', e.target.value)}
            placeholder="Lebanon"
          />
        </div>

        <div className="admin-form-field full">
          <label>Address</label>
          <input
            type="text"
            value={form.address}
            onChange={e => update('address', e.target.value)}
          />
        </div>

        <div className="admin-form-field">
          <label>Currency</label>
          <select
            value={form.default_currency}
            onChange={e => update('default_currency', e.target.value)}
          >
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
          </select>
        </div>

        <div className="admin-form-field"></div>

        <label className="admin-form-checkbox">
          <input
            type="checkbox"
            checked={form.is_approved}
            onChange={e => update('is_approved', e.target.checked)}
          />
          Mark as approved vendor
        </label>
      </div>
    </Modal>
  );
}

/* ============================================================
   User form modal — used for both Add and Edit
   ============================================================ */
function UserModal({ open, onClose, user, onSaved }) {
  const isEdit = !!user;
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    password: '',
    role_name: 'Auditor',
    is_active: true,
  });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (user) {
      setForm({
        full_name: user.full_name || user.name || '',
        email: user.email || '',
        password: '',
        role_name: user.role_name || user.role || 'Auditor',
        is_active: !!user.is_active,
      });
    } else {
      setForm({ full_name: '', email: '', password: '', role_name: 'Auditor', is_active: true });
    }
    setError('');
  }, [open, user]);

  const update = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async () => {
    setError('');
    if (!form.full_name.trim() || !form.email.trim()) {
      setError('Name and email are required.');
      return;
    }
    if (!isEdit && form.password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setSubmitting(true);
    try {
      if (isEdit) {
        await apiFetch(`/users/${user.user_id}`, {
          method: 'PUT',
          body: JSON.stringify({
            full_name: form.full_name,
            email: form.email,
            role_name: form.role_name,
            is_active: form.is_active,
          }),
        });
      } else {
        await apiFetch(`/users`, {
          method: 'POST',
          body: JSON.stringify({
            full_name: form.full_name,
            email: form.email,
            password: form.password,
            role_name: form.role_name,
            is_active: form.is_active,
          }),
        });
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit User' : 'Add User'}
      subtitle={isEdit ? 'Update user details and role.' : 'Create a new user account.'}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={submitting}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={submitting}>
            {!submitting && <Icon.Check />}
            {submitting ? 'Saving…' : (isEdit ? 'Save Changes' : 'Add User')}
          </button>
        </>
      }
    >
      <div className="admin-form-grid">
        {error && <div className="admin-form-error">{error}</div>}

        <div className="admin-form-field full">
          <label>Full Name<span className="req"> *</span></label>
          <input type="text" value={form.full_name} onChange={e => update('full_name', e.target.value)} autoFocus />
        </div>

        <div className="admin-form-field full">
          <label>Email<span className="req"> *</span></label>
          <input type="email" value={form.email} onChange={e => update('email', e.target.value)} placeholder="name@invoiceshield.com" />
        </div>

        {!isEdit && (
          <div className="admin-form-field full">
            <label>Temporary Password<span className="req"> *</span></label>
            <input
              type="password"
              value={form.password}
              onChange={e => update('password', e.target.value)}
              placeholder="At least 8 characters"
            />
          </div>
        )}

        <div className="admin-form-field full">
          <label>Role<span className="req"> *</span></label>
          <select value={form.role_name} onChange={e => update('role_name', e.target.value)}>
            <option value="Admin">Admin</option>
            <option value="Accountant">Accountant</option>
            <option value="Auditor">Auditor</option>
          </select>
        </div>

        {isEdit && (
          <label className="admin-form-checkbox">
            <input type="checkbox" checked={form.is_active} onChange={e => update('is_active', e.target.checked)} />
            Account active
          </label>
        )}
      </div>
    </Modal>
  );
}

/* ============================================================
   Confirm dialog (deactivate / reactivate / approve toggle)
   ============================================================ */
function ConfirmModal({ open, onClose, title, message, confirmLabel, danger, onConfirm }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { if (open) { setSubmitting(false); setError(''); } }, [open]);

  const handle = async () => {
    setSubmitting(true);
    setError('');
    try {
      await onConfirm();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={submitting}>Cancel</button>
          <button
            className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}
            onClick={handle}
            disabled={submitting}
          >
            {submitting ? 'Working…' : confirmLabel}
          </button>
        </>
      }
    >
      {error && <div className="admin-form-error" style={{ marginBottom: 10 }}>{error}</div>}
      <p>{message}</p>
    </Modal>
  );
}

/* ============================================================
   Password reset modal
   ============================================================ */
function PasswordResetModal({ open, onClose, user, onSaved }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { if (open) { setPassword(''); setError(''); setSubmitting(false); } }, [open]);

  const handle = async () => {
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    setSubmitting(true);
    setError('');
    try {
      await apiFetch(`/users/${user.user_id}/password`, {
        method: 'PATCH',
        body: JSON.stringify({ password }),
      });
      onSaved && onSaved();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Reset Password"
      subtitle={user ? `Set a new password for ${user.full_name || user.email}.` : ''}
      size="sm"
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={submitting}>Cancel</button>
          <button className="btn btn-primary" onClick={handle} disabled={submitting}>
            {submitting ? 'Saving…' : 'Reset Password'}
          </button>
        </>
      }
    >
      <div className="admin-form-grid">
        {error && <div className="admin-form-error">{error}</div>}
        <div className="admin-form-field full">
          <label>New Password<span className="req"> *</span></label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            autoFocus
          />
        </div>
      </div>
    </Modal>
  );
}

/* ============================================================
   Vendor Management Tab
   ============================================================ */
function VendorManagement() {
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [search, setSearch] = useState('');
  const [approvalFilter, setApprovalFilter] = useState('');
  const [currencyFilter, setCurrencyFilter] = useState('');

  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const [modal, setModal] = useState({ type: null, vendor: null });
  const closeModal = () => setModal({ type: null, vendor: null });

  const fetchVendors = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch('/vendors');
      setVendors(Array.isArray(data) ? data : (data.vendors || []));
    } catch (err) {
      console.error('Failed to load vendors:', err);
      setError('Could not load vendors. Please try again.');
      setVendors([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchVendors(); }, [fetchVendors]);
  useEffect(() => { setPage(1); }, [search, approvalFilter, currencyFilter, rowsPerPage]);

  const pendingCount   = useMemo(() => vendors.filter(v => !v.is_approved).length, [vendors]);
  const requestedCount = useMemo(() => vendors.filter(v => !v.is_approved && isRequestedVendor(v)).length, [vendors]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return vendors.filter(v => {
      if (q) {
        const hay = `${v.vendor_name || ''} ${v.vendor_code || ''} ${v.email || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (approvalFilter === 'approved' && !v.is_approved) return false;
      if (approvalFilter === 'pending' && v.is_approved) return false;
      if (currencyFilter && (v.currency || v.default_currency) !== currencyFilter) return false;
      return true;
    });
  }, [vendors, search, approvalFilter, currencyFilter]);

  const totalCount = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / rowsPerPage));
  const startRow = totalCount === 0 ? 0 : (page - 1) * rowsPerPage + 1;
  const endRow = Math.min(page * rowsPerPage, totalCount);
  const paged = filtered.slice((page - 1) * rowsPerPage, page * rowsPerPage);

  const pageNumbers = useMemo(() => {
    const nums = [];
    const maxButtons = 3;
    let start = Math.max(1, page - 1);
    let end = Math.min(totalPages, start + maxButtons - 1);
    if (end - start + 1 < maxButtons) start = Math.max(1, end - maxButtons + 1);
    for (let i = start; i <= end; i++) nums.push(i);
    return nums;
  }, [page, totalPages]);

  const handleClearFilters = () => {
    setSearch(''); setApprovalFilter(''); setCurrencyFilter('');
  };

  const handlePendingChipClick = () => {
    setApprovalFilter('pending');
    setPage(1);
  };

  const handleApprovalBadgeClick = (v) => {
    if (!v.is_approved && isRequestedVendor(v)) {
      setModal({ type: 'edit', vendor: v });
    } else {
      setModal({ type: 'approve', vendor: v });
    }
  };

  const toggleStatus = (v) => () => apiFetch(`/vendors/${v.vendor_id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ is_active: !v.is_active }),
  }).then(fetchVendors);

  const toggleApproval = (v) => () => apiFetch(`/vendors/${v.vendor_id}/approve`, {
    method: 'PATCH',
    body: JSON.stringify({ is_approved: !v.is_approved }),
  }).then(fetchVendors);

  return (
    <>
      {pendingCount > 0 && (
        <div className="pending-banner">
          <button
            type="button"
            className="pending-chip"
            onClick={handlePendingChipClick}
            title="View pending vendors"
          >
            <Icon.Bell />
            <span className="pending-chip-count">{pendingCount}</span>
            <span className="pending-chip-text">
              Vendors Awaiting Approval
            </span>
            {requestedCount > 0 && (
              <span className="pending-chip-sub">
                ({requestedCount} submitted by accountants)
              </span>
            )}
          </button>
        </div>
      )}

      <div className="filters">
        <div className="filter-control search">
          <Icon.Search />
          <input
            type="text"
            placeholder="Search vendor name or code..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <div className="filter-control dropdown">
          <Icon.Shield />
          <select value={approvalFilter} onChange={e => setApprovalFilter(e.target.value)}>
            <option value="">Vendor Status</option>
            <option value="approved">Approved</option>
            <option value="pending">Pending Review</option>
          </select>
        </div>

        <div className="filter-control dropdown">
          <Icon.Currency />
          <select value={currencyFilter} onChange={e => setCurrencyFilter(e.target.value)}>
            <option value="">All currencies</option>
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
          </select>
        </div>

        <div className="toolbar-spacer" />

        <button className="btn btn-ghost clear-btn" onClick={handleClearFilters}>
          <Icon.X />
          Clear Filters
        </button>
        <button className="btn btn-primary" onClick={() => setModal({ type: 'add', vendor: null })}>
          <Icon.Plus />
          Add Vendor
        </button>
      </div>

      <div className="table-wrap">
        <div className="table-scroll">
          <table className="vendor-table">
            <colgroup>
              <col className="col-vendor" />
              <col className="col-email" />
              <col className="col-country" />
              <col className="col-currency" />
              <col className="col-vstatus" />
              <col className="col-astatus" />
              <col className="col-registered" />
              <col className="col-actions" />
            </colgroup>
            <thead>
              <tr>
                <th>Vendor</th>
                <th>Email</th>
                <th>Country</th>
                <th>Currency</th>
                <th>Vendor Status</th>
                <th>Account Status</th>
                <th>Registered</th>
                <th className="th-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="8" className="empty-state">Loading vendors...</td></tr>
              ) : error ? (
                <tr><td colSpan="8" className="empty-state error">{error}</td></tr>
              ) : paged.length === 0 ? (
                <tr><td colSpan="8" className="empty-state">No vendors found.</td></tr>
              ) : (
                paged.map(v => {
                  const requested = isRequestedVendor(v);
                  const rowClass = !v.is_approved
                    ? (requested ? 'row-pending row-requested' : 'row-pending')
                    : '';

                  return (
                    <tr key={v.vendor_id} className={`${rowClass} responsive-card-row`.trim()}>
                      <td data-label="Vendor">
                        <div className="vendor-cell">
                          <span className="vendor-name-row">
                            <span className="vendor-name" title={v.vendor_name || ''}>{v.vendor_name || '—'}</span>
                            {!v.is_approved && requested && (
                              <span className="vendor-tag-requested" title="Submitted by an accountant via Upload Invoice">
                                Requested
                              </span>
                            )}
                          </span>
                          <span className="vendor-code">
                            {v.vendor_code || `VND-${String(v.vendor_id).padStart(3, '0')}`}
                          </span>
                        </div>
                      </td>

                      <td data-label="Email" className="cell-mono cell-truncate" title={v.email || ''}>
                        {v.email || '—'}
                      </td>

                      <td data-label="Country" className="cell-truncate" title={v.country || ''}>
                        {v.country || '—'}
                      </td>

                      <td data-label="Currency">
                        <span className="badge badge-neutral">{v.currency || v.default_currency || '—'}</span>
                      </td>

                      <td data-label="Vendor Status">
                        <button
                          className={`badge ${v.is_approved ? 'badge-green' : 'badge-yellow'}`}
                          style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, font: 'inherit' }}
                          title={
                            v.is_approved
                              ? 'Click to move to pending review'
                              : (requested
                                  ? 'Open Edit to replace placeholders and approve'
                                  : 'Click to approve')
                          }
                          onClick={() => handleApprovalBadgeClick(v)}
                        >
                          {v.is_approved ? 'Approved' : 'Pending Review'}
                        </button>
                      </td>

                      <td data-label="Account Status">
                        <span className={`badge ${v.is_active ? 'badge-green' : 'badge-neutral'}`}>
                          {v.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>

                      <td data-label="Registered" className="cell-muted">
                        {formatDate(v.created_at || v.registration_date)}
                      </td>

                      <td data-label="Actions">
                        <div className="row-actions">
                          <button
                            className="icon-btn"
                            title="Edit"
                            onClick={() => setModal({ type: 'edit', vendor: v })}
                          >
                            <Icon.Edit />
                          </button>
                          {v.is_active ? (
                            <button
                              className="icon-btn danger"
                              title="Deactivate"
                              onClick={() => setModal({ type: 'deactivate', vendor: v })}
                            >
                              <Icon.Trash />
                            </button>
                          ) : (
                            <button
                              className="icon-btn"
                              title="Reactivate"
                              onClick={() => setModal({ type: 'reactivate', vendor: v })}
                            >
                              <Icon.Refresh />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="table-footer">
          <div className="footer-left">
            <span className="count">
              Showing <strong>{startRow}{startRow !== endRow ? `–${endRow}` : ''}</strong> of <strong>{totalCount}</strong> vendors
            </span>
            <select className="rows-select" value={rowsPerPage} onChange={e => setRowsPerPage(Number(e.target.value))}>
              <option value={10}>10 rows</option>
              <option value={25}>25 rows</option>
              <option value={50}>50 rows</option>
            </select>
          </div>

          <div className="pager">
            <button className="page-btn" aria-label="Previous" disabled={page === 1} onClick={() => setPage(p => Math.max(1, p - 1))}>
              <Icon.ChevronLeft />
            </button>
            {pageNumbers.map(n => (
              <button key={n} className={`page-btn ${page === n ? 'active' : ''}`} onClick={() => setPage(n)}>
                {n}
              </button>
            ))}
            <button className="page-btn" aria-label="Next" disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>
              <Icon.ChevronRight />
            </button>
          </div>
        </div>
      </div>

      <VendorModal
        open={modal.type === 'add' || modal.type === 'edit'}
        vendor={modal.type === 'edit' ? modal.vendor : null}
        onClose={closeModal}
        onSaved={fetchVendors}
      />
      <ConfirmModal
        open={modal.type === 'deactivate'}
        onClose={closeModal}
        title="Deactivate Vendor"
        message={modal.vendor
          ? `Vendor "${modal.vendor.vendor_name}" will be marked inactive. They will no longer appear in approved-vendor lists. You can reactivate them at any time.`
          : ''}
        confirmLabel="Deactivate"
        danger
        onConfirm={modal.vendor ? toggleStatus(modal.vendor) : () => {}}
      />
      <ConfirmModal
        open={modal.type === 'reactivate'}
        onClose={closeModal}
        title="Reactivate Vendor"
        message={modal.vendor
          ? `Vendor "${modal.vendor.vendor_name}" will be marked active again.`
          : ''}
        confirmLabel="Reactivate"
        onConfirm={modal.vendor ? toggleStatus(modal.vendor) : () => {}}
      />
      <ConfirmModal
        open={modal.type === 'approve'}
        onClose={closeModal}
        title={modal.vendor && modal.vendor.is_approved ? 'Move to Pending Review' : 'Approve Vendor'}
        message={modal.vendor && modal.vendor.is_approved
          ? `Vendor "${modal.vendor.vendor_name}" will be moved back to pending review. Invoices from this vendor may then trigger the "Unapproved Vendor" fraud rule.`
          : modal.vendor
            ? `Vendor "${modal.vendor.vendor_name}" will be marked as approved. Invoices from this vendor will no longer trigger the "Unapproved Vendor" fraud rule.`
            : ''}
        confirmLabel={modal.vendor && modal.vendor.is_approved ? 'Move to Pending' : 'Approve'}
        danger={!!(modal.vendor && modal.vendor.is_approved)}
        onConfirm={modal.vendor ? toggleApproval(modal.vendor) : () => {}}
      />
    </>
  );
}

/* ============================================================
   User Management Tab
   ============================================================ */
function UserManagement() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const [modal, setModal] = useState({ type: null, user: null });
  const closeModal = () => setModal({ type: null, user: null });

  const currentUser = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('user') || '{}'); }
    catch { return {}; }
  }, []);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch('/users');
      setUsers(Array.isArray(data) ? data : (data.users || []));
    } catch (err) {
      console.error('Failed to load users:', err);
      setError('Could not load users. Please try again.');
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);
  useEffect(() => { setPage(1); }, [search, roleFilter, statusFilter, rowsPerPage]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter(u => {
      if (q) {
        const hay = `${u.full_name || u.name || ''} ${u.email || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (roleFilter) {
        const role = (u.role_name || u.role || '').toLowerCase();
        if (role !== roleFilter.toLowerCase()) return false;
      }
      if (statusFilter === 'active' && !u.is_active) return false;
      if (statusFilter === 'inactive' && u.is_active) return false;
      return true;
    });
  }, [users, search, roleFilter, statusFilter]);

  const totalCount = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / rowsPerPage));
  const startRow = totalCount === 0 ? 0 : (page - 1) * rowsPerPage + 1;
  const endRow = Math.min(page * rowsPerPage, totalCount);
  const paged = filtered.slice((page - 1) * rowsPerPage, page * rowsPerPage);

  const pageNumbers = useMemo(() => {
    const nums = [];
    const maxButtons = 3;
    let start = Math.max(1, page - 1);
    let end = Math.min(totalPages, start + maxButtons - 1);
    if (end - start + 1 < maxButtons) start = Math.max(1, end - maxButtons + 1);
    for (let i = start; i <= end; i++) nums.push(i);
    return nums;
  }, [page, totalPages]);

  const handleClearFilters = () => { setSearch(''); setRoleFilter(''); setStatusFilter(''); };

  const toggleStatus = (u) => () => apiFetch(`/users/${u.user_id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ is_active: !u.is_active }),
  }).then(fetchUsers);

  return (
    <>
      <div className="filters">
        <div className="filter-control search">
          <Icon.Search />
          <input
            type="text"
            placeholder="Search by name or email..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <div className="filter-control dropdown">
          <Icon.UserRole />
          <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
            <option value="">All Roles</option>
            <option value="Admin">Admin</option>
            <option value="Accountant">Accountant</option>
            <option value="Auditor">Auditor</option>
          </select>
        </div>

        <div className="filter-control dropdown">
          <Icon.Power />
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>

        <div className="toolbar-spacer" />

        <button className="btn btn-ghost clear-btn" onClick={handleClearFilters}>
          <Icon.X />
          Clear Filters
        </button>
        <button className="btn btn-primary" onClick={() => setModal({ type: 'add', user: null })}>
          <Icon.Plus />
          Add User
        </button>
      </div>

      <div className="table-wrap">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>User</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Created</th>
                <th className="th-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="6" className="empty-state">Loading users...</td></tr>
              ) : error ? (
                <tr><td colSpan="6" className="empty-state error">{error}</td></tr>
              ) : paged.length === 0 ? (
                <tr><td colSpan="6" className="empty-state">No users found.</td></tr>
              ) : (
                paged.map(u => {
                  const fullName = u.full_name || u.name || '—';
                  const role = u.role_name || u.role || '';
                  const initials = getInitials(fullName);
                  const variant = avatarVariant(u.user_id || u.email || fullName);
                  const isSelf = currentUser && u.user_id === currentUser.user_id;

                  return (
                    <tr key={u.user_id || u.email} className="responsive-card-row">
                      <td data-label="User">
                        <div className="row-user">
                          <div className={`row-avatar ${variant}`.trim()}>{initials}</div>
                          <span className="cell-strong">{fullName}</span>
                        </div>
                      </td>

                      <td data-label="Email" className="cell-mono">
                        {u.email || '—'}
                      </td>

                      <td data-label="Role">
                        <span className={`badge ${roleBadgeClass(role)}`}>{role || '—'}</span>
                      </td>

                      <td data-label="Status">
                        <span className={`badge ${u.is_active ? 'badge-green' : 'badge-neutral'}`}>
                          {u.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>

                      <td data-label="Created" className="cell-muted">
                        {formatDate(u.created_at)}
                      </td>

                      <td data-label="Actions">
                        <div className="row-actions">
                          <button
                            className="icon-btn"
                            title="Edit"
                            onClick={() => setModal({ type: 'edit', user: u })}
                          >
                            <Icon.Edit />
                          </button>
                          <button
                            className="icon-btn"
                            title="Reset password"
                            onClick={() => setModal({ type: 'reset', user: u })}
                          >
                            <Icon.Lock />
                          </button>
                          {u.is_active ? (
                            <button
                              className="icon-btn danger"
                              title={isSelf ? "You can't deactivate yourself" : "Deactivate"}
                              disabled={isSelf}
                              style={isSelf ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}
                              onClick={() => !isSelf && setModal({ type: 'deactivate', user: u })}
                            >
                              <Icon.Trash />
                            </button>
                          ) : (
                            <button
                              className="icon-btn"
                              title="Reactivate"
                              onClick={() => setModal({ type: 'reactivate', user: u })}
                            >
                              <Icon.Refresh />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="table-footer">
          <div className="footer-left">
            <span className="count">
              Showing <strong>{startRow}{startRow !== endRow ? `–${endRow}` : ''}</strong> of <strong>{totalCount}</strong> users
            </span>
            <select className="rows-select" value={rowsPerPage} onChange={e => setRowsPerPage(Number(e.target.value))}>
              <option value={10}>10 rows</option>
              <option value={25}>25 rows</option>
              <option value={50}>50 rows</option>
            </select>
          </div>

          <div className="pager">
            <button className="page-btn" aria-label="Previous" disabled={page === 1} onClick={() => setPage(p => Math.max(1, p - 1))}>
              <Icon.ChevronLeft />
            </button>
            {pageNumbers.map(n => (
              <button key={n} className={`page-btn ${page === n ? 'active' : ''}`} onClick={() => setPage(n)}>
                {n}
              </button>
            ))}
            <button className="page-btn" aria-label="Next" disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>
              <Icon.ChevronRight />
            </button>
          </div>
        </div>
      </div>

      <UserModal
        open={modal.type === 'add' || modal.type === 'edit'}
        user={modal.type === 'edit' ? modal.user : null}
        onClose={closeModal}
        onSaved={fetchUsers}
      />
      <ConfirmModal
        open={modal.type === 'deactivate'}
        onClose={closeModal}
        title="Deactivate User"
        message={modal.user
          ? `User "${modal.user.full_name || modal.user.email}" will be marked inactive and will no longer be able to log in. You can reactivate them at any time.`
          : ''}
        confirmLabel="Deactivate"
        danger
        onConfirm={modal.user ? toggleStatus(modal.user) : () => {}}
      />
      <ConfirmModal
        open={modal.type === 'reactivate'}
        onClose={closeModal}
        title="Reactivate User"
        message={modal.user
          ? `User "${modal.user.full_name || modal.user.email}" will regain access to the system.`
          : ''}
        confirmLabel="Reactivate"
        onConfirm={modal.user ? toggleStatus(modal.user) : () => {}}
      />
      <PasswordResetModal
        open={modal.type === 'reset'}
        user={modal.user}
        onClose={closeModal}
      />
    </>
  );
}

/* ============================================================
   AdministrationPage — wraps both tabs
   ============================================================ */
export default function AdministrationPage() {
  const [activeTab, setActiveTab] = useState('vendors');

  return (
    <AppLayout>
      <div className="administration-page">
        <div className="page-header">
          <h1 className="page-title">Administration</h1>
          <p className="page-subtitle">Manage approved vendors and system users</p>
        </div>

        <div className="tabs-bar">
          <button
            className={`tab-btn ${activeTab === 'vendors' ? 'active' : ''}`}
            onClick={() => setActiveTab('vendors')}
          >
            <Icon.Vendors />
            Vendor Management
          </button>
          <button
            className={`tab-btn ${activeTab === 'users' ? 'active' : ''}`}
            onClick={() => setActiveTab('users')}
          >
            <Icon.Users />
            User Management
          </button>
        </div>

        <div className={`tab-panel ${activeTab === 'vendors' ? 'active' : ''}`}>
          {activeTab === 'vendors' && <VendorManagement />}
        </div>
        <div className={`tab-panel ${activeTab === 'users' ? 'active' : ''}`}>
          {activeTab === 'users' && <UserManagement />}
        </div>
      </div>
    </AppLayout>
  );
}