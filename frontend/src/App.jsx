import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import DashboardPage from './pages/Dashboard/DashboardPage';
import LoginPage from './pages/LoginPage';
import InvoiceListPage from './pages/InvoiceList/InvoiceListPage';
import UploadInvoicePage from './pages/UploadInvoice/UploadInvoicePage';
import InvoiceDetailPage from './pages/InvoiceDetail/InvoiceDetailPage';
import './styles/variables.css';

/* ============================================================
  App.jsx
  Root — sets up routes for Login and Dashboard.
   ============================================================ */
   // Simple auth check — wraps protected pages
   function ProtectedRoute({ children }) {
     const token = localStorage.getItem('token');
     if (!token) return <Navigate to="/" replace />;
     return children;
   }

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LoginPage />} />
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

        {/* Future routes — uncomment as pages are built
        <Route path="/admin"  element={<ProtectedRoute><AdminPage /></ProtectedRoute>} />
          
        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      
    </BrowserRouter>
  );
}
