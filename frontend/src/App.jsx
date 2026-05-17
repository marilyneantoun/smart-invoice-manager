import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import DashboardPage from './pages/Dashboard/DashboardPage';
import LoginPage from './pages/LoginPage';
import InvoiceListPage from './pages/InvoiceList/InvoiceListPage';
import UploadInvoicePage from './pages/UploadInvoice/UploadInvoicePage';
import InvoiceDetailPage from './pages/InvoiceDetail/InvoiceDetailPage';
import AuditTrailPage from './pages/AuditTrail/AuditTrailPage';
import AdministrationPage from './pages/Administration/AdministrationPage';
import './styles/variables.css';

/* ============================================================
  App.jsx
  Root — sets up routes for Login and Dashboard.
   ============================================================ */
 // Helper — is the JWT in localStorage present AND not expired?
function hasValidToken() {
  const token = localStorage.getItem('token');
  if (!token) return false;

  try {
    // JWT format: header.payload.signature — decode the payload only.
    const payload = JSON.parse(atob(token.split('.')[1]));
    if (payload.exp && Date.now() >= payload.exp * 1000) {
      // expired — clean up so subsequent loads don't try again
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      return false;
    }
    return true;
  } catch {
    // malformed token — clean up
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    return false;
  }
}

// Guards — protect logged-in pages, and keep logged-in users off /login
function ProtectedRoute({ children }) {
  if (!hasValidToken()) return <Navigate to="/" replace />;
  return children;
}

function PublicRoute({ children }) {
  if (hasValidToken()) return <Navigate to="/dashboard" replace />;
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
       <Route
          path="/"
          element={
            <PublicRoute>
              <LoginPage />
            </PublicRoute>
          }
        /> 
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <DashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
         path="/invoices/upload"
         element={
          <ProtectedRoute>
            <UploadInvoicePage />
          </ProtectedRoute>} />

        <Route path="/invoices" 
        element={
        <ProtectedRoute>
          <InvoiceListPage />
          </ProtectedRoute>} />
          
       <Route path="/invoices/:id"
       element={
       <ProtectedRoute>
        <InvoiceDetailPage />
        </ProtectedRoute>}  />

        <Route path="/audit"
       element={
       <ProtectedRoute>
        <AuditTrailPage />
        </ProtectedRoute>}/>

        <Route path="/admin" element={<ProtectedRoute><AdministrationPage /></ProtectedRoute>} />

    
        {/* Future routes — uncomment as pages are built
        <Route path="/admin"  element={<ProtectedRoute><AdminPage /></ProtectedRoute>} />
          
        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      
    </BrowserRouter>
  );
}
