import React, { createContext, useContext, useState } from 'react';

interface User {
  user_id: number;
  username: string;
  full_name: string;
  role_name: string;
  can_edit: boolean;
  assigned_type: string | null;
  assigned_location_id: number | null;
}

interface AuthContextType {
  user: User | null;
  setUser: (user: User | null) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUserState] = useState<User | null>(() => {
    try {
      const stored = localStorage.getItem('surgicode_user');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const setUser = (user: User | null) => {
    if (user) {
      localStorage.setItem('surgicode_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('surgicode_user');
    }
    setUserState(user);
  };

  const logout = () => {
    localStorage.removeItem('surgicode_user');
    setUserState(null);
    window.location.href = '/';
  };

  return (
    <AuthContext.Provider value={{ user, setUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
};