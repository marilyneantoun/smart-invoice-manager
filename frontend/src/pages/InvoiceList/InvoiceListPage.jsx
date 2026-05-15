// ============================================================
// pages/InvoiceList/InvoiceListPage.jsx
// All Invoices - searchable, filterable, sortable, paginated table.
// ============================================================

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import AppLayout from '../../components/Layout/AppLayout';
import './InvoiceListPage.css';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

function formatDate(isoString) {
  if (!isoString) return '—';
  const d = new Date(isoString);
  if (isNaN(d)) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatAmount(amount, currency) {
  if (amount === null || amount === undefined) return '—';
  const num = Number(amount);
  if (isNaN(num)) return '—';
  const symbols = { USD: '$', EUR: '€', GBP: '£', LBP: 'LL ' };
  const symbol = symbols[currency] || '';
  return `${symbol}${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function riskLevelFromScore(score) {
  if (score === null || score === undefined) return 'low';
  if (score >= 61) return 'high';
  if (score >= 31) return 'medium';
  return 'low';
}

function riskLabel(score) {
  const level = riskLevelFromScore(score);
  if (level === 'high')   return { text: 'High',   cls: 'risk-high' };
  if (level === 'medium') return { text: 'Medium', cls: 'risk-medium' };
  return                         { text: 'Low',    cls: 'risk-low' };
}

function statusClass(status) {
  if (!status) return '';
  return status.toLowerCase();
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function RiskIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
      <line x1="12" y1="9" x2="12" y2="13"/>
      <line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  );
}

function VendorIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 4-7 8-7s8 3 8 7" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <line x1="3" y1="10" x2="21" y2="10" />
      <line x1="8" y1="3" x2="8" y2="7" />
      <line x1="16" y1="3" x2="16" y2="7" />
    </svg>
  );
}

function SortableTh({ label, field, sortField, sortOrder, onSort, className = '' }) {
  const active = sortField === field;
  return (
    <th
      onClick={() => onSort(field)}
      className={`sortable ${active ? 'active-sort' : ''} ${className}`.trim()}
    >
      <span className="th-inner">
        {label}
        <span className="sort-arrows" aria-hidden="true">
          <span className={active && sortOrder === 'asc'  ? 'active' : ''}>▲</span>
          <span className={active && sortOrder === 'desc' ? 'active' : ''}>▼</span>
        </span>
      </span>
    </th>
  );
}

export default function InvoiceListPage() {
  const navigate = useNavigate();

  const [invoices, setInvoices]         = useState([]);
  const [vendors, setVendors]           = useState([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState('');

  const [search, setSearch]             = useState('');
  const [riskFilter, setRiskFilter]     = useState('');
  const [vendorFilter, setVendorFilter] = useState('');
  const [dateFilter, setDateFilter]     = useState('');
  const [activeTab, setActiveTab]       = useState('all');

  const [sortField, setSortField] = useState('uploaded_at');
  const [sortOrder, setSortOrder] = useState('desc');

  const [page, setPage]               = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [totalCount, setTotalCount]   = useState(0);

  const [debouncedSearch, setDebouncedSearch] = useState('');

  const tabs = [
    { key: 'all',      label: 'All' },
    { key: 'pending',  label: 'Pending' },
    { key: 'approved', label: 'Approved' },
    { key: 'flagged',  label: 'Flagged' },
  ];

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, riskFilter, vendorFilter, dateFilter, rowsPerPage, activeTab]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    fetch(`${API}/vendors`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setVendors(data);
        else if (Array.isArray(data.vendors)) setVendors(data.vendors);
      })
      .catch(err => console.error('Failed to load vendors:', err));
  }, []);

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (debouncedSearch) params.append('search', debouncedSearch);
      if (riskFilter)      params.append('risk',   riskFilter);
      if (vendorFilter)    params.append('vendor', vendorFilter);
      if (dateFilter)      params.append('date',   dateFilter);
      params.append('sort',  sortField);
      params.append('order', sortOrder);
      params.append('page',  page);
      params.append('limit', rowsPerPage);

      if (activeTab === 'pending')  params.append('status', 'Pending');
      if (activeTab === 'approved') params.append('status', 'Approved');
      if (activeTab === 'flagged')  params.append('status', 'Flagged');

      const token = localStorage.getItem('token');
      const res = await fetch(`${API}/invoices?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const data = await res.json();

      if (Array.isArray(data)) {
        setInvoices(data);
        setTotalCount(data.length);
      } else {
        setInvoices(data.invoices || []);
        setTotalCount(data.total ?? (data.invoices?.length ?? 0));
      }
    } catch (err) {
      console.error('Failed to load invoices:', err);
      setError('Could not load invoices. Please try again.');
      setInvoices([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, riskFilter, vendorFilter, dateFilter, sortField, sortOrder, page, rowsPerPage, activeTab]);

  useEffect(() => { fetchInvoices(); }, [fetchInvoices]);

  const handleSort = (field) => {
    if (sortField === field) setSortOrder(o => o === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortOrder('desc'); }
  };

  const handleTabClick = (tabKey) => {
    setActiveTab(tabKey);
    setRiskFilter('');
    setPage(1);
  };

  const handleRiskFilterChange = (e) => {
    setRiskFilter(e.target.value);
    setActiveTab('all');
  };

  const handleClearFilters = () => {
    setSearch('');
    setRiskFilter('');
    setVendorFilter('');
    setDateFilter('');
    setActiveTab('all');
    setPage(1);
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / rowsPerPage));
  const startRow   = totalCount === 0 ? 0 : (page - 1) * rowsPerPage + 1;
  const endRow     = Math.min(page * rowsPerPage, totalCount);

  const pageNumbers = useMemo(() => {
    const nums = [];
    const maxButtons = 3;
    let start = Math.max(1, page - 1);
    let end   = Math.min(totalPages, start + maxButtons - 1);
    if (end - start + 1 < maxButtons) start = Math.max(1, end - maxButtons + 1);
    for (let i = start; i <= end; i++) nums.push(i);
    return nums;
  }, [page, totalPages]);

  return (
    <AppLayout>
      <div className="invoice-list-page">

        <div className="page-header">
          <div className="page-heading">
            <h1 className="page-title">All Invoices</h1>
            <p className="page-subtitle">Search, filter, and manage all invoices in the system</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="invoice-tabs" role="tablist" aria-label="Invoice filters">
          {tabs.map(tab => (
            <button
              key={tab.key}
              type="button"
              className={`invoice-tab ${activeTab === tab.key ? 'active' : ''}`}
              onClick={() => handleTabClick(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="filters">
          <div className="filter-control search">
            <SearchIcon />
            <input
              type="text"
              placeholder="Search by invoice nb or vendor"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          <div className="filter-control dropdown risk-filter">
            <RiskIcon />
            <select value={riskFilter} onChange={handleRiskFilterChange}>
              <option value="">All Risk</option>
              <option value="low">Low Risk</option>
              <option value="medium">Medium Risk</option>
              <option value="high">High Risk</option>
            </select>
          </div>

          <div className="filter-control dropdown vendor-filter">
            <VendorIcon />
            <select value={vendorFilter} onChange={e => setVendorFilter(e.target.value)}>
              <option value="">All Vendors</option>
              {vendors.map(v => (
                <option key={v.vendor_id} value={v.vendor_id}>{v.vendor_name}</option>
              ))}
            </select>
          </div>

          <div className="filter-control date-filter">
            <CalendarIcon />
            <input
              type="date"
              className="date-input"
              value={dateFilter}
              onChange={e => setDateFilter(e.target.value)}
            />
          </div>

          <button className="clear-btn" onClick={handleClearFilters}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
            Clear Filters
          </button>
        </div>

        {/* Table */}
        <div className="table-wrap">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Invoice Number</th>
                  <th>Vendor Name</th>
                  <SortableTh label="Invoice Date" field="invoice_date" sortField={sortField} sortOrder={sortOrder} onSort={handleSort} />
                  <SortableTh label="Amount" field="amount" sortField={sortField} sortOrder={sortOrder} onSort={handleSort} className="amount-heading" />
                  <th>Currency</th>
                  <SortableTh label="Status" field="status" sortField={sortField} sortOrder={sortOrder} onSort={handleSort} />
                  <SortableTh label="Risk" field="risk_score" sortField={sortField} sortOrder={sortOrder} onSort={handleSort} />
                  <th>Uploaded At</th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr><td colSpan="8" className="empty-state">Loading invoices...</td></tr>
                ) : error ? (
                  <tr><td colSpan="8" className="empty-state error">{error}</td></tr>
                ) : invoices.length === 0 ? (
                  <tr><td colSpan="8" className="empty-state">No invoices found.</td></tr>
                ) : (
                  invoices.map(inv => {
                    const risk = riskLabel(inv.risk_score);
                    return (
                      <tr
                        key={inv.invoice_id}
                        className={risk.cls === 'risk-high' ? 'row-high-risk' : ''}
                        onClick={() => navigate(`/invoices/${inv.invoice_id}`)}
                      >
                        <td className="invoice-num">{inv.invoice_number}</td>
                        <td className="vendor-cell">{inv.vendor_name || '—'}</td>
                        <td className="date-cell">{formatDate(inv.invoice_date)}</td>
                        <td className="amount">{formatAmount(inv.amount, inv.currency)}</td>
                        <td className="currency-cell">{inv.currency || '—'}</td>
                        <td>
                          <span className={`label status ${statusClass(inv.status)}`}>
                            {inv.status || '—'}
                          </span>
                        </td>
                        <td>
                          <span className="label">
                            {risk.text}
                          </span>
                        </td>
                        <td className="date-cell">{formatDate(inv.uploaded_at)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div className="table-footer">
            <div className="footer-count">
              Showing <strong>{startRow}</strong> to <strong>{endRow}</strong> of <strong>{totalCount}</strong> invoices
            </div>

            <div className="footer-actions">
              <select
                className="rows-select"
                value={rowsPerPage}
                onChange={e => setRowsPerPage(Number(e.target.value))}
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
              <span className="per-page">per page</span>

              <div className="pager">
                <button
                  className="page-btn page-arrow"
                  aria-label="Previous"
                  disabled={page === 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
                    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                </button>

                {pageNumbers.map(n => (
                  <button
                    key={n}
                    className={`page-btn page-number ${page === n ? 'active' : ''}`}
                    onClick={() => setPage(n)}
                  >
                    {n}
                  </button>
                ))}

                <button
                  className="page-btn page-arrow"
                  aria-label="Next"
                  disabled={page >= totalPages}
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
                    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>

      </div>
    </AppLayout>
  );
}
