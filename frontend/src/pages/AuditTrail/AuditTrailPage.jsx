// ============================================================
// pages/AuditTrail/AuditTrailPage.jsx
// Global Audit Trail — invoice history + fraud rule history.
//
// Access: Admin, Viewer (Accountant has no access).
// Wraps in AppLayout (shared sidebar).
//
// Talks to:
//   GET /api/audit/stats
//   GET /api/audit/users
//   GET /api/audit/invoice-history
//   GET /api/audit/rule-history
// ============================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import AppLayout from '../../components/Layout/AppLayout';
import './AuditTrailPage.css';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

/* ── Helpers ─────────────────────────────────────────────── */
function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

/* ── Action badge component ──────────────────────────────── */
function ActionBadge({ action }) {
  const cls = (action || '').toLowerCase();
  const icons = {
    approved: '✓',
    rejected: '✕',
    flagged:  '⚑',
    created:  '+',
    updated:  '✎',
    enabled:  '◉',
    disabled: '○',
  };

  return (
    <span className={`audit-badge audit-badge-${cls}`}>
      <span className="audit-badge-icon">{icons[cls] || '•'}</span>
      {action}
    </span>
  );
}

/* ── Change + reason cell ────────────────────────────────── */
function ChangeCell({ children, reason }) {
  const cleanReason = (reason || '').trim();

  return (
    <div className="audit-change-cell">
      {children}
      {cleanReason && (
        <div className="audit-reason-text" title={cleanReason}>
          <span className="audit-reason-label">Reason:</span> {cleanReason}
        </div>
      )}
    </div>
  );
}

/* ── Build human-readable "change" text ──────────────────── */
function buildInvoiceChange(row) {
  if (row.action_type === 'Created') {
    return (
      <span className="audit-change-text">
        Invoice uploaded{row.vendor_name ? ` for ${row.vendor_name}` : ''}
      </span>
    );
  }

  if (row.action_type === 'Updated') {
    if (row.old_status || row.new_status) {
      return (
        <span className="audit-change-text">
          <span className="audit-status-old">{row.old_status || '—'}</span>
          <span className="audit-arrow"> to </span>
          <strong>{row.new_status || '—'}</strong>
        </span>
      );
    }

    return <span className="audit-change-text">Invoice updated</span>;
  }

  return (
    <span className="audit-change-text">
      <span className="audit-status-old">{row.old_status || '—'}</span>
      <span className="audit-arrow"> to </span>
      <strong>{row.new_status}</strong>
    </span>
  );
}

function buildRuleChange(row) {
  if (row.action_type === 'Enabled' || row.action_type === 'Disabled') {
    return (
      <span className="audit-change-text">
        <span className="audit-status-old">{row.old_value || '—'}</span>
        <span className="audit-arrow"> to </span>
        <strong>{row.new_value || row.action_type}</strong>
      </span>
    );
  }

  if (row.field_name && row.old_value !== null && row.new_value !== null) {
    return (
      <span className="audit-change-text">
        {row.field_name} changed from <strong>{row.old_value}</strong> to <strong>{row.new_value}</strong>
      </span>
    );
  }

  return <span className="audit-change-text">Rule updated</span>;
}

/* ── Pagination control ──────────────────────────────────── */
function Pagination({ page, totalPages, onPageChange, totalCount, startRow, endRow, label, rowsPerPage, onRowsChange }) {
  const pageNumbers = useMemo(() => {
    const nums = [];
    const maxButtons = 3;
    let start = Math.max(1, page - 1);
    let end = Math.min(totalPages, start + maxButtons - 1);
    if (end - start + 1 < maxButtons) start = Math.max(1, end - maxButtons + 1);
    for (let i = start; i <= end; i++) nums.push(i);
    return nums;
  }, [page, totalPages]);

  return (
    <div className="audit-pagination">
      <div className="audit-pagination-info">
        Showing <strong>{startRow}-{endRow}</strong> of <strong>{totalCount}</strong> {label}
        <div className="audit-rows-select">
          <select value={rowsPerPage} onChange={e => onRowsChange(Number(e.target.value))}>
            <option value={10}>10 rows</option>
            <option value={25}>25 rows</option>
            <option value={50}>50 rows</option>
          </select>
        </div>
      </div>

      <div className="audit-pagination-controls">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page === 1}
          className="audit-page-btn"
        >
          ‹
        </button>

        {pageNumbers.map(n => (
          <button
            key={n}
            onClick={() => onPageChange(n)}
            className={`audit-page-btn ${n === page ? 'active' : ''}`}
          >
            {n}
          </button>
        ))}

        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="audit-page-btn"
        >
          ›
        </button>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ════════════════════════════════════════════════════════════ */
export default function AuditTrailPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('invoice');

  const [stats, setStats] = useState({ events_today: 0, status_changes: 0 });
  const [users, setUsers] = useState([]);

  const [invSearch, setInvSearch] = useState('');
  const [invAction, setInvAction] = useState('');
  const [invUserId, setInvUserId] = useState('');
  const [invDateFrom, setInvDateFrom] = useState('');
  const [invEvents, setInvEvents] = useState([]);
  const [invTotal, setInvTotal] = useState(0);
  const [invPage, setInvPage] = useState(1);
  const [invRowsPerPage, setInvRowsPerPage] = useState(10);
  const [invLoading, setInvLoading] = useState(true);
  const [invError, setInvError] = useState('');

  const [ruleSearch, setRuleSearch] = useState('');
  const [ruleAction, setRuleAction] = useState('');
  const [ruleRuleId, setRuleRuleId] = useState('');
  const [ruleDateFrom, setRuleDateFrom] = useState('');
  const [ruleEvents, setRuleEvents] = useState([]);
  const [ruleList, setRuleList] = useState([]);
  const [ruleTotal, setRuleTotal] = useState(0);
  const [rulePage, setRulePage] = useState(1);
  const [ruleRowsPerPage, setRuleRowsPerPage] = useState(10);
  const [ruleLoading, setRuleLoading] = useState(true);
  const [ruleError, setRuleError] = useState('');

  const [debInvSearch, setDebInvSearch] = useState('');
  const [debRuleSearch, setDebRuleSearch] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebInvSearch(invSearch), 350);
    return () => clearTimeout(t);
  }, [invSearch]);

  useEffect(() => {
    const t = setTimeout(() => setDebRuleSearch(ruleSearch), 350);
    return () => clearTimeout(t);
  }, [ruleSearch]);

  useEffect(() => {
    setInvPage(1);
  }, [debInvSearch, invAction, invUserId, invDateFrom, invRowsPerPage]);

  useEffect(() => {
    setRulePage(1);
  }, [debRuleSearch, ruleAction, ruleRuleId, ruleDateFrom, ruleRowsPerPage]);

  useEffect(() => {
    const token = localStorage.getItem('token');

    fetch(`${API}/audit/stats`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => setStats({ events_today: d.events_today || 0, status_changes: d.status_changes || 0 }))
      .catch(err => console.error('Stats fetch failed:', err));

    fetch(`${API}/audit/users`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => setUsers(d.users || []))
      .catch(err => console.error('Users fetch failed:', err));
  }, []);

  const fetchInvoiceHistory = useCallback(async () => {
    setInvLoading(true);
    setInvError('');

    try {
      const params = new URLSearchParams();
      if (debInvSearch) params.append('search', debInvSearch);
      if (invAction) params.append('action', invAction);
      if (invUserId) params.append('user_id', invUserId);
      if (invDateFrom) params.append('date_from', invDateFrom);
      params.append('page', invPage);
      params.append('limit', invRowsPerPage);

      const token = localStorage.getItem('token');
      const res = await fetch(`${API}/audit/invoice-history?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error(`Server returned ${res.status}`);

      const data = await res.json();
      setInvEvents(data.events || []);
      setInvTotal(data.total || 0);
    } catch (err) {
      console.error('Invoice history fetch failed:', err);
      setInvError('Could not load invoice history.');
      setInvEvents([]);
      setInvTotal(0);
    } finally {
      setInvLoading(false);
    }
  }, [debInvSearch, invAction, invUserId, invDateFrom, invPage, invRowsPerPage]);

  const fetchRuleHistory = useCallback(async () => {
    setRuleLoading(true);
    setRuleError('');

    try {
      const params = new URLSearchParams();
      if (debRuleSearch) params.append('search', debRuleSearch);
      if (ruleAction) params.append('action', ruleAction);
      if (ruleRuleId) params.append('rule_id', ruleRuleId);
      if (ruleDateFrom) params.append('date_from', ruleDateFrom);
      params.append('page', rulePage);
      params.append('limit', ruleRowsPerPage);

      const token = localStorage.getItem('token');
      const res = await fetch(`${API}/audit/rule-history?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error(`Server returned ${res.status}`);

      const data = await res.json();
      setRuleEvents(data.events || []);
      setRuleList(data.rules || []);
      setRuleTotal(data.total || 0);
    } catch (err) {
      console.error('Rule history fetch failed:', err);
      setRuleError('Could not load rule history.');
      setRuleEvents([]);
      setRuleTotal(0);
    } finally {
      setRuleLoading(false);
    }
  }, [debRuleSearch, ruleAction, ruleRuleId, ruleDateFrom, rulePage, ruleRowsPerPage]);

  useEffect(() => {
    fetchInvoiceHistory();
  }, [fetchInvoiceHistory]);

  useEffect(() => {
    fetchRuleHistory();
  }, [fetchRuleHistory]);

  const clearInvoiceFilters = () => {
    setInvSearch('');
    setInvAction('');
    setInvUserId('');
    setInvDateFrom('');
  };

  const clearRuleFilters = () => {
    setRuleSearch('');
    setRuleAction('');
    setRuleRuleId('');
    setRuleDateFrom('');
  };

  const csvCell = value => `"${String(value ?? '').replace(/"/g, '""')}"`;

  const exportCsv = (which) => {
    const rows = which === 'invoice' ? invEvents : ruleEvents;

    if (rows.length === 0) {
      alert('Nothing to export — table is empty.');
      return;
    }

    let csv = '';

    if (which === 'invoice') {
      csv = 'Timestamp,Action,Invoice Number,Vendor,Old Status,New Status,Reason,Changed By,Role\n';
      rows.forEach(r => {
        csv += [
          r.changed_at,
          r.action_type,
          r.invoice_number,
          r.vendor_name || '',
          r.old_status || '',
          r.new_status || '',
          r.reason || '',
          r.changed_by_name || '',
          r.changed_by_role || '',
        ].map(csvCell).join(',') + '\n';
      });
    } else {
      csv = 'Timestamp,Action,Rule Name,Field,Old Value,New Value,Reason,Changed By,Role\n';
      rows.forEach(r => {
        csv += [
          r.changed_at,
          r.action_type,
          r.rule_name,
          r.field_name || '',
          r.old_value || '',
          r.new_value || '',
          r.reason || '',
          r.changed_by_name || '',
          r.changed_by_role || '',
        ].map(csvCell).join(',') + '\n';
      });
    }

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = `audit_${which}_history_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();

    URL.revokeObjectURL(url);
  };

  const invTotalPages = Math.max(1, Math.ceil(invTotal / invRowsPerPage));
  const invStart = invTotal === 0 ? 0 : (invPage - 1) * invRowsPerPage + 1;
  const invEnd = Math.min(invPage * invRowsPerPage, invTotal);

  const ruleTotalPages = Math.max(1, Math.ceil(ruleTotal / ruleRowsPerPage));
  const ruleStart = ruleTotal === 0 ? 0 : (rulePage - 1) * ruleRowsPerPage + 1;
  const ruleEnd = Math.min(rulePage * ruleRowsPerPage, ruleTotal);

  return (
    <AppLayout>
      <div className="audit-page">
        <h1 className="audit-title">Audit Trail</h1>
        <p className="audit-subtitle">
          Review invoice status changes and fraud rule updates across InvoiceShield.
        </p>

        <div className="audit-tabs">
          <button
            className={`audit-tab ${activeTab === 'invoice' ? 'active' : ''}`}
            onClick={() => setActiveTab('invoice')}
          >
            Invoice History
          </button>

          <button
            className={`audit-tab ${activeTab === 'rule' ? 'active' : ''}`}
            onClick={() => setActiveTab('rule')}
          >
            Fraud Rule History
          </button>
        </div>

        {activeTab === 'invoice' && (
          <div className="audit-stats">
            <div className="audit-stat-pill">
              Events today <span className="audit-stat-num">{stats.events_today}</span>
            </div>
            <div className="audit-stat-pill">
              Status changes <span className="audit-stat-num">{stats.status_changes}</span>
            </div>
          </div>
        )}

        {activeTab === 'invoice' && (
          <>
            <div className="audit-filters">
              <div className="audit-search">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="7" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="text"
                  placeholder="Search by invoice..."
                  value={invSearch}
                  onChange={e => setInvSearch(e.target.value)}
                />
              </div>

              <div className="audit-select">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                </svg>
                <select value={invAction} onChange={e => setInvAction(e.target.value)}>
                  <option value="">Action Type</option>
                  <option value="Created">Created</option>
                  <option value="Approved">Approved</option>
                  <option value="Rejected">Rejected</option>
                  <option value="Flagged">Flagged</option>
                  <option value="Updated">Updated</option>
                </select>
              </div>

              <div className="audit-select">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" />
                </svg>
                <select value={invUserId} onChange={e => setInvUserId(e.target.value)}>
                  <option value="">User</option>
                  {users.map(u => (
                    <option key={u.user_id} value={u.user_id}>
                      {u.full_name} ({u.role_name})
                    </option>
                  ))}
                </select>
              </div>

              <input
                type="date"
                className="audit-date"
                value={invDateFrom}
                onChange={e => setInvDateFrom(e.target.value)}
              />

              <button className="audit-clear-btn" onClick={clearInvoiceFilters}>
                <span>✕</span> Clear Filters
              </button>

              <button className="audit-export-btn" onClick={() => exportCsv('invoice')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Export CSV
              </button>
            </div>

            <div className="audit-table-wrap">
              <table className="audit-table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Action</th>
                    <th>Invoice</th>
                    <th>Change</th>
                    <th>By</th>
                  </tr>
                </thead>
                <tbody>
                  {invLoading && (
                    <tr><td colSpan={5} className="audit-empty">Loading…</td></tr>
                  )}

                  {!invLoading && invError && (
                    <tr><td colSpan={5} className="audit-empty audit-empty-error">{invError}</td></tr>
                  )}

                  {!invLoading && !invError && invEvents.length === 0 && (
                    <tr><td colSpan={5} className="audit-empty">No invoice events match your filters.</td></tr>
                  )}

                  {!invLoading && !invError && invEvents.map(row => (
                    <tr key={row.history_id}>
                      <td data-label="Timestamp">
                        <div className="audit-date-main">{formatDate(row.changed_at)}</div>
                        <div className="audit-date-sub">{formatTime(row.changed_at)}</div>
                      </td>
                      <td data-label="Action">
                        <ActionBadge action={row.action_type} />
                      </td>
                      <td data-label="Invoice">
                        <button
                          className="audit-invoice-link"
                          onClick={() => navigate(`/invoices/${row.invoice_id}`)}
                        >
                          {row.invoice_number}
                        </button>
                      </td>
                      <td data-label="Change">
                        <ChangeCell reason={row.reason}>
                          {buildInvoiceChange(row)}
                        </ChangeCell>
                      </td>
                      <td data-label="By">
                        <div className="audit-user-name">{row.changed_by_name || '—'}</div>
                        <div className="audit-user-role">{row.changed_by_role || ''}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Pagination
              page={invPage}
              totalPages={invTotalPages}
              onPageChange={setInvPage}
              totalCount={invTotal}
              startRow={invStart}
              endRow={invEnd}
              label="invoice events"
              rowsPerPage={invRowsPerPage}
              onRowsChange={setInvRowsPerPage}
            />
          </>
        )}

        {activeTab === 'rule' && (
          <>
            <div className="audit-filters">
              <div className="audit-search">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="7" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="text"
                  placeholder="Search by admin name..."
                  value={ruleSearch}
                  onChange={e => setRuleSearch(e.target.value)}
                />
              </div>

              <div className="audit-select">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                </svg>
                <select value={ruleAction} onChange={e => setRuleAction(e.target.value)}>
                  <option value="">Action Type</option>
                  <option value="Enabled">Enabled</option>
                  <option value="Disabled">Disabled</option>
                  <option value="Updated">Updated</option>
                </select>
              </div>

              <div className="audit-select">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 12l2 2 4-4" /><path d="M21 12c0 4.97-4.03 9-9 9s-9-4.03-9-9 4.03-9 9-9 9 4.03 9 9z" />
                </svg>
                <select value={ruleRuleId} onChange={e => setRuleRuleId(e.target.value)}>
                  <option value="">Rule</option>
                  {ruleList.map(r => (
                    <option key={r.rule_id} value={r.rule_id}>{r.rule_name}</option>
                  ))}
                </select>
              </div>

              <input
                type="date"
                className="audit-date"
                value={ruleDateFrom}
                onChange={e => setRuleDateFrom(e.target.value)}
              />

              <button className="audit-clear-btn" onClick={clearRuleFilters}>
                <span>✕</span> Clear Filters
              </button>

              <button className="audit-export-btn" onClick={() => exportCsv('rule')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Export CSV
              </button>
            </div>

            <div className="audit-table-wrap">
              <table className="audit-table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Action</th>
                    <th>Rule</th>
                    <th>Change</th>
                    <th>By</th>
                  </tr>
                </thead>
                <tbody>
                  {ruleLoading && (
                    <tr><td colSpan={5} className="audit-empty">Loading…</td></tr>
                  )}

                  {!ruleLoading && ruleError && (
                    <tr><td colSpan={5} className="audit-empty audit-empty-error">{ruleError}</td></tr>
                  )}

                  {!ruleLoading && !ruleError && ruleEvents.length === 0 && (
                    <tr><td colSpan={5} className="audit-empty">No rule events match your filters.</td></tr>
                  )}

                  {!ruleLoading && !ruleError && ruleEvents.map(row => (
                    <tr key={row.history_id}>
                      <td data-label="Timestamp">
                        <div className="audit-date-main">{formatDate(row.changed_at)}</div>
                        <div className="audit-date-sub">{formatTime(row.changed_at)}</div>
                      </td>
                      <td data-label="Action">
                        <ActionBadge action={row.action_type} />
                      </td>
                      <td className="audit-rule-name" data-label="Rule">
                        {row.rule_name}
                      </td>
                      <td data-label="Change">
                        <ChangeCell reason={row.reason}>
                          {buildRuleChange(row)}
                        </ChangeCell>
                      </td>
                      <td data-label="By">
                        <div className="audit-user-name">{row.changed_by_name || '—'}</div>
                        <div className="audit-user-role">{row.changed_by_role || ''}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Pagination
              page={rulePage}
              totalPages={ruleTotalPages}
              onPageChange={setRulePage}
              totalCount={ruleTotal}
              startRow={ruleStart}
              endRow={ruleEnd}
              label="rule events"
              rowsPerPage={ruleRowsPerPage}
              onRowsChange={setRuleRowsPerPage}
            />
          </>
        )}
      </div>
    </AppLayout>
  );
}
