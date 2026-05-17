// ============================================================
// pages/SystemConfig/FraudRulesPage.jsx
//
// System Configuration -> Fraud Rules page.
// Preferences-inspired layout with:
//   - Search by name or description
//   - Filter by status and risk weight
//   - Compact ON/OFF rule controls
//   - History drawer per rule
//   - Pagination
//
// Access: Admin can toggle rules; Accountant/Auditor read-only.
// ============================================================

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import AppLayout from '../../components/Layout/AppLayout';
import './FraudRulesPage.css';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

/* Helpers */
function formatDate(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d)) return '-';
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function getToken() {
  return localStorage.getItem('token') || '';
}

function getUserRole() {
  try {
    const raw = localStorage.getItem('user');
    if (!raw) return '';
    return JSON.parse(raw).role_name || '';
  } catch {
    return '';
  }
}

function weightTier(weight) {
  if (weight >= 41) return 'high';
  if (weight >= 16) return 'medium';
  return 'low';
}

function WeightBadge({ weight }) {
  const tier = weightTier(weight);

  return (
    <span className={`fr-weight-badge fr-weight-${tier}`}>
      {weight}
    </span>
  );
}

function PreferenceSwitch({ active, disabled = false, loading = false, onClick }) {
  return (
    <button
      type="button"
      className={`fr-pref-switch ${active ? 'is-on' : 'is-off'}`}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
    >
      <span className="fr-pref-switch-label">
        {loading ? '...' : active ? 'ON' : 'OFF'}
      </span>
      <span className="fr-pref-switch-track" />
    </button>
  );
}

/* History Drawer */
function HistoryDrawer({ rule, onClose }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const drawerRef = useRef(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${API}/fraud-rules/${rule.rule_id}/history`, {
          headers: { Authorization: `Bearer ${getToken()}` },
        });

        if (!res.ok) throw new Error();

        const data = await res.json();
        setHistory(data.history || []);
      } catch {
        setError('Could not load history.');
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [rule.rule_id]);

  useEffect(() => {
    function handleClick(event) {
      if (drawerRef.current && !drawerRef.current.contains(event.target)) {
        onClose();
      }
    }

    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  const actionLabel = {
    enabled: { text: 'Enabled', cls: 'hist-enabled' },
    disabled: { text: 'Disabled', cls: 'hist-disabled' },
    weight_changed: { text: 'Weight changed', cls: 'hist-weight' },
    created: { text: 'Created', cls: 'hist-created' },
  };

  return (
    <div className="fr-drawer-overlay">
      <aside className="fr-drawer" ref={drawerRef}>
        <div className="fr-drawer-header">
          <div>
            <p className="fr-drawer-label">Change History</p>
            <h3 className="fr-drawer-title">{rule.rule_name}</h3>
          </div>

          <button
            className="fr-drawer-close"
            onClick={onClose}
            aria-label="Close history"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="fr-drawer-body">
          {loading && <p className="fr-drawer-empty">Loading...</p>}
          {error && <p className="fr-drawer-empty fr-drawer-err">{error}</p>}

          {!loading && !error && history.length === 0 && (
            <p className="fr-drawer-empty">No changes recorded yet.</p>
          )}

          {!loading && !error && history.map((item) => {
            const { text, cls } = actionLabel[item.action] || {
              text: item.action,
              cls: 'hist-other',
            };

            return (
              <div key={item.history_id} className="fr-hist-row">
                <div className="fr-hist-timeline">
                  <span className={`fr-hist-dot ${cls}`} />
                  <span className="fr-hist-line" />
                </div>

                <div className="fr-hist-content">
                  <div className="fr-hist-top">
                    <span className={`fr-hist-action ${cls}`}>{text}</span>
                    <span className="fr-hist-date">{formatDate(item.changed_at)}</span>
                  </div>

                  {item.action === 'weight_changed' && (
                    <p className="fr-hist-detail">
                      Weight: <strong>{item.old_value}</strong> to <strong>{item.new_value}</strong>
                    </p>
                  )}

                  {item.change_reason && (
                    <p className="fr-hist-reason">{item.change_reason}</p>
                  )}

                  <p className="fr-hist-by">By {item.changed_by_name || 'System'}</p>
                </div>
              </div>
            );
          })}
        </div>
      </aside>
    </div>
  );
}

/* Main Page */
export default function FraudRulesPage() {
  const navigate = useNavigate();
  const role = getUserRole();
  const isAdmin = role === 'Admin';

  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [weightF, setWeightF] = useState('');

  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const [toggling, setToggling] = useState(null);
  const [historyRule, setHistoryRule] = useState(null);
  const [toast, setToast] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const params = new URLSearchParams();

      if (search.trim()) params.set('search', search.trim());
      if (status) params.set('status', status);
      if (weightF) params.set('weight', weightF);

      const res = await fetch(`${API}/fraud-rules?${params}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });

      if (res.status === 401) {
        navigate('/');
        return;
      }

      if (!res.ok) throw new Error();

      const data = await res.json();
      setRules(data.rules || []);
      setPage(1);
    } catch {
      setError('Failed to load fraud rules. Check your connection.');
    } finally {
      setLoading(false);
    }
  }, [search, status, weightF, navigate]);

  useEffect(() => {
    load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(rules.length / rowsPerPage));

  const visible = useMemo(() => {
    const start = (page - 1) * rowsPerPage;
    return rules.slice(start, start + rowsPerPage);
  }, [rules, page, rowsPerPage]);

  async function handleToggle(rule) {
    if (!isAdmin || toggling) return;

    setToggling(rule.rule_id);

    try {
      const res = await fetch(`${API}/fraud-rules/${rule.rule_id}/toggle`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ is_active: !rule.is_active }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Toggle failed.');
      }

      setRules((prev) =>
        prev.map((item) =>
          item.rule_id === rule.rule_id
            ? { ...item, is_active: !item.is_active }
            : item
        )
      );

      showToast(data.message || 'Rule updated.');
    } catch (err) {
      showToast(err.message || 'Could not toggle rule.', true);
    } finally {
      setToggling(null);
    }
  }

  const toastTimer = useRef(null);

  function showToast(message, isError = false) {
    setToast({ message, isError });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 3500);
  }

  const hasFilters = search || status || weightF;

  function clearFilters() {
    setSearch('');
    setStatus('');
    setWeightF('');
  }

  const enabledCount = rules.filter((rule) => rule.is_active).length;
  const disabledCount = rules.length - enabledCount;

  const startRow = rules.length === 0 ? 0 : (page - 1) * rowsPerPage + 1;
  const endRow = Math.min(page * rowsPerPage, rules.length);

  return (
    <AppLayout>
      <div className="fr-page">
        <div className="fr-page-header">
          <h1 className="fr-page-title">Fraud Rules</h1>
          <p className="fr-page-sub">
            Review {isAdmin ? 'and manage ' : ''}fraud detection preferences used by InvoiceShield.
          </p>
        </div>

        <section className="fr-pref-card">
          <div className="fr-pref-header">
            <div>
              <p className="fr-pref-kicker">Rule Settings</p>
            </div>

            <div className="fr-pref-summary">
              <span><strong>{rules.length}</strong> total</span>
              <span><strong>{enabledCount}</strong> enabled</span>
              <span><strong>{disabledCount}</strong> disabled</span>
            </div>
          </div>

          <div className="fr-toolbar">
  <div className="fr-search-wrap">
    <svg
      className="fr-search-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>

    <input
      className="fr-search-input"
      type="text"
      placeholder="Search by rule name or description"
      value={search}
      onChange={(event) => setSearch(event.target.value)}
    />
  </div>

  <div className="fr-select-wrap">
    <svg
      className="fr-select-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <circle cx="12" cy="12" r="9" />
      <polyline points="8 12 11 15 16 9" />
    </svg>

    <select
      className="fr-select"
      value={status}
      onChange={(event) => setStatus(event.target.value)}
    >
      <option value="">Status</option>
      <option value="enabled">Enabled</option>
      <option value="disabled">Disabled</option>
    </select>
  </div>

  <div className="fr-select-wrap">
    <svg
      className="fr-select-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <line x1="12" y1="8" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>

    <select
      className="fr-select"
      value={weightF}
      onChange={(event) => setWeightF(event.target.value)}
    >
      <option value="">Risk Weight</option>
      <option value="low">Low (1-15)</option>
      <option value="medium">Medium (16-40)</option>
      <option value="high">High (41+)</option>
    </select>
  </div>

  {hasFilters && (
    <button className="fr-clear-btn" onClick={clearFilters}>
      Clear Filters
    </button>
  )}
</div>


          {loading && (
            <div className="fr-state-center">
              <span className="fr-spinner" />
              <p>Loading rules...</p>
            </div>
          )}

          {!loading && error && (
            <div className="fr-state-center fr-state-error">
              <p>{error}</p>
              <button className="fr-retry-btn" onClick={load}>
                Retry
              </button>
            </div>
          )}

          {!loading && !error && rules.length === 0 && (
            <div className="fr-state-center">
              <p className="fr-empty-msg">No rules match your filters.</p>
              {hasFilters && (
                <button className="fr-clear-btn" onClick={clearFilters}>
                  Clear Filters
                </button>
              )}
            </div>
          )}

          {!loading && !error && rules.length > 0 && (
            <>
              <div className="fr-rules-grid">
                {visible.map((rule) => (
                  <article
                    key={rule.rule_id}
                    className={`fr-pref-row ${!rule.is_active ? 'is-disabled' : ''}`}
                  >
                    <div className="fr-pref-row-main">
                      {isAdmin ? (
                        <PreferenceSwitch
                          active={rule.is_active}
                          loading={toggling === rule.rule_id}
                          disabled={toggling === rule.rule_id}
                          onClick={() => handleToggle(rule)}
                        />
                      ) : (
                        <PreferenceSwitch
                          active={rule.is_active}
                          disabled
                        />
                      )}

                      <div className="fr-pref-copy">
                        <div className="fr-pref-rule-head">
                          <h3 className="fr-pref-rule-name">{rule.rule_name}</h3>
                          <WeightBadge weight={rule.risk_weight} />
                        </div>

                        <p className="fr-pref-rule-desc">{rule.description}</p>

                        <div className="fr-pref-rule-meta">
                          Created {formatDate(rule.created_at)}
                        </div>
                      </div>
                    </div>

                    <button
                      className="fr-hist-btn"
                      onClick={() => setHistoryRule(rule)}
                      title="View change history"
                      aria-label={`History for ${rule.rule_name}`}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </svg>
                    </button>
                  </article>
                ))}
              </div>

              <div className="fr-pref-footer">
                <div className="fr-pagination-left">
                  Showing <strong>{startRow}-{endRow}</strong> of{' '}
                  <strong>{rules.length}</strong> fraud rule{rules.length !== 1 ? 's' : ''}
                </div>

                <div className="fr-pagination-right">
                  <select
                    className="fr-rows-select"
                    value={rowsPerPage}
                    onChange={(event) => {
                      setRowsPerPage(Number(event.target.value));
                      setPage(1);
                    }}
                  >
                    {[5, 10, 15, 20].map((count) => (
                      <option key={count} value={count}>
                        {count} rows
                      </option>
                    ))}
                  </select>

                  <div className="fr-page-btns">
                    <button
                      className="fr-page-btn"
                      onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                      disabled={page === 1}
                    >
                      {'<'}
                    </button>

                    {Array.from({ length: totalPages }, (_, index) => index + 1).map((item) => (
                      <button
                        key={item}
                        className={`fr-page-btn ${item === page ? 'fr-page-btn-active' : ''}`}
                        onClick={() => setPage(item)}
                      >
                        {item}
                      </button>
                    ))}

                    <button
                      className="fr-page-btn"
                      onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                      disabled={page === totalPages}
                    >
                      {'>'}
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </section>

        {historyRule && (
          <HistoryDrawer
            rule={historyRule}
            onClose={() => setHistoryRule(null)}
          />
        )}

        {toast && (
          <div className={`fr-toast ${toast.isError ? 'fr-toast-error' : 'fr-toast-success'}`}>
            {toast.message}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
