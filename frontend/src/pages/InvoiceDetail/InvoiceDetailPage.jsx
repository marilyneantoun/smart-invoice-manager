// ============================================================
// pages/InvoiceDetail/InvoiceDetailPage.jsx
// Single invoice detail view - original document, OCR comparison,
// risk summary, triggered rules, action buttons, and audit trail.
// ============================================================

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import AppLayout from '../../components/Layout/AppLayout';
import './InvoiceDetailPage.css';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

function formatDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return '—';
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
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

function fileUrl(storedPath) {
  if (!storedPath) return '';
  const base = API.replace(/\/api\/?$/, '');
  const norm = storedPath.replace(/\\/g, '/');
  const idx = norm.toLowerCase().indexOf('/uploads/');
  const relPath = idx >= 0 ? norm.slice(idx) : '/' + norm.replace(/^\/+/, '');
  return `${base}${relPath}`;
}

const Icon = {
  download: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
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

function timelineIcon(actionType) {
  switch (actionType) {
    case 'Created': return Icon.plus;
    case 'Updated': return Icon.edit;
    case 'Approved': return Icon.check;
    case 'Rejected': return Icon.reject;
    case 'Flagged': return Icon.flag;
    default: return Icon.edit;
  }
}

function ReasonModal({ open, title, helper, onCancel, onSubmit, submitting, optional = false }) {
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (open) setReason('');
  }, [open]);

  if (!open) return null;

  const canSubmit = optional || reason.trim().length > 0;

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal">
        <div className="modal-title">{title}</div>
        <div className="modal-helper">{helper}</div>
        <textarea
          className="modal-textarea"
          rows={4}
          placeholder={optional ? 'Enter a reason (optional)…' : 'Enter a reason…'}
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
            disabled={!canSubmit || submitting}
          >
            {submitting ? 'Saving…' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function InvoiceDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [modal, setModal] = useState({ open: false, action: null });
  const [submitting, setSubmitting] = useState(false);

  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const userRole = user.role_name || 'Auditor';
  const canAct = userRole === 'Accountant';

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

  useEffect(() => {
    fetchInvoice();
  }, [fetchInvoice]);

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
      reject: 'Rejected',
      flag: 'Flagged',
      pending: 'Pending',
    }[action];

    if (!targetStatus) return;

    // Reject and Flag — reason mandatory, always.
    if (targetStatus === 'Rejected' || targetStatus === 'Flagged') {
      setModal({
        open: true,
        action,
        title: targetStatus === 'Rejected' ? 'Reject Invoice' : 'Flag Invoice',
        helper: `A reason is required when ${targetStatus.toLowerCase()} an invoice.`,
        optional: false,
        targetStatus,
      });
      return;
    }

    // Approve / Leave Pending after the first decision — reason mandatory.
    if (!isFirstDecision()) {
      setModal({
        open: true,
        action,
        title: targetStatus === 'Approved' ? 'Approve Invoice' : 'Leave Pending',
        helper: 'A reason is required for any status change after the first decision.',
        optional: false,
        targetStatus,
      });
      return;
    }

    // Approve / Leave Pending on the FIRST decision — reason optional.
    setModal({
      open: true,
      action,
      title: targetStatus === 'Approved' ? 'Approve Invoice' : 'Leave Pending',
      helper: 'You may add a reason for this decision, or leave it blank.',
      optional: true,
      targetStatus,
    });
  };

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

  const { invoice, ocr_result, fraud_analysis, triggered_rules, history } = data;
  const riskScore = fraud_analysis?.risk_score ?? null;
  const ringAngle = riskScore !== null ? Math.min(riskScore, 100) : 0;

  return (
    <AppLayout>
      <div className="invd-page">
        <div className="breadcrumb">
          <a href="#" onClick={(e) => { e.preventDefault(); navigate('/invoices'); }}>Invoice List</a>
          <span className="sep">›</span>
          <span className="current">{invoice.invoice_number}</span>
        </div>

        <header className="invoice-header">
          <div className="invoice-title-block">
            <div className="invoice-num">{invoice.invoice_number}</div>
            <div className="invoice-vendor">{invoice.vendor_name}</div>
            <div className="invoice-file-type">{invoice.file_type || 'PDF'}</div>
          </div>

          <div className="invoice-meta-middle">
            <div className="header-meta-line">
              <span className="header-meta-label">Uploaded</span>
              <span className="header-meta-value">{formatDateTime(invoice.uploaded_at)}</span>
            </div>

            <div className="header-meta-line">
              <span className="header-meta-label">By</span>
              <span className="header-meta-value">{invoice.uploaded_by_name || '—'}</span>
            </div>
          </div>

          <div className="invoice-meta-right">
            <div className="header-meta-line">
              <span className="header-meta-label">Status</span>
              <span className="detail-label">{invoice.status || '—'}</span>
            </div>

            <div className="header-meta-line">
              <span className="header-meta-label">Risk</span>
              <span className="detail-label">
                {riskScore === null ? '—' : riskLevelLabel(riskScore).replace(' Risk', '')}
              </span>
            </div>
          </div>
        </header>

        <div className="detail-grid">
          <section className="detail-card doc-card">
            <div className="card-head">
              <h2>Original Document</h2>
            </div>

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

          <div className="right-stack">
            <section className="detail-card review-card">
              <div className="card-head">
                <h2>Extracted Data & Review</h2>
              </div>

              <div className="review-body">
                <table className="compare-table">
                  <thead>
                    <tr>
                      <th>Field</th>
                      <th>Extracted Value</th>
                      <th>Saved Value</th>
                      <th>Match</th>
                    </tr>
                  </thead>
                  <tbody>
                    <CompareRow label="Vendor Name" ocr={ocr_result?.extracted_vendor_name} saved={invoice.vendor_name} />
                    <CompareRow label="Invoice Number" ocr={ocr_result?.extracted_invoice_number} saved={invoice.invoice_number} />
                    <CompareRow label="Invoice Date" ocr={formatDate(ocr_result?.extracted_invoice_date)} saved={formatDate(invoice.invoice_date)} />
                    <CompareRow
                      label="Amount"
                      ocr={ocr_result?.extracted_amount
                        ? formatAmount(ocr_result.extracted_amount, ocr_result?.extracted_currency || invoice.currency)
                        : null}
                      saved={formatAmount(invoice.amount, invoice.currency)}
                    />
                    <CompareRow label="Currency" ocr={ocr_result?.extracted_currency} saved={invoice.currency} />
                  </tbody>
                </table>

                <div className="risk-panel">
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
                          ? `${triggered_rules.length} risk indicator${triggered_rules.length > 1 ? 's' : ''} detected. Manual review required`
                          : 'No risk indicator detected.'}
                      </div>
                    </div>
                  </div>

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
                </div>
              </div>
            </section>
          </div>
        </div>

        <section className="detail-card action-card">
          <div className="card-head">
            <h2>Take Action</h2>
          </div>

          <div className="action-body">
            <p className="ta-helper">
              A reason is required for all decision changes on this invoice.
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
          </div>
        </section>

        <section className="detail-card audit-card">
          <div className="card-head">
            <h2>Audit Trail</h2>
          </div>

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

      <ReasonModal
        open={modal.open}
        title={modal.title}
        helper={modal.helper}
        optional={modal.optional}
        submitting={submitting}
        onCancel={() => setModal({ open: false, action: null })}
        onSubmit={(reason) => submitStatusChange(modal.targetStatus, reason)}
      />
    </AppLayout>
  );
}

function DocumentPreview({ storedPath, fileType, fileName }) {
  const [status, setStatus] = useState('checking');

  useEffect(() => {
    if (!storedPath) {
      setStatus('missing');
      return;
    }

    const url = fileUrl(storedPath);
    let alive = true;

    fetch(url, { method: 'HEAD' })
      .then(res => { if (alive) setStatus(res.ok ? 'ok' : 'missing'); })
      .catch(() => { if (alive) setStatus('missing'); });

    return () => {
      alive = false;
    };
  }, [storedPath]);

  if (status === 'checking') {
    return <div className="doc-preview"><div className="label">Loading preview…</div></div>;
  }

  if (status === 'missing') {
    return (
      <div className="doc-preview doc-preview-missing">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
        <div className="label">PDF not found</div>
      </div>
    );
  }

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

function CompareRow({ label, ocr, saved }) {
  const ocrStr = ocr === null || ocr === undefined || ocr === '' ? '—' : String(ocr);
  const savedStr = saved === null || saved === undefined || saved === '' ? '—' : String(saved);
  const isMatch = ocrStr.trim().toLowerCase() === savedStr.trim().toLowerCase();

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
