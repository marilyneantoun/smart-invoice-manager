// ============================================================
// pages/InvoiceList/InvoiceListPage.jsx
// All Invoices — searchable, filterable, sortable, paginated table.
//
// Access: Admin, Accountant, Viewer (everyone authenticated).
// Wraps in AppLayout (sidebar + main area).
// Talks to backend at GET /api/invoices?search=&status=&risk=&vendor=&date=&sort=&order=&page=&limit=
// Clicking a row navigates to /invoices/:id (Invoice Detail page — not yet built).
// ============================================================

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import AppLayout from '../../components/Layout/AppLayout';
import './InvoiceListPage.css';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

/* ── Helpers ── */
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

function statusClass(status) {
  if (!status) return '';
  return status.toLowerCase();
}

/* ── Sortable column header ── */
function SortableTh({ label, field, sortField, sortOrder, onSort }) {
  const active = sortField === field;
  return (
    <th onClick={() => onSort(field)} className="sortable">
      {label}
      <span className="sort-arrows">
        <span className={active && sortOrder === 'asc' ? 'active' : ''}>▲</span>
        <span className={active && sortOrder === 'desc' ? 'active' : ''}>▼</span>
      </span>
    </th>
  );
}

/* ================================================================
   MAIN COMPONENT
   ================================================================ */
export default function InvoiceListPage() {
  const navigate = useNavigate();

  /* ── State ── */
  const [invoices, setInvoices] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [riskFilter, setRiskFilter] = useState('');
  const [vendorFilter, setVendorFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');

  // Sorting
  const [sortField, setSortField] = useState('uploaded_at');
  const [sortOrder, setSortOrder] = useState('desc');

  // Pagination
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [totalCount, setTotalCount] = useState(0);

  /* ── Debounced search ── */
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  /* ── Reset to page 1 when filters change ── */
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter, riskFilter, vendorFilter, dateFilter, rowsPerPage]);

  /* ── Fetch vendors once for the dropdown ── */
  useEffect(() => {
    const token = localStorage.getItem('token');
    fetch(`${API}/vendors`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setVendors(data);
        else if (Array.isArray(data.vendors)) setVendors(data.vendors);
      })
      .catch(err => console.error('Failed to load vendors:', err));
  }, []);

  /* ── Fetch invoices whenever filters / sort / pagination change ── */
  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (debouncedSearch) params.append('search', debouncedSearch);
      if (statusFilter) params.append('status', statusFilter);
      if (riskFilter) params.append('risk', riskFilter);
      if (vendorFilter) params.append('vendor', vendorFilter);
      if (dateFilter) params.append('date', dateFilter);
      params.append('sort', sortField);
      params.append('order', sortOrder);
      params.append('page', page);
      params.append('limit', rowsPerPage);

      const token = localStorage.getItem('token');
      const res = await fetch(`${API}/invoices?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const data = await res.json();

      // Accept either { invoices, total } or a raw array
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
  }, [debouncedSearch, statusFilter, riskFilter, vendorFilter, dateFilter, sortField, sortOrder, page, rowsPerPage]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  /* ── Handlers ── */
  const handleSort = (field) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const handleClearFilters = () => {
    setSearch('');
    setStatusFilter('');
    setRiskFilter('');
    setVendorFilter('');
    setDateFilter('');
  };

  const handleRowClick = (invoiceId) => {
    navigate(`/invoices/${invoiceId}`);
  };

  /* ── Pagination math ── */
  const totalPages = Math.max(1, Math.ceil(totalCount / rowsPerPage));
  const startRow = totalCount === 0 ? 0 : (page - 1) * rowsPerPage + 1;
  const endRow = Math.min(page * rowsPerPage, totalCount);

  // Page numbers to display (max 3 visible windows around current)
  const pageNumbers = useMemo(() => {
    const nums = [];
    const maxButtons = 3;
    let start = Math.max(1, page - 1);
    let end = Math.min(totalPages, start + maxButtons - 1);
    if (end - start + 1 < maxButtons) {
      start = Math.max(1, end - maxButtons + 1);
    }
    for (let i = start; i <= end; i++) nums.push(i);
    return nums;
  }, [page, totalPages]);

  /* ── Render ── */
  return (
    <AppLayout>
      <div className="invoice-list-page">
        <h1 className="page-title">All Invoices</h1>
        <p className="page-subtitle">Search, filter, and manage all invoices in the system</p>

        {/* Filters */}
        <div className="filters">
          <div className="search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="7" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder="Search by invoice number or vendor..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          <div className="dropdown">
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="">All Statuses</option>
              <option value="Pending">Pending</option>
              <option value="Approved">Approved</option>
              <option value="Rejected">Rejected</option>
              <option value="Flagged">Flagged</option>
            </select>
          </div>

          <div className="dropdown">
            <select value={riskFilter} onChange={e => setRiskFilter(e.target.value)}>
              <option value="">All Risk Levels</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>

          <div className="dropdown">
            <select value={vendorFilter} onChange={e => setVendorFilter(e.target.value)}>
              <option value="">All Vendors</option>
              {vendors.map(v => (
                <option key={v.vendor_id} value={v.vendor_id}>
                  {v.vendor_name}
                </option>
              ))}
            </select>
          </div>

          <input
            type="date"
            className="date-input"
            value={dateFilter}
            onChange={e => setDateFilter(e.target.value)}
          />

          <button className="clear-btn" onClick={handleClearFilters}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
                  <SortableTh label="Invoice Date"  field="invoice_date" sortField={sortField} sortOrder={sortOrder} onSort={handleSort} />
                  <SortableTh label="Amount"        field="amount"       sortField={sortField} sortOrder={sortOrder} onSort={handleSort} />
                  <th>Currency</th>
                  <SortableTh label="Status"        field="status"       sortField={sortField} sortOrder={sortOrder} onSort={handleSort} />
                  <SortableTh label="Risk Level"    field="risk_score"   sortField={sortField} sortOrder={sortOrder} onSort={handleSort} />
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
                    const risk = riskLevelFromScore(inv.risk_score);
                    return (
                      <tr key={inv.invoice_id} onClick={() => handleRowClick(inv.invoice_id)}>
                        <td className="invoice-num">{inv.invoice_number}</td>
                        <td>{inv.vendor_name || '—'}</td>
                        <td>{formatDate(inv.invoice_date)}</td>
                        <td className="amount">{formatAmount(inv.amount, inv.currency)}</td>
                        <td>{inv.currency || '—'}</td>
                        <td><span className={`status ${statusClass(inv.status)}`}>{inv.status || '—'}</span></td>
                        <td><span className={`risk ${risk}`}>{risk.charAt(0).toUpperCase() + risk.slice(1)}</span></td>
                        <td>{formatDate(inv.uploaded_at)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div className="table-footer">
            <div className="footer-left">
              <span className="count">
                Showing <strong>{startRow}{startRow !== endRow ? `–${endRow}` : ''}</strong> of <strong>{totalCount}</strong> invoices
              </span>
              <select
                className="rows-select"
                value={rowsPerPage}
                onChange={e => setRowsPerPage(Number(e.target.value))}
              >
                <option value={10}>10 rows</option>
                <option value={25}>25 rows</option>
                <option value={50}>50 rows</option>
              </select>
            </div>

            <div className="pager">
              <button
                className="page-btn"
                aria-label="Previous"
                disabled={page === 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>

              {pageNumbers.map(n => (
                <button
                  key={n}
                  className={`page-btn ${page === n ? 'active' : ''}`}
                  onClick={() => setPage(n)}
                >
                  {n}
                </button>
              ))}

              <button
                className="page-btn"
                aria-label="Next"
                disabled={page >= totalPages}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
