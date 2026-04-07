import React from 'react';
import LoginPage from './pages/LoginPage';
import './styles/variables.css';

/* ============================================================
   App
   Root of the application.
   Later you'll add React Router here and replace LoginPage
   with your route definitions.

   Example with React Router (once you add more pages):

     import { BrowserRouter, Routes, Route } from 'react-router-dom';
     import Dashboard from './pages/Dashboard/DashboardPage';

     <BrowserRouter>
       <Routes>
         <Route path="/"          element={<LoginPage />} />
         <Route path="/dashboard" element={<Dashboard />} />
       </Routes>
     </BrowserRouter>
   ============================================================ */

export default function App() {
  return <LoginPage />;
}
