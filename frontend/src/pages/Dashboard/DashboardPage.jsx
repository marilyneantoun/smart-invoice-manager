// ============================================================
// pages/Dashboard/DashboardPage.jsx
// Dashboard — fraud detection overview with KPIs, charts, and
// reviewer queues. Wraps in AppLayout (sidebar + main area).
// Talks to backend at GET /api/dashboard.
// ============================================================

import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  PieChart, Pie, Cell,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area,
} from 'recharts';
import AppLayout from '../../components/Layout/AppLayout';
import './DashboardPage.css';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

/* ── Status colors (jewel-toned) ── */
const COLORS = {
  approved: '#0B6E4F',
  rejected: '#8B1F2E',
  flagged:  '#B45309',
  pending:  '#1E40AF',
};

/* ── Helpers ── */
function formatAmount(amount, currency) {
  if (amount === null || amount === undefined) return '—';
  const num = Number(amount);
  if (isNaN(num)) return '—';
  const symbols = { USD: '$', EUR: '€', GBP: '£', LBP: 'LL ' };
  const symbol = symbols[currency] || '';
  return `${symbol}${num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} ${currency || ''}`.trim();
}

function timeAgo(uploadedAt) {
  if (!uploadedAt) return { label: '—', band: 'fresh' };
  const then = new Date(uploadedAt).getTime();
  const now  = Date.now();
  const diff = now - then;
  if (diff <= 0) return { label: 'just now', band: 'fresh' };

  const hours   = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const days    = Math.floor(hours / 24);

  let label;
  if (days   > 0) label = `${days}d ${hours % 24}h`;
  else if (hours > 0) label = `${hours}h ${minutes}m`;
  else label = `${minutes}m`;

  // Aging band: <2h fresh, 2-4h warn, >4h stale
  let band = 'fresh';
  if (hours >= 4 || days > 0) band = 'stale';
  else if (hours >= 2)        band = 'warn';

  return { label, band };
}

function riskBand(score) {
  if (score >= 61) return 'high';
  if (score >= 31) return 'med';
  return 'low';
}

function currentMonthYear() {
  return new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

/* ── Custom chart tooltip ── */
function ChartTooltip({ active, payload, label, suffix = '' }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-label">{label}</div>
      {payload
        .filter(p => p.value > 0)
        .map(p => (
          <div key={p.dataKey} className="chart-tooltip-row">
            <span className="chart-tooltip-dot" style={{ background: p.color || p.fill }} />
            <span className="chart-tooltip-name">{p.name}</span>
            <span className="chart-tooltip-value">{p.value}{suffix}</span>
          </div>
        ))}
    </div>
  );
}

/* ──────────────────────────────────────────────
   HORIZONTAL BAR LIST (Rules / Vendors / Flagged)
   ────────────────────────────────────────────── */
function HBarList({ items, color }) {
  if (!items || items.length === 0) {
    return <div className="hbar-empty">No data yet</div>;
  }
  const max = Math.max(...items.map(i => i.count), 1);

  return (
    <div className="hbar-list">
      {items.map((item, idx) => {
        const pct = (item.count / max) * 100;
        const rank = String(idx + 1).padStart(2, '0');
        return (
          <div className="hbar" key={`${item.name}-${idx}`}>
            <div className="hbar-head">
              <div className="hbar-name">
                <span className="hbar-rank">{rank}</span>
                <span className="hbar-name-text">{item.name}</span>
              </div>
              <span className="hbar-val">{item.count}</span>
            </div>
            {item.sub && <div className="hbar-sub">{item.sub}</div>}
            <div className="hbar-track" style={{ marginTop: item.sub ? '4px' : '0' }}>
              <div className="hbar-fill" style={{ width: `${pct}%`, background: color }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ══════════════════════════════════════════════
   MAIN DASHBOARD PAGE
   ══════════════════════════════════════════════ */
export default function DashboardPage() {
  const navigate = useNavigate();
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [pendingExpanded, setPendingExpanded] = useState(false);
  // 'all' | '12' | '6' — controls how many recent months the trends charts show
  const [trendRange, setTrendRange] = useState('all');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${API}/dashboard`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error('Failed to load dashboard');
        const json = await res.json();
        if (!cancelled) {
          setData(json);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message);
          setLoading(false);
        }
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  /* ── Derived data ── */
  const statusData = useMemo(() => {
    if (!data) return [];
    const s = data.status_distribution;
    return [
      { name: 'Approved', value: s.Approved || 0, color: COLORS.approved },
      { name: 'Rejected', value: s.Rejected || 0, color: COLORS.rejected },
      { name: 'Flagged',  value: s.Flagged  || 0, color: COLORS.flagged  },
      { name: 'Pending',  value: s.Pending  || 0, color: COLORS.pending  },
    ];
  }, [data]);

  const totalInvoices = data?.kpis?.total_invoices || 0;

  const riskTotals = useMemo(() => {
    if (!data) return { Low: 0, Medium: 0, High: 0, total: 0 };
    const r = data.risk_breakdown;
    return { ...r, total: (r.Low || 0) + (r.Medium || 0) + (r.High || 0) };
  }, [data]);

  const topVendorsList = useMemo(() => {
    if (!data) return [];
    return data.top_vendors.map(v => ({
      name:  v.name,
      count: v.count,
      sub:   `${v.count} invoice${v.count === 1 ? '' : 's'} · ${formatAmount(v.amount, v.currency)}`,
    }));
  }, [data]);

  const flaggedVendorsList = useMemo(() => {
    if (!data) return [];
    return data.top_flagged_vendors.map(v => ({ name: v.name, count: v.count }));
  }, [data]);

  const rulesList = useMemo(() => {
    if (!data) return [];
    return data.top_rules.map(r => ({ name: r.name, count: r.count }));
  }, [data]);

  // Slice the last N months of data based on the selected range tab.
  // Backend returns ALL months ordered ASC by month_key, so we take the tail.
  const filteredVolume = useMemo(() => {
    if (!data) return [];
    const all = data.monthly_volume || [];
    if (trendRange === 'all') return all;
    const n = trendRange === '6' ? 6 : 12;
    return all.slice(-n);
  }, [data, trendRange]);

  const filteredFraudTrend = useMemo(() => {
    if (!data) return [];
    const all = data.fraud_trend || [];
    if (trendRange === 'all') return all;
    const n = trendRange === '6' ? 6 : 12;
    return all.slice(-n);
  }, [data, trendRange]);

  const pendingQueue = data?.pending_queue || [];
  const visibleQueue = pendingExpanded ? pendingQueue : pendingQueue.slice(0, 5);

  /* ── Loading & error states ── */
  if (loading) {
    return (
      <AppLayout>
        <div className="dashboard-loading">Loading dashboard…</div>
      </AppLayout>
    );
  }
  if (error) {
    return (
      <AppLayout>
        <div className="dashboard-error">
          Could not load dashboard. <button onClick={() => window.location.reload()}>Retry</button>
        </div>
      </AppLayout>
    );
  }

  /* ── Render ── */
  return (
    <AppLayout>
      <div className="dashboard-content">

        {/* PAGE HEADER */}
        <div className="page-header">
          <div>
            <h1>Dashboard</h1>
            <div className="page-header-sub">
              Invoice fraud detection overview · {currentMonthYear()}
            </div>
          </div>
        </div>

        {/* ─── ROW 1 — STATUS (Donut + Risk) ─── */}
        <div className="row">
          <div className="status-row">

            {/* Invoice Status (Donut) */}
            <div className="card">
              <div className="card-head">
                <div>
                  <div className="card-title">
                    <span className="card-title-dot" />Invoice Status Overview 
                  </div>
                  <div className="card-sub">Invoice Distribution by Current Statuses</div>
                </div>
              </div>
              <div className="donut-card-body">
                <div className="donut-wrap">
                  {totalInvoices > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={statusData}
                          cx="50%" cy="50%"
                          innerRadius="72%" outerRadius="100%"
                          paddingAngle={2}
                          dataKey="value"
                          stroke="#FFFFFF"
                          strokeWidth={3}
                          isAnimationActive={true}
                          animationDuration={700}
                        >
                          {statusData.map((entry, i) => (
                            <Cell key={i} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip content={<ChartTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="donut-empty-ring" />
                  )}
                  <div className="donut-center">
                    <div className="donut-val">{totalInvoices}</div>
                    <div className="donut-label">Total</div>
                  </div>
                </div>
                <div className="donut-legend">
                  {statusData.map(s => (
                    <div className="donut-row" key={s.name}>
                      <span className="donut-name">
                        <span className="donut-dot" style={{ background: s.color }} />
                        {s.name}
                      </span>
                      <span className="donut-count">{s.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Risk Level Distribution */}
            <div className="card">
              <div className="card-head">
                <div>
                  <div className="card-title">
                    <span className="card-title-dot" />Risk Overview
                  </div>
                  <div className="card-sub">Invoice Distribution by Risk Level</div>
                </div>
              </div>
              <div className="risk-cards">
                {[
                  { key: 'low',  label: 'Low',    val: riskTotals.Low,    range: '0–30',   maxBar: 100 },
                  { key: 'med',  label: 'Medium', val: riskTotals.Medium, range: '31–60',  maxBar: 100 },
                  { key: 'high', label: 'High',   val: riskTotals.High,   range: '61–100', maxBar: 100 },
                ].map(r => {
                  const pct = riskTotals.total > 0
                    ? Math.round((r.val / riskTotals.total) * 100)
                    : 0;
                  return (
                    <div className={`risk-card ${r.key}`} key={r.key}>
                      <div className="risk-card-head">
                        <span className="risk-card-pip" />{r.label}
                      </div>
                      <div className="risk-card-bar-wrap">
                        <div className="risk-card-bar" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="risk-card-right">
                        <div className="risk-card-val">{r.val}</div>
                        <div className="risk-card-pct">{pct}% · {r.range}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

          </div>
        </div>

        {/* ─── ROW 2 — TRENDS (Volume + Fraud Rate) ─── */}
        <div className="row">
          <div className="card trends-card">

            <div className="trends-top-bar">
              <div>
                <div className="trends-title">Invoice Activity</div>
                 <div className="card-sub">Monthly Invoice Totals and Review Results</div>
              </div>
              <div className="trends-controls">
                <div className="legend">
                  <span className="legend-item"><span className="legend-dot" style={{ background: COLORS.approved }} />Approved</span>
                  <span className="legend-item"><span className="legend-dot" style={{ background: COLORS.flagged }} />Flagged</span>
                  <span className="legend-item"><span className="legend-dot" style={{ background: COLORS.rejected }} />Rejected</span>
                  <span className="legend-item"><span className="legend-dot" style={{ background: COLORS.pending }} />Pending</span>
                </div>
                <div className="range-tabs">
                  {[
                    { key: 'all', label: 'All' },
                    { key: '12',  label: '12 months' },
                    { key: '6',   label: '6 months' },
                  ].map(t => (
                    <button
                      key={t.key}
                      className={`range-tab ${trendRange === t.key ? 'active' : ''}`}
                      onClick={() => setTrendRange(t.key)}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Volume Stacked Bar */}
            <div className="chart-wrap chart-wrap-vol">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={filteredVolume} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(15,23,42,0.04)" vertical={false} />
                  <XAxis dataKey="month" tick={{ fill: '#94A3B8', fontSize: 10, fontWeight: 500 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#94A3B8', fontSize: 10, fontWeight: 500 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} cursor={false} />
                  <Bar dataKey="approved" name="Approved" stackId="a" fill={COLORS.approved} maxBarSize={52} />
                  <Bar dataKey="flagged"  name="Flagged"  stackId="a" fill={COLORS.flagged}  maxBarSize={52} />
                  <Bar dataKey="rejected" name="Rejected" stackId="a" fill={COLORS.rejected} maxBarSize={52} />
                  <Bar dataKey="pending"  name="Pending"  stackId="a" fill={COLORS.pending} radius={[3, 3, 0, 0]} maxBarSize={52} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="trends-divider" />

            {/* Fraud Rate Trend */}
            <div className="chart-section-head">
              <div>
                <div className="card-title">
                  <span className="card-title-dot" style={{ background: COLORS.rejected }} />Fraud Trend Line
                </div>
                <div className="card-sub">Monthly % of Flagged or Rejected Invoices</div>
              </div>
            </div>
            <div className="chart-wrap chart-wrap-fraud">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={filteredFraudTrend} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="fraudGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"   stopColor="#8B1F2E" stopOpacity={0.16} />
                      <stop offset="100%" stopColor="#8B1F2E" stopOpacity={0}    />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(15,23,42,0.04)" vertical={false} />
                  <XAxis dataKey="month" tick={{ fill: '#94A3B8', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fill: '#94A3B8', fontSize: 10 }}
                    axisLine={false} tickLine={false}
                    tickFormatter={v => `${v}%`}
                    domain={[0, 100]}
                  />
                  <Tooltip content={<ChartTooltip suffix="%" />} cursor={{ stroke: 'rgba(15,23,42,0.1)', strokeWidth: 1 }} />
                  <Area
                    type="monotone"
                    dataKey="rate"
                    name="Fraud Rate"
                    stroke="#8B1F2E"
                    strokeWidth={2}
                    fill="url(#fraudGrad)"
                    dot={{ r: 3, fill: '#8B1F2E', stroke: '#FFFFFF', strokeWidth: 1.5 }}
                    activeDot={{ r: 4.5 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

          </div>
        </div>

        {/* ─── ROW 3 — Oldest Pending Queue ─── */}
        <div className="row">
          <div className="card">
            <div className="card-head">
              <div>
                <div className="card-title">
                  <span className="card-title-dot" />
                  Oldest Pending Reviews
                  <span className="title-count">{pendingQueue.length} pending</span>
                </div>
                <div className="card-sub">Pending Review Aging</div>
              </div>
            </div>

            {pendingQueue.length === 0 ? (
              <div className="empty-state">No invoices waiting for review.</div>
            ) : (
              <>
                <table className="pending-table">
                  <thead>
                    <tr>
                      <th style={{ width: 130 }}>Invoice</th>
                      <th>Vendor</th>
                      <th className="right" style={{ width: 140 }}>Amount</th>
                      <th className="center" style={{ width: 70 }}>Risk</th>
                      <th className="right" style={{ width: 110 }}>In Queue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleQueue.map(inv => {
                      const ageInfo = timeAgo(inv.uploaded_at);
                      const rb      = riskBand(inv.risk_score);
                      return (
                        <tr
                          key={inv.invoice_id}
                          onClick={() => navigate(`/invoices/${inv.invoice_id}`)}
                          className="pending-row"
                        >
                          <td><span className="p-num">{inv.invoice_number}</span></td>
                          <td><span className="p-vendor">{inv.vendor_name}</span></td>
                          <td className="p-amount">{formatAmount(inv.amount, inv.currency)}</td>
                          <td style={{ textAlign: 'center' }}>
                            <span className={`p-risk ${rb}`}>{Math.round(inv.risk_score)}</span>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <span className={`p-age ${ageInfo.band}`}>{ageInfo.label}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {pendingQueue.length > 5 && (
                  <div className="view-all-row">
                    <button
                      className={`view-all-btn ${pendingExpanded ? 'expanded' : ''}`}
                      onClick={() => setPendingExpanded(!pendingExpanded)}
                    >
                      <span>{pendingExpanded ? 'Show top 5' : `Show all ${pendingQueue.length}`}</span>
                      <svg className="chev" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* ─── ROW 4 — Common Issues ─── */}
        <div className="row">
          <div className="card">
            <div className="card-head">
              <div>
                <div className="card-title">
                  <span className="card-title-dot" />Common Issues
                </div>
                <div className="card-sub">Most Common Issues Detected In Invoices</div>
              </div>
            </div>
            <HBarList items={rulesList} color={COLORS.rejected} />
          </div>
        </div>

        {/* ─── ROW 5 — Vendors ─── */}
        <div className="row">
          <div className="vendors-top-row">

            <div className="card">
              <div className="card-head">
                <div>
                  <div className="card-title">
                    <span className="card-title-dot" />Most Active Vendors
                  </div>
                  <div className="card-sub">Based on Total Invoices Submissions</div>
                </div>
              </div>
              <HBarList items={topVendorsList} color={COLORS.approved} />
            </div>

            <div className="card">
              <div className="card-head">
                <div>
                  <div className="card-title">
                    <span className="card-title-dot" style={{ background: COLORS.rejected }} />
                    Top Flagged Vendors
                  </div>
                  <div className="card-sub">Based on Flagged and Rejected Invoices</div>
                </div>
              </div>
              <HBarList items={flaggedVendorsList} color={COLORS.flagged} />
            </div>

          </div>

          {/* OCR Correction Rate */}
          <div className="card ocr-card">
            <div className="card-head">
              <div>
                <div className="card-title">
                  <span className="card-title-dot" />Manual Review Correction Rate
                </div>
                <div className="card-sub">Invoices That Needed Manual Correction After Extraction</div>
              </div>
            </div>
            <div className="ocr-body">
              <div className="ocr-metric-label">Corrected</div>
              <div className="ocr-metric-val">
                {data.ocr_correction.corrected}
                <span className="ocr-metric-of"> / {data.ocr_correction.total}</span>
              </div>
              <div className="ocr-metric-sub">{data.ocr_correction.rate}% correction rate</div>
            </div>
          </div>
        </div>

      </div>
    </AppLayout>
  );
}