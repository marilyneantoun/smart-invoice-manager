// ============================================================
// pages/UploadInvoice/UploadInvoicePage.jsx
// Upload Invoice — single page, 4-phase multi-step workflow.
//   Phase 1: File Upload (drag & drop / browse)
//   Phase 2: Review OCR-extracted data (split panel)
//   Phase 3: Processing animation (saving + fraud analysis)
//   Phase 4: Fraud results display + action buttons
//
// Access: Accountant only.
// Wraps in AppLayout (sidebar + main area).
// Talks to backend at /api/invoices/upload, /api/ocr/extract,
// /api/invoices/:id/status, and /api/vendors (approved list).
// ============================================================

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import AppLayout from '../../components/Layout/AppLayout';
import './UploadInvoicePage.css';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';


/* ================================================================
   TOAST NOTIFICATION COMPONENT
   ================================================================ */
function Toast({ toast, onClose }) {
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(onClose, 4500);
    return () => clearTimeout(timer);
  }, [toast, onClose]);

  if (!toast) return null;

  const icons = {
    success: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
        <polyline points="22 4 12 14.01 9 11.01" />
      </svg>
    ),
    error: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
        <line x1="15" y1="9" x2="9" y2="15" />
        <line x1="9" y1="9" x2="15" y2="15" />
      </svg>
    ),
    warning: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    ),
  };

  return (
    <div className={`toast toast-${toast.type}`}>
      <div className="toast-icon">{icons[toast.type]}</div>
      <div className="toast-body">
        <div className="toast-title">{toast.title}</div>
        {toast.message && <div className="toast-message">{toast.message}</div>}
      </div>
      <button className="toast-close" onClick={onClose}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}


/* ================================================================
   REASON MODAL — styled popup for entering action reason
   ================================================================ */
function ReasonModal({ modal, onChange, onSubmit, onCancel }) {
  if (!modal) return null;

  const statusLabels = {
    Approved: 'Approve',
    Rejected: 'Reject',
    Flagged: 'Flag',
    Pending: 'Leave Pending',
  };

  const statusColors = {
    Approved: 'var(--green)',
    Rejected: 'var(--red)',
    Flagged: 'var(--yellow)',
    Pending: 'var(--text-secondary)',
  };

  return (
    <div className="reason-overlay" onClick={onCancel}>
      <div className="reason-modal" onClick={(e) => e.stopPropagation()}>
        <div className="reason-modal-header">
          <span className="reason-modal-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
            {statusLabels[modal.status]} Invoice
          </span>
          <button className="reason-modal-close" onClick={onCancel}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="reason-modal-body">
          <label className="reason-label">
            {modal.required ? 'Reason (required)' : 'Reason (optional)'}
          </label>
          <textarea
            className="reason-textarea"
            rows="3"
            placeholder={
              modal.required
                ? `Please explain why you are ${modal.status === 'Rejected' ? 'rejecting' : 'flagging'} this invoice…`
                : 'Add an optional note for the audit trail…'
            }
            value={modal.reason}
            onChange={(e) => onChange(e.target.value)}
            autoFocus
          />
          {modal.required && !modal.reason.trim() && (
            <div className="reason-required-hint">A reason is required for this action.</div>
          )}
        </div>

        <div className="reason-modal-footer">
          <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
          <button
            className="btn btn-primary"
            style={{ background: statusColors[modal.status] }}
            disabled={modal.required && !modal.reason.trim()}
            onClick={onSubmit}
          >
            {statusLabels[modal.status]}
          </button>
        </div>
      </div>
    </div>
  );
}


/* ── Accepted file types & size limit ── */
const ACCEPTED_TYPES = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

/* ── Helper: format bytes ── */
function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/* ── Helper: file type label ── */
function fileTypeLabel(file) {
  if (!file) return '';
  if (file.type === 'application/pdf') return 'PDF';
  return 'IMAGE';
}

/* ── Helper: risk level from score ── */
function riskLevel(score) {
  if (score >= 61) return 'high';
  if (score >= 31) return 'medium';
  return 'low';
}

/* ── Helper: risk level display text ── */
function riskLevelText(level) {
  return level.charAt(0).toUpperCase() + level.slice(1) + ' Risk';
}

/* ── Helper: suggested action from risk level ── */
function suggestedAction(level) {
  if (level === 'high') return 'Flag for review';
  if (level === 'medium') return 'Review carefully before deciding';
  return 'Likely safe — verify and approve';
}


/* ================================================================
   STEPPER COMPONENT
   ================================================================ */
const STEPS = [
  { label: 'Upload File',  sub: 'Select invoice file' },
  { label: 'Review Data',  sub: 'Verify OCR results' },
  { label: 'Processing',   sub: 'Fraud analysis' },
  { label: 'Results',      sub: 'Review & decide' },
];

function Stepper({ currentPhase }) {
  return (
    <div className="stepper">
      {STEPS.map((s, i) => {
        const phase = i + 1;
        let cls = 'step';
        if (phase < currentPhase) cls += ' done';
        else if (phase === currentPhase) cls += ' active';
        else cls += ' inactive';

        // Sub text changes when done
        const subText = phase < currentPhase ? 'Completed' : s.sub;

        return (
          <div className={cls} key={i}>
            <div className="step-circle">
              {phase < currentPhase ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                phase
              )}
            </div>
            <div className="step-text">
              <span className="step-label">{s.label}</span>
              <span className="step-sub">{subText}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}


/* ================================================================
   PHASE 1 — FILE UPLOAD
   ================================================================ */
function Phase1Upload({ file, setFile, onUpload, uploading }) {
  const inputRef = useRef(null);
  const [dragover, setDragover] = useState(false);
  const [error, setError] = useState('');

  const validate = (f) => {
    if (!ACCEPTED_TYPES.includes(f.type)) {
      setError('Unsupported file type. Please upload a PDF, JPG, JPEG, or PNG file.');
      return false;
    }
    if (f.size > MAX_FILE_SIZE) {
      setError(`File exceeds 10 MB limit (${formatSize(f.size)}).`);
      return false;
    }
    setError('');
    return true;
  };

  const handleFile = (f) => {
    if (validate(f)) setFile(f);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragover(false);
    if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
  };

  return (
    <div className="upload-card">
      {/* File Selected — shown ABOVE the dropzone */}
      <div className={`file-selected${file ? ' show' : ''}`}>
        <div className="file-icon-wrap">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
        </div>
        <div className="file-info">
          <div className="file-name">{file?.name}</div>
          <div className="file-meta">
            {fileTypeLabel(file)} • {file ? formatSize(file.size) : ''} • Selected just now
          </div>
        </div>
        <button
          className="file-remove"
          title="Remove file"
          onClick={(e) => { e.stopPropagation(); setFile(null); setError(''); }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Drop Zone */}
      <div
        className={`dropzone${dragover ? ' dragover' : ''}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragover(true); }}
        onDragLeave={() => setDragover(false)}
        onDrop={handleDrop}
      >
        <div className="dropzone-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
        </div>
        <div className="dropzone-title">
          Drag & drop your invoice here, or <span>browse files</span>
        </div>
        <div className="dropzone-sub">Supported formats: PDF, JPG, JPEG, PNG — Max 10 MB</div>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png"
          style={{ display: 'none' }}
          onChange={(e) => { if (e.target.files[0]) handleFile(e.target.files[0]); }}
        />
      </div>

      {/* Error */}
      {error && (
        <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 8, background: 'var(--danger-soft)', border: '1px solid rgba(214,41,62,0.14)', fontSize: 12, color: 'var(--danger)', fontWeight: 500 }}>
          {error}
        </div>
      )}


      {/* Upload Button */}
      <div className="actions">
        <button
          className="btn btn-primary"
          disabled={!file || uploading}
          onClick={onUpload}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          {uploading ? 'Extracting…' : 'Upload & Extract'}
        </button>
      </div>
    </div>
  );
}


/* ================================================================
   PHASE 2 — REVIEW EXTRACTED DATA
   ================================================================ */
function Phase2Review({
  file, ocrData, formData, setFormData, vendors,
  onBack, onConfirm, submitting
}) {
  const [rawOpen, setRawOpen] = useState(true);

  // Track which fields were modified from OCR originals
  const isModified = (field) => {
    if (!ocrData) return false;
    const ocrVal = String(ocrData[field] ?? '');
    const formVal = String(formData[field] ?? '');
    return ocrVal !== formVal;
  };

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  // Validate: all fields must have a non-empty value
  // Use explicit checks so that amount=0 doesn't falsely fail
  const isValid = formData.vendor_id !== '' &&
                  formData.invoice_number !== '' &&
                  formData.invoice_date !== '' &&
                  formData.amount !== '' && formData.amount !== null && formData.amount !== undefined &&
                  formData.currency !== '';

  return (
    <div className="split-panel">
      {/* LEFT: File Preview */}
      <div className="preview-card">
        <div className="preview-header">
          <span className="preview-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
            Document Preview
          </span>
          <span className={`preview-badge ${fileTypeLabel(file).toLowerCase()}`}>
            {fileTypeLabel(file)}
          </span>
        </div>
        <div className="preview-body">
  {file && file.type === 'application/pdf' ? (
    <iframe
      src={URL.createObjectURL(file) + '#toolbar=0&navpanes=0&scrollbar=1'}
      title="Invoice PDF Preview"
      style={{
        width: '100%',
        height: '100%',
        minHeight: 420,
        border: 'none',
        borderRadius: 4,
        background: '#fff',
        pointerEvents: 'auto',
      }}
    />
  ) : file ? (
    <img
      src={URL.createObjectURL(file)}
      alt="Invoice preview"
      style={{
        maxWidth: '100%',
        maxHeight: 420,
        borderRadius: 8,
        objectFit: 'contain',
        userSelect: 'none',
      }}
    />
  ) : null}
</div>
        <div className="preview-filename">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          {file?.name} — {file ? formatSize(file.size) : ''}
        </div>
      </div>

      {/* RIGHT: Editable OCR Form */}
      <div className="form-card">
        <div className="form-header">
          <span className="form-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
            Extracted Invoice Data
          </span>
          <span className="ocr-badge">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            OCR Complete
          </span>
        </div>

        <div className="form-body">
          {/* OCR Suggestion Banner */}
          {ocrData?.extracted_vendor_name && (
            <div className="ocr-suggestion">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <span>
                OCR detected vendor: <strong>"{ocrData.extracted_vendor_name}"</strong> — please verify and select from the dropdown below.
              </span>
            </div>
          )}

          {/* Vendor */}
          <div className="form-group">
            <label className="form-label">
              Vendor <span className="required">*</span>
            </label>
            <select
              className="form-select"
              value={formData.vendor_id || ''}
              onChange={(e) => handleChange('vendor_id', e.target.value)}
            >
              <option value="">— Select Vendor —</option>
              {vendors.map((v) => (
                <option key={v.vendor_id} value={v.vendor_id}>
                  {v.vendor_name}
                </option>
              ))}
            </select>
            <div className="field-hint">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              Only approved & active vendors shown
            </div>
          </div>

          {/* Invoice Number */}
          <div className="form-group">
            <label className="form-label">
              Invoice Number <span className="required">*</span>
            </label>
            <input
              className="form-input"
              type="text"
              value={formData.invoice_number || ''}
              onChange={(e) => handleChange('invoice_number', e.target.value)}
            />
          </div>

          {/* Date + Amount Row */}
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">
                Invoice Date <span className="required">*</span>
              </label>
              <input
                className="form-input"
                type="date"
                value={formData.invoice_date ?? ''}
                onChange={(e) => handleChange('invoice_date', e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">
                Amount <span className="required">*</span>
              </label>
              <input
                 className="form-input"
                 type="text"
                 inputMode="decimal"
                 placeholder="e.g. 3,500.00"
                 value={formData.amount ?? ''}
                onChange={(e) => {
                const val = e.target.value;
                // Allow only digits, commas, and one decimal point
                if (val === '' || /^[\d,]*\.?\d*$/.test(val)) {
                handleChange('amount', val);
                }
                }}
              />
              {isModified('amount') && (
                <div className="field-hint modified">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                  Modified — OCR extracted: {ocrData?.amount}
                </div>
              )}
            </div>
          </div>

          {/* Currency */}
          <div className="form-group">
            <label className="form-label">
              Currency <span className="required">*</span>
            </label>
            <select
              className="form-select"
              value={formData.currency || ''}
              onChange={(e) => handleChange('currency', e.target.value)}
            >
              <option value="USD">USD — US Dollar</option>
              <option value="EUR">EUR — Euro</option>
            </select>
          </div>

          {/* Raw OCR Text */}
          {ocrData?.raw_text && (
            <div className="raw-ocr">
              <button
                className={`raw-ocr-toggle${rawOpen ? ' open' : ''}`}
                onClick={() => setRawOpen(!rawOpen)}
                type="button"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
                Raw OCR Text
              </button>
              {rawOpen && (
                <div className="raw-ocr-content">{ocrData.raw_text}</div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="form-footer">
          <button className="btn btn-ghost" onClick={onBack}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
            Back
          </button>
          <button
            className="btn btn-primary"
            disabled={!isValid || submitting}
            onClick={onConfirm}
          >
            {submitting ? 'Saving…' : 'Confirm & Save'}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
/* ================================================================
   PHASE 3 — PROCESSING
   ================================================================ */
function Phase3Processing({ invoiceNumber }) {
  const [progress, setProgress] = useState(0);
  const [steps, setSteps] = useState([
    { label: 'Invoice Record Saved',     detail: 'Status set to Pending, all fields stored', status: 'pending', time: null },
    { label: 'OCR Results Stored',        detail: 'Extracted data and raw text saved',        status: 'pending', time: null },
    { label: 'Audit Trail Entry Created', detail: 'Created → Pending logged to invoice_history', status: 'pending', time: null },
    { label: 'Running Fraud Analysis',    detail: 'Checking 12 active rules…',               status: 'pending', time: null },
    { label: 'Generating Results',        detail: 'Risk score, level, and triggered reasons', status: 'pending', time: null },
  ]);

  useEffect(() => {
    // Simulate progressive checklist completion
    const timings = [400, 800, 1000, 2500, 3500];
    const durations = ['0.4s', '0.2s', '0.1s', null, null];

    timings.forEach((t, i) => {
      setTimeout(() => {
        setSteps((prev) => prev.map((s, j) => {
          if (j < i) return { ...s, status: 'done', time: durations[j] };
          if (j === i) return { ...s, status: 'active' };
          return s;
        }));
        setProgress(Math.min(((i + 1) / timings.length) * 100, 100));
      }, t);
    });

    // Final completion
    setTimeout(() => {
      setSteps((prev) => prev.map((s, i) => ({
        ...s,
        status: 'done',
        time: durations[i] || (i === 3 ? '1.2s' : '0.3s'),
      })));
      setProgress(100);
    }, 4000);
  }, []);

  const stepIcons = {
    done: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    ),
    active: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
    pending: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="3" />
      </svg>
    ),
  };

  return (
    <div className="processing-card">
      <div className="spinner-wrap">
        <div className="spinner-ring" />
        <svg className="spinner-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      </div>

      <div className="processing-title">Analyzing Invoice…</div>
      <div className="processing-sub">
        Running fraud detection rules against {invoiceNumber || 'invoice'}
      </div>

      <div className="progress-wrap">
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${progress}%` }} />
        </div>
        <div className="progress-label">
          <span>Processing…</span>
          <span>{Math.round(progress)}%</span>
        </div>
      </div>

      <div className="checklist">
        {steps.map((s, i) => (
          <div className={`check-item${s.status === 'pending' ? ' pending-item' : ''}`} key={i}>
            <div className={`check-icon ${s.status}`}>
              {stepIcons[s.status]}
            </div>
            <div className="check-text">
              <div className="check-label">{s.label}</div>
              <div className="check-detail">{s.detail}</div>
            </div>
            <span className="check-time">{s.time || '—'}</span>
          </div>
        ))}
      </div>

      <div className="tip">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
        All invoices are saved as <strong style={{ margin: '0 3px' }}>Pending</strong> regardless of risk score. Human review is always required.
      </div>
    </div>
  );
}


/* ================================================================
   PHASE 4 — FRAUD RESULTS
   ================================================================ */
function Phase4Results({ results, formData, vendors, onAction, onUploadAnother, onViewDetail }) {
  const score = results?.risk_score ?? 0;
  const level = riskLevel(score);
  const circumference = 2 * Math.PI * 60; // r=60
  const offset = circumference - (score / 100) * circumference;

  // Find vendor name from vendor_id
  const vendorName = vendors.find((v) => String(v.vendor_id) === String(formData?.vendor_id))?.vendor_name || '—';

  const triggeredRules = results?.triggered_rules || [];

  /* Risk level icon */
  const riskIcon = level === 'low' ? (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );

  return (
    <>
      {/* Success Banner */}
      <div className="success-banner">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
        <div>
          <div className="success-banner-text">Invoice Saved Successfully</div>
          <div className="success-banner-sub">
            {formData?.invoice_number} from {vendorName} — Status: Pending — Fraud analysis complete
          </div>
        </div>
      </div>

      {/* Results Grid */}
      <div className="results-grid">
        {/* LEFT: Score Card */}
        <div className={`score-card risk-${level}`}>
          <div className="risk-ring-wrap">
            <svg viewBox="0 0 140 140">
              <circle className="ring-bg" cx="70" cy="70" r="60" />
              <circle
                className="ring-fill"
                cx="70" cy="70" r="60"
                strokeDasharray={circumference}
                strokeDashoffset={offset}
              />
            </svg>
            <div className="risk-ring-center">
              <div className="risk-score-val">{score}</div>
              <div className="risk-score-label">Risk Score</div>
            </div>
          </div>

          <div className={`risk-level-badge ${level}`}>
            {riskIcon}
            {riskLevelText(level)}
          </div>

          <div className="score-details">
            <div className="score-detail-row">
              <span className="score-detail-label">Invoice</span>
              <span className="score-detail-value">{formData?.invoice_number}</span>
            </div>
            <div className="score-detail-row">
              <span className="score-detail-label">Vendor</span>
              <span className="score-detail-value">{vendorName}</span>
            </div>
            <div className="score-detail-row">
              <span className="score-detail-label">Amount</span>
              <span className="score-detail-value">
                {formData?.currency} {Number(formData?.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <div className="score-detail-row">
              <span className="score-detail-label">Rules Triggered</span>
              <span className="score-detail-value">{triggeredRules.length} of 12</span>
            </div>
            <div className="score-detail-row">
              <span className="score-detail-label">Analyzed At</span>
              <span className="score-detail-value">
                {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}{' '}
                {new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
              </span>
            </div>
          </div>

          <div className="suggested-status">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
            <span>
              <strong>System suggestion:</strong> {suggestedAction(level)}. This is a suggestion only — final decision requires human review.
            </span>
          </div>
        </div>

        {/* RIGHT: Triggered Rules */}
        <div className="rules-card">
          <div className="rules-header">
            <span className="rules-title">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              Triggered Fraud Rules
            </span>
            <span className="rules-count">{triggeredRules.length} Rule{triggeredRules.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="rules-body">
            {triggeredRules.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--green)' }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginBottom: 8 }}>
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
                <div style={{ fontSize: 13, fontWeight: 600 }}>No fraud indicators detected</div>
              </div>
            ) : (
              triggeredRules.map((rule, i) => (
                <div className="rule-item" key={i}>
                  <div className="rule-top">
                    <span className="rule-name">{rule.rule_name}</span>
                    <span className="rule-weight">+{rule.risk_weight} pts</span>
                  </div>
                  <div className="rule-reason">{rule.reason_text}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="actions-card">
        <div className="actions-label">Take Action</div>

        <div className="actions-row">
          <button className="btn-sm btn-approve" onClick={() => onAction('Approved')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span className="btn-label">Approve</span>
          </button>
          <button className="btn-sm btn-reject" onClick={() => onAction('Rejected')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
            <span className="btn-label">Reject</span>
          </button>
          <button className="btn-sm btn-pending" onClick={() => onAction('Pending')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span className="btn-label">Leave Pending</span>
          </button>
          <button className="btn-sm btn-flag" onClick={() => onAction('Flagged')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
              <line x1="4" y1="22" x2="4" y2="15" />
            </svg>
            <span className="btn-label">Flag</span>
          </button>
        </div>

        <div className="actions-secondary">
          <button className="btn-sm btn-outline" onClick={onViewDetail}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
            <span className="btn-label">View Invoice Detail</span>
          </button>
          <button className="btn-sm btn-outline-accent" onClick={onUploadAnother}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <span className="btn-label">Upload Another Invoice</span>
          </button>
        </div>

        <div className="design-note">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          <span>
            Approve and Leave Pending have an optional reason field. Reject and Flag require a mandatory reason.
            You can also navigate to Invoice Detail for a deeper review before deciding.
          </span>
        </div>
      </div>
    </>
  );
}


/* ================================================================
   MAIN PAGE COMPONENT
   ================================================================ */
export default function UploadInvoicePage() {
  const navigate = useNavigate();

  /* ── State ── */
  const [phase, setPhase] = useState(1);
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Vendor list (approved & active)
  const [vendors, setVendors] = useState([]);

  // OCR raw result (from Python microservice)
  const [ocrData, setOcrData] = useState(null);

  // Editable form fields (pre-filled from OCR)
  const [formData, setFormData] = useState({
    vendor_id: '',
    invoice_number: '',
    invoice_date: '',
    amount: '',
    currency: 'USD',
  });

  // Fraud analysis results
  const [fraudResults, setFraudResults] = useState(null);

  // Saved invoice ID (returned after saving)
  const [savedInvoiceId, setSavedInvoiceId] = useState(null);

  // Toast notification state
  const [toast, setToast] = useState(null);
  const showToast = (type, title, message) => {
    setToast({ type, title, message });
  };

  /* ── Fetch approved vendors on mount ── */
  useEffect(() => {
    const token = localStorage.getItem('token');
    fetch(`${API}/vendors?approved=true&active=true`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setVendors(data);
        else if (data.vendors) setVendors(data.vendors);
      })
      .catch((err) => console.error('Failed to fetch vendors:', err));
  }, []);

  /* ── Page subtitle per phase ── */
  const subtitles = [
    'Upload a new invoice for OCR extraction and fraud analysis',
    'Review and verify the extracted invoice data before submission',
    'Saving invoice and running fraud analysis…',
    'Fraud analysis complete — review results and take action',
  ];

  /* ── Phase 1 → 2: Upload file & run OCR ── */
  const handleUploadAndExtract = async () => {
    if (!file) return;
    setUploading(true);

    try {
      const token = localStorage.getItem('token');
      const fd = new FormData();
      fd.append('invoice_file', file);

      const res = await fetch(`${API}/ocr/extract`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });

      if (!res.ok) throw new Error('OCR extraction failed');

      const data = await res.json();

      // DEBUG — check browser console (F12) to see what backend sends
      console.log('OCR response:', {
        extracted_amount: data.extracted_amount,
        amount_display: data.amount_display,
        type_amount: typeof data.extracted_amount,
        type_display: typeof data.amount_display,
      });

      // Store raw OCR data (keep original display string for reference)
      setOcrData({
        extracted_vendor_name: data.extracted_vendor_name || '',
        invoice_number: data.extracted_invoice_number || '',
        invoice_date: data.extracted_invoice_date || '',
        amount: data.amount_display || (data.extracted_amount != null ? String(data.extracted_amount) : ''),
        currency: data.extracted_currency || 'USD',
        raw_text: data.raw_text || '',
      });

      // Pre-fill form with OCR values
      // Try to match vendor name to a vendor_id
      const matchedVendor = vendors.find(
        (v) => v.vendor_name.toLowerCase() === (data.extracted_vendor_name || '').toLowerCase()
      );

      setFormData({
        vendor_id: matchedVendor ? String(matchedVendor.vendor_id) : '',
        invoice_number: data.extracted_invoice_number || '',
        invoice_date: data.extracted_invoice_date || '',
        amount: data.amount_display || (data.extracted_amount != null ? String(data.extracted_amount) : ''),
        currency: data.extracted_currency || 'USD',
      });

      setPhase(2);
    } catch (err) {
      console.error('Upload/OCR error:', err);
      showToast('error', 'OCR Extraction Failed', 'Failed to extract data from the invoice. Please check the file and try again.');
    } finally {
      setUploading(false);
    }
  };

  /* ── Phase 2 → 3 → 4: Confirm & Save → Process → Results ── */
  const handleConfirmAndSave = async () => {
    setSubmitting(true);
    setPhase(3); // Show processing animation immediately

    try {
      const token = localStorage.getItem('token');

      // Check if any field was modified
      const wasCorrected =
        String(formData.amount) !== String(ocrData?.amount) ||
        formData.invoice_number !== ocrData?.invoice_number ||
        formData.invoice_date !== ocrData?.invoice_date ||
        formData.currency !== ocrData?.currency;

      const fd = new FormData();
      fd.append('invoice_file', file);
      fd.append('vendor_id', formData.vendor_id);
      fd.append('invoice_number', formData.invoice_number);
      fd.append('invoice_date', formData.invoice_date);
      fd.append('amount', String(formData.amount).replace(/,/g, ''));
      fd.append('currency', formData.currency);
      fd.append('was_corrected_at_review', wasCorrected);

      // Include OCR data for storage
      if (ocrData) {
        fd.append('extracted_vendor_name', ocrData.extracted_vendor_name);
        fd.append('extracted_invoice_number', ocrData.invoice_number);
        fd.append('extracted_invoice_date', ocrData.invoice_date);
        fd.append('extracted_amount', String(ocrData.amount).replace(/,/g, ''));
        fd.append('extracted_currency', ocrData.currency);
        fd.append('raw_text', ocrData.raw_text);
      }

      const res = await fetch(`${API}/invoices/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });

      // Read the response body BEFORE checking res.ok
      const data = await res.json();

      if (!res.ok) {
        // Show specific error from backend
        if (res.status === 409) {
          // Duplicate invoice — vendor_id + invoice_number unique constraint
          throw {
            isDuplicate: true,
            message: `An invoice with number "${formData.invoice_number}" already exists for this vendor.`,
          };
        } else if (res.status === 400) {
          throw { message: data.message || 'Validation error — please check all fields are filled correctly.' };
        } else {
          throw { message: data.message || 'Failed to save invoice.' };
        }
      }

      setSavedInvoiceId(data.invoice_id);
      setFraudResults({
        risk_score: data.risk_score ?? 0,
        risk_level: data.risk_level || riskLevel(data.risk_score ?? 0),
        triggered_rules: data.triggered_rules || [],
      });

      // Wait for processing animation to finish (~4s), then show results
      setTimeout(() => {
        setPhase(4);
        setSubmitting(false);
      }, 4200);
    } catch (err) {
      console.error('Save error:', err);
      const errorMsg = err.message || 'Failed to save invoice. Please try again.';
      showToast('error', 'Invoice Save Failed', errorMsg);
      setPhase(2); // Go back to review
      setSubmitting(false);
    }
  };

  /* ── Phase 4 action: update invoice status ── */
  const [reasonModal, setReasonModal] = useState(null); // { status, required }

  const handleAction = (newStatus) => {
    if (!savedInvoiceId) return;

    // If invoice is already Pending and user clicks Leave Pending, no change needed
    // Open the reason modal for all actions
    const requiresReason = newStatus === 'Rejected' || newStatus === 'Flagged';
    setReasonModal({ status: newStatus, required: requiresReason, reason: '' });
  };

  const handleReasonSubmit = async () => {
    const { status: newStatus, required, reason } = reasonModal;

    if (required && !reason.trim()) return; // Don't close if reason is required but empty

    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API}/invoices/${savedInvoiceId}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          new_status: newStatus,
          reason: reason.trim() || null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        showToast('error', 'Action Failed', data.message || 'Failed to update invoice status.');
        setReasonModal(null);
        return;
      }

      // Show success toast based on the action taken
      const toastMessages = {
        Approved: { title: 'Invoice Approved', msg: `Invoice ${formData.invoice_number} has been approved successfully.` },
        Rejected: { title: 'Invoice Rejected', msg: `Invoice ${formData.invoice_number} has been rejected.` },
        Flagged:  { title: 'Invoice Flagged', msg: `Invoice ${formData.invoice_number} has been flagged for further review.` },
        Pending:  { title: 'Status Unchanged', msg: `Invoice ${formData.invoice_number} remains pending for review.` },
      };

      const t = toastMessages[newStatus];
      showToast('success', t.title, t.msg);
      setReasonModal(null);
    } catch (err) {
      console.error('Status update error:', err);
      showToast('error', 'Action Failed', 'Failed to update invoice status. Please try again.');
      setReasonModal(null);
    }
  };

  /* ── Reset for "Upload Another" ── */
  const handleUploadAnother = () => {
    setPhase(1);
    setFile(null);
    setOcrData(null);
    setFormData({ vendor_id: '', invoice_number: '', invoice_date: '', amount: '', currency: 'USD' });
    setFraudResults(null);
    setSavedInvoiceId(null);
  };

  /* ── Navigate to Invoice Detail ── */
  const handleViewDetail = () => {
    if (savedInvoiceId) {
      navigate(`/invoices/${savedInvoiceId}`);
    }
  };

  return (
    <AppLayout>
      <div className="upload-page">
        {/* Toast Notification */}
        <Toast toast={toast} onClose={() => setToast(null)} />

        {/* Reason Modal */}
        <ReasonModal
          modal={reasonModal}
          onChange={(val) => setReasonModal((prev) => ({ ...prev, reason: val }))}
          onSubmit={handleReasonSubmit}
          onCancel={() => setReasonModal(null)}
        />
        {/* Page Header */}
        <div className="page-header">
          <div>
            <h1>Upload Invoice</h1>
            <p>{subtitles[phase - 1]}</p>
          </div>
        </div>

        {/* Stepper */}
        <Stepper currentPhase={phase} />

        {/* Phase Content */}
        {phase === 1 && (
          <Phase1Upload
            file={file}
            setFile={setFile}
            onUpload={handleUploadAndExtract}
            uploading={uploading}
          />
        )}

        {phase === 2 && (
          <Phase2Review
            file={file}
            ocrData={ocrData}
            formData={formData}
            setFormData={setFormData}
            vendors={vendors}
            onBack={() => setPhase(1)}
            onConfirm={handleConfirmAndSave}
            submitting={submitting}
          />
        )}

        {phase === 3 && (
          <Phase3Processing invoiceNumber={formData.invoice_number} />
        )}

        {phase === 4 && (
          <Phase4Results
            results={fraudResults}
            formData={formData}
            vendors={vendors}
            onAction={handleAction}
            onUploadAnother={handleUploadAnother}
            onViewDetail={handleViewDetail}
          />
        )}
      </div>
    </AppLayout>
  );
}