import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import reportWebVitals from './reportWebVitals';

import App from './App';
import ForgotPassword from './Forgot-Pass';
import ResetPassword from './Reset-Password';
import SidebarLayout from './SidebarLayout';
import AdminDashboard from './AdminDashboard';
import ProductPage from './pages/ProductPage';
import ViewStockPage from './pages/ViewStockPage';
import MovementLogPage from './pages/MovementLogPage';
import AuditLogPage from './pages/AuditLogPage';
import UserPage from './pages/UserPage';
import WarehousePage from './pages/WarehousePage';
import RelationsPage from './pages/RelationsPage';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './ProtectedRoute';

const Unauthorized = () => (
  <div className="unauthorized-page">
    <div className="unauthorized-card">
      <div className="unauthorized-icon">
        <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
      </div>
      <h2 className="unauthorized-title">Access Denied</h2>
      <p className="unauthorized-sub">You don't have permission to view this page.</p>
      <a href="/admin-dashboard" className="unauthorized-btn">Go to Dashboard</a>
    </div>
  </div>
);

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

root.render(
  <React.StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<App />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/unauthorized" element={<Unauthorized />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<SidebarLayout />}>
              <Route path="/admin-dashboard" element={<AdminDashboard />} />
              <Route path="/product" element={<ProductPage />} />
              <Route path="/view-stock" element={<ViewStockPage />} />
              <Route path="/movement-log" element={<MovementLogPage />} />
              <Route path="/audit-log" element={<AuditLogPage />} />
              <Route path="/user" element={<UserPage />} />
              <Route path="/warehouse" element={<WarehousePage />} />
              <Route path="/relations" element={<RelationsPage />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  </React.StrictMode>
);

reportWebVitals();