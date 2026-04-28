// ============================================================
// pages/InvoiceDetail/InvoiceDetailPage.jsx
// Single invoice detail view — original document, OCR comparison,
// risk summary, triggered rules, action buttons, and audit trail.
//
// Access: Admin, Accountant, Viewer (everyone authenticated).
// Action buttons (Approve / Reject / Leave Pending / Flag) only
// take effect for Accountants; the backend enforces the role.
//
// Wraps in AppLayout so it shares the same sidebar nav as every
// other page (Dashboard, Invoice List, Upload, etc.).
//
// Talks to:
//   GET  /api/invoices/:id        → full invoice payload
//   PUT  /api/invoices/:id/status → status changes
// ============================================================

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import AppLayout from '../../components/Layout/AppLayout';
import './InvoiceDetailPage.css';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

/* ── Helpers ────────────────────────────────────────────── */
function formatDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return '—';
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return '—';
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function formatAmount(amount, currency) {
  if (amount === null || amount === undefined) return '—';
  const num = Number(amount);
  if (isNaN(num)) return '—';
  const symbols = { USD: '$', EUR: '€', GBP: '£', LBP: 'LL ' };
  const sym = symbols[currency] || '';
  return `${sym}${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function riskLevelLabel(score) {
  if (score === null || score === undefined) return 'Low Risk';
  if (score >= 61) return 'High Risk';
  if (score >= 31) return 'Medium Risk';
  return 'Low Risk';
}

function riskColorVar(score) {
  if (score === null || score === undefined) return 'var(--green)';
  if (score >= 61) return 'var(--red)';
  if (score >= 31) return 'var(--yellow)';
  return 'var(--green)';
}

/* Build a browser-fetchable URL from whatever shape `stored_file_path` has.
   The DB may hold an absolute filesystem path
     (e.g. "C:/Users/.../backend/uploads/invoices/2026/04/inv_x.pdf")
   or already a relative one ("uploads/invoices/...").
   We want:  http://localhost:5000/uploads/invoices/2026/04/inv_x.pdf  */
function fileUrl(storedPath) {
  if (!storedPath) return '';
  const base    = API.replace(/\/api\/?$/, '');     // → http://localhost:5000
  const norm    = storedPath.replace(/\\/g, '/');   // windows safety
  const idx     = norm.toLowerCase().indexOf('/uploads/');
  const relPath = idx >= 0 ? norm.slice(idx) : '/' + norm.replace(/^\/+/, '');
  return `${base}${relPath}`;
}

/* ── Inline icons ───────────────────────────────────────── */
const Icon = {
  download: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  ),
  file: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  ),
  fileSmall: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  ),
  calendar: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
  user: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
  chevron: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  ),
  check: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  reject: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  ),
  pending: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  flag: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 22V4a1 1 0 0 1 1-1h13l-3 5 3 5H5" />
    </svg>
  ),
  back: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  ),
  plus: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  ),
  edit: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  ),
};

/* ── Action timeline icon picker ────────────────────────── */
function timelineIcon(actionType) {
  switch (actionType) {
    case 'Created':  return Icon.plus;
    case 'Updated':  return Icon.edit;
    case 'Approved': return Icon.check;
    case 'Rejected': return Icon.reject;
    case 'Flagged':  return Icon.flag;
    default:         return Icon.edit;
  }
}

/* ── Reason modal — required for Reject / Flag / subsequent updates ── */
function ReasonModal({ open, title, helper, onCancel, onSubmit, submitting }) {
  const [reason, setReason] = useState('');
  useEffect(() => { if (open) setReason(''); }, [open]);
  if (!open) return null;
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal">
        <div className="modal-title">{title}</div>
        <div className="modal-helper">{helper}</div>
        <textarea
          className="modal-textarea"
          rows={4}
          placeholder="Enter a reason…"
          value={reason}
          onChange={e => setReason(e.target.value)}
          autoFocus
        />
        <div className="modal-actions">
          <button className="modal-cancel" onClick={onCancel} disabled={submitting}>
            Cancel
          </button>
          <button
            className="modal-submit"
            onClick={() => onSubmit(reason.trim())}
            disabled={!reason.trim() || submitting}
          >
            {submitting ? 'Saving…' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────── */
/*                  MAIN COMPONENT                          */
/* ──────────────────────────────────────────────────────── */
export default function InvoiceDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [data, setData]         = useState(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [showRaw, setShowRaw]   = useState(false);

  // Reason modal state
  const [modal, setModal] = useState({ open: false, action: null });
  const [submitting, setSubmitting] = useState(false);

  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const userRole = user.role_name || 'Viewer';
  const canAct = userRole === 'Accountant';

  /* ── Fetch invoice ── */
  const fetchInvoice = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API}/invoices/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || 'Failed to load invoice.');
      }
      const json = await res.json();
      setData(json);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchInvoice(); }, [fetchInvoice]);

  /* ── Status change handler ── */
  const submitStatusChange = async (newStatus, reason) => {
    setSubmitting(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API}/invoices/${id}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ new_status: newStatus, reason: reason || null }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message || 'Update failed.');
      alert(body.message);
      setModal({ open: false, action: null });
      await fetchInvoice();
    } catch (e) {
      alert(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  /* ── Decide whether reason is required ── */
  // Reject + Flag → always required.
  // Approve / Leave Pending → first decision is optional, subsequent require a reason.
  const isFirstDecision = () => {
    if (!data || !Array.isArray(data.history)) return true;
    return data.history.filter(h => h.action_type !== 'Created').length === 0;
  };

  const handleAction = (action) => {
    if (!canAct) {
      alert('Only Accountants can change invoice status.');
      return;
    }

    const targetStatus = {
      approve: 'Approved',
      reject:  'Rejected',
      flag:    'Flagged',
      pending: 'Pending',
    }[action];

    if (!targetStatus) return;

    // Reject / Flag — always require a reason
    if (targetStatus === 'Rejected' || targetStatus === 'Flagged') {
      setModal({
        open: true,
        action,
        title: targetStatus === 'Rejected' ? 'Reject Invoice' : 'Flag Invoice',
        helper: `A reason is required when ${targetStatus.toLowerCase()} an invoice.`,
        targetStatus,
      });
      return;
    }

    // Approve / Leave Pending: subsequent change → reason required, first → optional
    if (!isFirstDecision()) {
      setModal({
        open: true,
        action,
        title: targetStatus === 'Approved' ? 'Approve Invoice' : 'Leave Pending',
        helper: 'A reason is required for any status change after the first decision.',
        targetStatus,
      });
      return;
    }

    // First decision Approve/Pending → no reason needed
    submitStatusChange(targetStatus, null);
  };

  /* ── Render ── */
  if (loading) {
    return (
      <AppLayout>
        <div className="invd-state">Loading invoice…</div>
      </AppLayout>
    );
  }

  if (error) {
    return (
      <AppLayout>
        <div className="invd-state invd-state-error">
          <div>{error}</div>
          <button className="invd-retry" onClick={fetchInvoice}>Retry</button>
        </div>
      </AppLayout>
    );
  }

  if (!data) return null;

  const {
    invoice,           // { invoice_id, invoice_number, invoice_date, amount, currency,
                       //   status, was_corrected_at_review, file_type,
                       //   original_file_name, stored_file_path,
                       //   uploaded_at, uploaded_by_name, vendor_name }
    ocr_result,        // { extracted_*, raw_text }
    fraud_analysis,    // { risk_score, risk_level }
    triggered_rules,   // [{ rule_name, weight, reason_text }]
    history,           // [{ action_type, old_status, new_status, reason, changed_at, changed_by_name }]
  } = data;

  const riskScore = fraud_analysis?.risk_score ?? null;
  const ringAngle = riskScore !== null ? Math.min(riskScore, 100) : 0;

  return (
    <AppLayout>
      <div className="invd-page">
        {/* Breadcrumb */}
        <div className="breadcrumb">
          <a href="#" onClick={(e) => { e.preventDefault(); navigate('/invoices'); }}>Invoice List</a>
          <span className="sep">›</span>
          <span className="current">{invoice.invoice_number}</span>
        </div>

        {/* Header */}
        <header className="invoice-header">
          <div className="invoice-num">{invoice.invoice_number}</div>
          <div className="invoice-vendor">{invoice.vendor_name}</div>

          <div className="invoice-meta-row">
            <span className="meta-item">
              {Icon.calendar}
              <span className="label">Uploaded</span>
              <span className="value">{formatDateTime(invoice.uploaded_at)}</span>
            </span>

            <span className="meta-item">
              {Icon.user}
              <span className="label">By</span>
              <span className="value">{invoice.uploaded_by_name || '—'}</span>
            </span>

            <span className="meta-item">
              {Icon.fileSmall}
              <span className="value">{invoice.file_type || 'PDF'}</span>
            </span>

            <span className="meta-item">
              <span className="meta-dot" />
              <span className="label">Status</span>
              <span className="value">{invoice.status}</span>
            </span>

            <span className="meta-item">
              <span className="meta-dot" />
              <span className="label">Risk</span>
              <span className="value">
                {riskScore === null ? '—' : riskLevelLabel(riskScore).replace(' Risk', '')}
              </span>
            </span>

            {invoice.was_corrected_at_review ? (
              <span className="meta-item">
                <span className="meta-dot" />
                <span className="value">OCR Corrected</span>
              </span>
            ) : null}
          </div>
        </header>

        {/* Two-column section */}
        <div className="two-col">
          {/* LEFT — Original Document */}
          <section>
            <div className="section-head">
              <div className="section-title">Original Document</div>
            </div>
            <div className="section-rule" />

            <div className="doc-toolbar">
              <span className="doc-filename">{invoice.original_file_name}</span>
              <a
                className="download-btn"
                href={fileUrl(invoice.stored_file_path)}
                target="_blank"
                rel="noreferrer"
                download={invoice.original_file_name}
              >
                {Icon.download}
                Download
              </a>
            </div>

            <DocumentPreview
              storedPath={invoice.stored_file_path}
              fileType={invoice.file_type}
              fileName={invoice.original_file_name}
            />
          </section>

          {/* RIGHT — Extracted Data + Risk + Rules */}
          <section>
            <div className="section-head">
              <div className="section-title">Extracted Data Comparison</div>
            </div>
            <div className="section-rule" />

            <table className="compare-table">
              <thead>
                <tr>
                  <th>Field</th>
                  <th>OCR Extracted</th>
                  <th>Saved Value</th>
                  <th>Match</th>
                </tr>
              </thead>
              <tbody>
                <CompareRow
                  label="Vendor Name"
                  ocr={ocr_result?.extracted_vendor_name}
                  saved={invoice.vendor_name}
                />
                <CompareRow
                  label="Invoice Number"
                  ocr={ocr_result?.extracted_invoice_number}
                  saved={invoice.invoice_number}
                />
               <CompareRow
                 label="Invoice Date"
                 ocr={formatDate(ocr_result?.extracted_invoice_date)}
                 saved={formatDate(invoice.invoice_date)}
               />
                <CompareRow
                  label="Amount"
                  ocr={ocr_result?.extracted_amount
                    ? formatAmount(ocr_result.extracted_amount, ocr_result?.extracted_currency || invoice.currency)
                    : null}
                  saved={formatAmount(invoice.amount, invoice.currency)}
                />
                <CompareRow
                  label="Currency"
                  ocr={ocr_result?.extracted_currency}
                  saved={invoice.currency}
                />
              </tbody>
            </table>

            <button className="raw-toggle" onClick={() => setShowRaw(s => !s)}>
              {Icon.chevron}
              {showRaw ? 'Hide Raw OCR Text' : 'View Raw OCR Text'}
            </button>
            {showRaw && (
              <pre className="raw-ocr">{ocr_result?.raw_text || 'No raw OCR text available.'}</pre>
            )}

            {/* Risk summary */}
            <div className="risk-summary">
              <div
                className="risk-ring"
                style={{
                  background: `conic-gradient(${riskColorVar(riskScore)} 0% ${ringAngle}%, rgba(15,23,42,0.08) ${ringAngle}% 100%)`,
                  color: riskColorVar(riskScore),
                }}
              >
                <span>{riskScore !== null ? Math.round(riskScore) : '—'}</span>
              </div>
              <div className="risk-info">
                <div className="level">{riskLevelLabel(riskScore)}</div>
                <div className="desc">
                  {triggered_rules?.length
                    ? `${triggered_rules.length} fraud rule${triggered_rules.length > 1 ? 's' : ''} triggered — manual review required`
                    : 'No fraud rules triggered'}
                </div>
              </div>
            </div>

            {/* Triggered rules */}
            {triggered_rules?.length > 0 && (
              <div className="rule-list">
                {triggered_rules.map((rule, i) => (
                  <div className="rule-row" key={i}>
                    <div>
                      <div className="rule-name">{rule.rule_name}</div>
                      <div className="rule-reason">{rule.reason_text}</div>
                    </div>
                    <div className="rule-weight">+{rule.weight} pts</div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Take Action */}
        <section className="section">
          <div className="section-head">
            <div className="section-title">Take Action</div>
          </div>
          <div className="section-rule" />

          <p className="ta-helper">
            Reject and Flag require a mandatory reason. The first decision from Pending may be saved without one.
          </p>

          <div className="take-action">
            <button
              className="btn btn-approve"
              disabled={!canAct || submitting || invoice.status === 'Approved'}
              onClick={() => handleAction('approve')}
            >
              {Icon.check} Approve
            </button>
            <button
              className="btn btn-reject"
              disabled={!canAct || submitting || invoice.status === 'Rejected'}
              onClick={() => handleAction('reject')}
            >
              {Icon.reject} Reject
            </button>
            <button
              className="btn btn-pending"
              disabled={!canAct || submitting || invoice.status === 'Pending'}
              onClick={() => handleAction('pending')}
            >
              {Icon.pending} Leave Pending
            </button>
            <button
              className="btn btn-flag"
              disabled={!canAct || submitting || invoice.status === 'Flagged'}
              onClick={() => handleAction('flag')}
            >
              {Icon.flag} Flag
            </button>
          </div>

          <a
            href="#"
            className="back-link"
            onClick={(e) => { e.preventDefault(); navigate('/invoices'); }}
          >
            {Icon.back} Back to Invoice List
          </a>
        </section>

        {/* Audit Trail */}
        <section className="section">
          <div className="section-head">
            <div className="section-title">Audit Trail</div>
          </div>
          <div className="section-rule" />

          <div className="timeline">
            {history?.length > 0 ? (
              history.map((entry, i) => (
                <div className="tl-entry" key={i}>
                  <div className="tl-icon">{timelineIcon(entry.action_type)}</div>
                  <div className="tl-action">{entry.action_type}</div>
                  <div className="tl-transition">
                    {entry.old_status || '—'} <span className="tl-arrow">→</span> {entry.new_status}
                  </div>
                  {entry.reason && <div className="tl-reason">{entry.reason}</div>}
                  <div className="tl-meta">
                    by {entry.changed_by_name || 'System'} · {formatDateTime(entry.changed_at)}
                  </div>
                </div>
              ))
            ) : (
              <div className="tl-empty">No history yet.</div>
            )}
          </div>
        </section>
      </div>

      {/* Reason modal */}
      <ReasonModal
        open={modal.open}
        title={modal.title}
        helper={modal.helper}
        submitting={submitting}
        onCancel={() => setModal({ open: false, action: null })}
        onSubmit={(reason) => submitStatusChange(modal.targetStatus, reason)}
      />
    </AppLayout>
  );
}

/* ── Document preview — probes the file URL first so we can show
       a clean fallback instead of a JSON 404 page in the iframe. ── */
function DocumentPreview({ storedPath, fileType, fileName }) {
  const [status, setStatus] = useState('checking'); // 'checking' | 'ok' | 'missing'

  useEffect(() => {
    if (!storedPath) { setStatus('missing'); return; }

    const url = fileUrl(storedPath);
    let alive = true;

    fetch(url, { method: 'HEAD' })
      .then(res => { if (alive) setStatus(res.ok ? 'ok' : 'missing'); })
      .catch(()  => { if (alive) setStatus('missing'); });

    return () => { alive = false; };
  }, [storedPath]);

  if (status === 'checking') {
    return <div className="doc-preview"><div className="label">Loading preview…</div></div>;
  }

  if (status === 'missing') {
    return (
      <div className="doc-preview">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
        <div className="label">PDF not found</div>
      </div>
    );
  }

  // status === 'ok' → render the real file
  const url = fileUrl(storedPath);
  if (fileType === 'IMAGE') {
    return (
      <div className="doc-frame">
        <img src={url} alt={fileName} />
      </div>
    );
  }
  return <iframe className="doc-frame" src={url} title={fileName} />;
}

/* ── Comparison row — auto-detects mismatch ── */
function CompareRow({ label, ocr, saved }) {
  const ocrStr   = ocr   === null || ocr   === undefined || ocr   === '' ? '—' : String(ocr);
  const savedStr = saved === null || saved === undefined || saved === '' ? '—' : String(saved);
  const isMatch  = ocrStr.trim().toLowerCase() === savedStr.trim().toLowerCase();
  return (
    <tr>
      <td className="field-name">{label}</td>
      <td>{ocrStr}</td>
      <td>{savedStr}</td>
      <td className={isMatch ? 'match-yes' : 'match-no'}>
        {isMatch ? 'Yes' : 'No — corrected'}
      </td>
    </tr>
  );
}
