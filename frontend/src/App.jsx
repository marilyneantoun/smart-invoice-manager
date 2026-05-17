import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import DashboardPage     from './pages/Dashboard/DashboardPage';
import LoginPage         from './pages/LoginPage';
import InvoiceListPage   from './pages/InvoiceList/InvoiceListPage';
import UploadInvoicePage from './pages/UploadInvoice/UploadInvoicePage';
import InvoiceDetailPage from './pages/InvoiceDetail/InvoiceDetailPage';
import AuditTrailPage    from './pages/AuditTrail/AuditTrailPage';
import FraudRulesPage    from './pages/FraudRules/FraudRulesPage';
import './styles/variables.css';

/* ============================================================
   App.jsx — Root router
   ============================================================ */

// Simple auth guard — wraps protected pages
function ProtectedRoute({ children }) {
  const token = localStorage.getItem('token');
  if (!token) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route path="/" element={<LoginPage />} />

        {/* Dashboard */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <DashboardPage />
            </ProtectedRoute>
          }
        />

        {/* Invoices */}
        <Route
          path="/invoices/upload"
          element={
            <ProtectedRoute>
              <UploadInvoicePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/invoices"
          element={
            <ProtectedRoute>
              <InvoiceListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/invoices/:id"
          element={
            <ProtectedRoute>
              <InvoiceDetailPage />
            </ProtectedRoute>
          }
        />

        {/* Audit trail */}
        <Route
          path="/audit"
          element={
            <ProtectedRoute>
              <AuditTrailPage />
            </ProtectedRoute>
          }
        />

        {/* System configuration */}
        <Route
          path="/config/fraud-rules"
          element={
            <ProtectedRoute>
              <FraudRulesPage />
            </ProtectedRoute>
          }
        />

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
