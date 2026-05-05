import React, { useState, useEffect } from 'react';
import './App.css';
import { useNavigate } from 'react-router-dom';
import { supabase } from './lib/supabase';
import { useAuth } from './context/AuthContext';

function App() {
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const [dateTime, setDateTime] = useState(new Date());
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setDateTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formattedDateTime = `${dateTime.toLocaleDateString('en-US')} (${dateTime.toLocaleTimeString('en-US')})`;

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const username = (e.currentTarget.elements.namedItem("username") as HTMLInputElement).value;
    const password = (e.currentTarget.elements.namedItem("password") as HTMLInputElement).value;

    try {
      // Step 1: Get user (include status in the select)
      const { data: userData, error: userError } = await supabase
        .from("users")
        .select("user_id, username, full_name, role_id, assigned_type, assigned_location_id, status")
        .eq("username", username)
        .eq("password_hash", password)
        .single();

      if (userError || !userData) {
        setError('Invalid username or password.');
        setLoading(false);
        return;
      }

      // Step 2: Block inactive users before anything else
      if (userData.status === 'Inactive') {
        setError('Your account has been deactivated. Please contact your administrator.');
        setLoading(false);
        return;
      }

      // Step 3: Get role separately
      const { data: roleData, error: roleError } = await supabase
        .from("role")
        .select("role_name, can_edit")
        .eq("role_id", userData.role_id)
        .single();

      if (roleError || !roleData) {
        setError('User role not found. Please contact your administrator.');
        setLoading(false);
        return;
      }

      // Step 4: Log the LOGIN event to audit_log
      await supabase.from('audit_log').insert([{
        user_id:    userData.user_id,
        action:     'LOGIN',
        table_name: 'users',
        record_id:  userData.user_id,
        description: `LOGIN — ${userData.full_name} (@${userData.username}) signed in`,
      }]);

      // Step 5: Build and store user
      const loggedInUser = {
        user_id:              userData.user_id,
        username:             userData.username,
        full_name:            userData.full_name,
        role_name:            roleData.role_name,
        can_edit:             roleData.can_edit,
        assigned_type:        userData.assigned_type,
        assigned_location_id: userData.assigned_location_id,
      };

      setUser(loggedInUser);
      navigate('/admin-dashboard');

    } catch (err: any) {
      console.error('Login error:', err);
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="SurgiCode">
      <nav className="topnavbar">
        <div className="logo1">
          <div className="top-logo-img" />
          <h2 className="logo-text">SurgiCode</h2>
        </div>
        <ul className="date-n-time">
          <li>{formattedDateTime}</li>
        </ul>
      </nav>

      <div className="main-container">
        <div className="login">
          <div className="login-header-img"></div>

          <form className="login-form" onSubmit={handleLogin}>

            {error && (
              <div className="login-error">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                  width="16" height="16">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                {error}
              </div>
            )}

            {/* Username */}
            <div className="input-group">
              <span className="input-icon">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                  <circle cx="12" cy="7" r="4"/>
                </svg>
              </span>
              <input type="text" name="username" placeholder="Username" required />
            </div>

            {/* Password */}
            <div className="input-group">
              <span className="input-icon">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
              </span>
              <input
                type={showPassword ? "text" : "password"}
                name="password"
                placeholder="Password"
                required
              />
              <button
                type="button"
                className="toggle-password"
                onClick={() => setShowPassword(!showPassword)}
                aria-label="Toggle password visibility"
              >
                {showPassword ? (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                    <line x1="1" y1="1" x2="23" y2="23"/>
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                )}
              </button>
            </div>

            <p className="forgot-password">
              <a href="/forgot-password">Forgot Password?</a>
            </p>

            <button type="submit" className="login-btn" disabled={loading}>
              {loading ? <span className="login-spinner" /> : 'Log In'}
            </button>

          </form>
        </div>

        <div className="surgicode-logo-container">
          <img src="/surgicode-logo.png" alt="SurgiCode Logo" className="surgicode-logo-img" />
        </div>
      </div>
    </div>
  );
}

export default App;