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
                onChange={(e) => handleChange('amount', e.target.value)}
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

```jsx
// ── Phase 3, Phase 4, and main component will be added in next commit ──
export default function UploadInvoicePage() {
  return <div>Upload Invoice — Phases 3 and 4 coming next</div>;
}
```