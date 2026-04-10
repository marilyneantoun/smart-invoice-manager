// ============================================================
// pages/Dashboard/DashboardPage.jsx
// Dashboard — KPIs, charts, vendors, rules, risk breakdown.
// Fetches all data from GET /api/dashboard.
// ============================================================

import React, { useEffect, useState, useRef, useCallback } from 'react';
import Chart from 'chart.js/auto';
import AppLayout from '../../components/Layout/AppLayout';
import './DashboardPage.css';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

/* ── Animated counter hook ── */
function useAnimatedValue(target, duration = 1200) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let start = null;
    const step = (ts) => {
      if (!start) start = ts;
      const p = Math.min((ts - start) / duration, 1);
      const ease = 1 - Math.pow(1 - p, 3);
      setValue(Math.round(ease * target));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [target, duration]);
  return value;
}

/* ── KPI Card ── */
function KpiCard({ label, value, icon, colorClass, prefix = '', suffix = '', isCurrency = false }) {
  const animated = useAnimatedValue(value);
  const display = isCurrency
    ? `${prefix}${animated.toLocaleString()}`
    : `${prefix}${animated}${suffix}`;
  return (
    <div className="kpi">
      <div className="kpi-top">
        <span className="kpi-label">{label}</span>
        <div className={`kpi-icon ${colorClass}`}>{icon}</div>
      </div>
      <div className="kpi-value">{display}</div>
    </div>
  );
}

/* ── Horizontal bar list ── */
function HBarList({ items, maxVal, colorFn }) {
  return (
    <div>
      {items.map((item, i) => {
        const pct = Math.max((item.value / maxVal) * 100, 4);
        const color = typeof colorFn === 'function' ? colorFn(item) : colorFn;
        return (
          <div className="hbar" key={i}>
            <div className="hbar-head">
              <span className="hbar-name">{item.label}</span>
              <span className="hbar-val">{item.value}{item.suffix || ''}</span>
            </div>
            <div className="hbar-track">
              <div
                className="hbar-fill"
                style={{ width: `${pct}%`, background: color, boxShadow: `0 0 8px ${color}30` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Arc gauge (SVG) ── */
function ArcGauge({ percent = 100 }) {
  const sz = 160, cx = sz / 2, cy = sz * 0.55, r = sz * 0.38;
  const startA = -210, endA = 30, range = endA - startA;
  const circ = 2 * Math.PI * r;
  const arcLen = (range / 360) * circ;
  const fillLen = (percent / 100) * arcLen;
  const dashOff = -((startA / 360) * circ);

  return (
    <div className="arc-wrap">
      <svg width={sz} height={sz * 0.72} viewBox={`0 0 ${sz} ${sz * 0.72}`}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(15,23,42,0.06)"
          strokeWidth="6" strokeDasharray={`${arcLen} ${circ - arcLen}`}
          strokeDashoffset={dashOff} strokeLinecap="round" />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#0D9668"
          strokeWidth="6" strokeDasharray={`${fillLen} ${circ - fillLen}`}
          strokeDashoffset={dashOff} strokeLinecap="round"
          style={{ filter: 'drop-shadow(0 0 4px rgba(13,150,104,0.35))' }}>
          <animate attributeName="stroke-dasharray"
            from={`0 ${circ}`} to={`${fillLen} ${circ - fillLen}`}
            dur="1.5s" fill="freeze" />
        </circle>
        <text x={cx} y={cy + 2} textAnchor="middle" fill="#0D9668"
          fontSize="24" fontWeight="700" fontFamily="'Plus Jakarta Sans',sans-serif">
          {percent}%
        </text>
        <text x={cx} y={cy + 18} textAnchor="middle" fill="#475569"
          fontSize="9" fontFamily="'Plus Jakarta Sans',sans-serif" letterSpacing="0.05em">
          HUMAN REVIEWED
        </text>
      </svg>
      <div className="arc-note">Every invoice undergoes<br />human review before approval</div>
    </div>
  );
}

/* ── Main Dashboard ── */
export default function DashboardPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const barRef = useRef(null);
  const donutRef = useRef(null);
  const barChartRef = useRef(null);
  const donutChartRef = useRef(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    fetch(`${API}/dashboard`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => {
        if (!res.ok) throw new Error('Failed to load dashboard');
        return res.json();
      })
      .then(d => { setData(d); setLoading(false); })
      .catch(err => { setError(err.message); setLoading(false); });
  }, []);

  /* ── Chart.js setup ── */
  const buildCharts = useCallback(() => {
    if (!data || !barRef.current || !donutRef.current) return;

    // Cleanup previous instances
    if (barChartRef.current) barChartRef.current.destroy();
    if (donutChartRef.current) donutChartRef.current.destroy();

    // Chart.js defaults
    Chart.defaults.color = '#475569';
    Chart.defaults.font.family = "'Plus Jakarta Sans',sans-serif";
    Chart.defaults.font.size = 10;
    Chart.defaults.plugins.legend.display = false;
    Chart.defaults.animation.duration = 1000;
    Chart.defaults.animation.easing = 'easeOutCubic';

    const months = data.monthly_volume.map(m => m.month);

    // Stacked bar chart
    barChartRef.current = new Chart(barRef.current, {
      type: 'bar',
      data: {
        labels: months,
        datasets: [
          { label: 'Approved', data: data.monthly_volume.map(m => m.approved), backgroundColor: 'rgba(13,150,104,0.85)', borderRadius: 0, borderSkipped: false },
          { label: 'Flagged',  data: data.monthly_volume.map(m => m.flagged),  backgroundColor: 'rgba(198,149,43,0.85)',  borderRadius: 0, borderSkipped: false },
          { label: 'Rejected', data: data.monthly_volume.map(m => m.rejected), backgroundColor: 'rgba(155,44,61,0.85)',   borderRadius: 0, borderSkipped: false },
          { label: 'Pending',  data: data.monthly_volume.map(m => m.pending),  backgroundColor: 'rgba(46,107,198,0.85)',  borderRadius: { topLeft: 4, topRight: 4 }, borderSkipped: false },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: {
          x: { stacked: true, grid: { display: false }, border: { display: false }, ticks: { color: '#475569', font: { size: 10 } } },
          y: { stacked: true, grid: { color: 'rgba(148,163,184,0.05)', drawBorder: false }, border: { display: false }, ticks: { color: '#475569', font: { size: 9 }, stepSize: 2, callback: v => Number.isInteger(v) ? v : '' } },
        },
        plugins: {
          tooltip: {
           backgroundColor: '#FFFFFF', borderColor: 'rgba(15,23,42,0.10)',
            borderWidth: 1, cornerRadius: 8, padding: 10,
            titleFont: { size: 11, weight: 600 }, titleColor: '#0F172A',
            bodyFont: { size: 11 }, bodyColor: '#475569', boxPadding: 4,
            usePointStyle: true, pointStyle: 'circle',
            filter: item => item.raw > 0,
            callbacks: { label: ctx => '  ' + ctx.dataset.label + ': ' + ctx.raw },
          },
        },
        interaction: { intersect: false, mode: 'index' },
      },
    });

    // Donut chart
    const sd = data.status_distribution;
    donutChartRef.current = new Chart(donutRef.current, {
      type: 'doughnut',
      data: {
        labels: ['Approved', 'Rejected', 'Flagged', 'Pending'],
        datasets: [{
          data: [sd.Approved, sd.Rejected, sd.Flagged, sd.Pending],
          backgroundColor: ['#0D9668', '#9B2C3D', '#C6952B', '#2E6BC6'],
          borderWidth: 0, spacing: 3, borderRadius: 3,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '68%',
        plugins: {
          tooltip: {
            backgroundColor: '#FFFFFF', borderColor: 'rgba(15,23,42,0.10)',
            borderWidth: 1, cornerRadius: 8, padding: 10,
            titleFont: { size: 11, weight: 600 }, titleColor: '#0F172A',
            bodyFont: { size: 11 }, bodyColor: '#475569', boxPadding: 4,
            usePointStyle: true, pointStyle: 'circle',
            callbacks: { label: ctx => '  ' + ctx.label + ': ' + ctx.raw + ' invoices' },
          },
        },
      },
    });
  }, [data]);

  useEffect(() => { buildCharts(); }, [buildCharts]);

  /* ── Render ── */
  if (loading) {
    return (
      <AppLayout>
        <div className="page-header"><div><h1>Dashboard</h1><p>Loading...</p></div></div>
      </AppLayout>
    );
  }

  if (error) {
    return (
      <AppLayout>
        <div className="page-header"><div><h1>Dashboard</h1><p className="error-text">{error}</p></div></div>
      </AppLayout>
    );
  }

  const { kpis, top_vendors, top_rules, risk_breakdown, status_distribution, human_review_rate } = data;
  const totalInvoices = kpis.total_invoices;
  const maxVendor = top_vendors.length > 0 ? top_vendors[0].count : 1;
  const maxRule = top_rules.length > 0 ? top_rules[0].count : 1;

  return (
    <AppLayout>
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          <p>Invoice fraud detection overview</p>
        </div>
      </div>

      {/* ── KPI Strip ── */}
      <div className="kpi-strip">
        <KpiCard label="Total Invoices" value={kpis.total_invoices} colorClass="emerald"
          icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>} />
        <KpiCard label="Pending Review" value={kpis.pending_review} colorClass="amber"
          icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>} />
        <KpiCard label="Fraud Rate" value={kpis.fraud_rate} suffix="%" colorClass="rose"
          icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>} />
        <KpiCard label="Approved Total" value={kpis.approved_total} prefix="$" colorClass="emerald" isCurrency
          icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>} />
      </div>

      {/* ── Charts Row ── */}
      <div className="row">
        <div className="card" style={{ flex: 1.4, minWidth: 0 }}>
          <div className="card-head">
            <span className="card-title">Monthly Invoice Volume</span>
            <div className="legend">
              <span className="legend-item"><span className="legend-dot" style={{ background: '#0D9668' }} />Approved</span>
              <span className="legend-item"><span className="legend-dot" style={{ background: '#C6952B' }} />Flagged</span>
              <span className="legend-item"><span className="legend-dot" style={{ background: '#9B2C3D' }} />Rejected</span>
              <span className="legend-item"><span className="legend-dot" style={{ background: '#2E6BC6' }} />Pending</span>
            </div>
          </div>
          <div className="chart-wrap" style={{ height: 190 }}><canvas ref={barRef} /></div>
        </div>
        <div className="card" style={{ flex: 0.7, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <div className="card-head"><span className="card-title">Invoice Status</span></div>
          <div className="donut-wrap" style={{ height: 170 }}>
            <canvas ref={donutRef} />
            <div className="donut-center">
              <div className="donut-center-val">{totalInvoices}</div>
              <div className="donut-center-label">TOTAL</div>
            </div>
          </div>
          <div className="donut-legend">
            <div className="donut-row"><span className="donut-label"><span className="donut-dot" style={{ background: '#0D9668' }} />Approved</span><span className="donut-val">{status_distribution.Approved}</span></div>
            <div className="donut-row"><span className="donut-label"><span className="donut-dot" style={{ background: '#9B2C3D' }} />Rejected</span><span className="donut-val">{status_distribution.Rejected}</span></div>
            <div className="donut-row"><span className="donut-label"><span className="donut-dot" style={{ background: '#C6952B' }} />Flagged</span><span className="donut-val">{status_distribution.Flagged}</span></div>
            <div className="donut-row"><span className="donut-label"><span className="donut-dot" style={{ background: '#2E6BC6' }} />Pending</span><span className="donut-val">{status_distribution.Pending}</span></div>
          </div>
        </div>
      </div>

      {/* ── Analytics Row ── */}
      <div className="row">
        <div className="card" style={{ flex: 1, minWidth: 0 }}>
          <div className="card-head"><span className="card-title">Top Vendors by Volume</span></div>
          <HBarList
            items={top_vendors.map(v => ({ label: v.name, value: v.count, suffix: ' invoices' }))}
            maxVal={maxVendor}
            colorFn={() => '#0D9668'}
          />
        </div>
        <div className="card" style={{ flex: 1, minWidth: 0 }}>
          <div className="card-head"><span className="card-title">Most Triggered Rules</span></div>
          <HBarList
            items={top_rules.map(r => ({ label: r.name, value: r.count, suffix: '×', weight: r.weight }))}
            maxVal={maxRule}
            colorFn={(item) => item.weight >= 50 ? '#9B2C3D' : item.weight >= 20 ? '#C6952B' : '#0D9668'}
          />
        </div>
      </div>

      {/* ── Bottom Row ── */}
      <div className="row">
        <div className="card" style={{ flex: 1, minWidth: 0 }}>
          <div className="card-head"><span className="card-title">Risk Level Breakdown</span></div>
          <div className="risk-row">
            <div className="risk-card" style={{ background: 'var(--green-s)', border: '1px solid var(--green-b)' }}>
              <div className="risk-bar" style={{ background: 'var(--green)' }} />
              <div><div className="risk-val">{risk_breakdown.Low}</div><div className="risk-label">Low Risk</div></div>
            </div>
            <div className="risk-card" style={{ background: 'var(--yellow-s)', border: '1px solid var(--yellow-b)' }}>
              <div className="risk-bar" style={{ background: 'var(--yellow)' }} />
              <div><div className="risk-val">{risk_breakdown.Medium}</div><div className="risk-label">Medium Risk</div></div>
            </div>
            <div className="risk-card" style={{ background: 'var(--red-s)', border: '1px solid var(--red-b)' }}>
              <div className="risk-bar" style={{ background: 'var(--red)' }} />
              <div><div className="risk-val">{risk_breakdown.High}</div><div className="risk-label">High Risk</div></div>
            </div>
          </div>
        </div>
        <div className="card" style={{ flex: 0.6, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div className="card-head" style={{ width: '100%' }}><span className="card-title">Human Review Rate</span></div>
          <ArcGauge percent={human_review_rate} />
        </div>
      </div>
    </AppLayout>
  );
}
