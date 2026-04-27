import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';

// Page access rules per role
const PAGE_ACCESS: Record<string, string[]> = {
  '/admin-dashboard': ['Admin', 'Manager', 'Warehouse', 'Sales', 'Inventory Clerk'],
  '/product':         ['Admin', 'Manager', 'Warehouse', 'Sales', 'Inventory Clerk'],
  '/view-stock':      ['Admin', 'Manager', 'Warehouse', 'Sales', 'Inventory Clerk'],
  '/movement-log':    ['Admin', 'Manager', 'Warehouse', 'Sales', 'Inventory Clerk'],
  '/audit-log':       ['Admin', 'Manager', 'Warehouse', 'Sales', 'Inventory Clerk'],
  '/user':            ['Admin'],
  '/warehouse':       ['Admin', 'Manager', 'Warehouse', 'Sales', 'Inventory Clerk'],
  '/relations':       ['Admin', 'Manager', 'Warehouse', 'Sales', 'Inventory Clerk'],
};

export const ProtectedRoute = () => {
  const { user } = useAuth();
  const location = useLocation();

  // Not logged in → redirect to login
  if (!user) {
    return <Navigate to="/" replace />;
  }

  // Check page access
  const allowedRoles = PAGE_ACCESS[location.pathname];
  if (allowedRoles && !allowedRoles.includes(user.role_name)) {
    return <Navigate to="/unauthorized" replace />;
  }

  return <Outlet />;
};