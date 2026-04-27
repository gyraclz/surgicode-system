import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from './lib/supabase';
import './Reset-Password.css';

function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [dateTime, setDateTime] = useState(new Date());
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [userId, setUserId] = useState<number | null>(null);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const timer = setInterval(() => setDateTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formattedDateTime = `${dateTime.toLocaleDateString('en-US')} (${dateTime.toLocaleTimeString('en-US')})`;

  useEffect(() => {
    const verifyToken = async () => {
      if (!token) {
        setError('No reset token found. Please request a new reset link.');
        setVerifying(false);
        return;
      }

      const { data, error: fetchError } = await supabase
        .from('password_resets')
        .select('user_id, expires')
        .eq('token', token)
        .single();

      console.log('Token data:', data);
      console.log('Token error:', fetchError);

      if (fetchError || !data) {
        setError('Invalid or expired reset link. Please request a new one.');
        setVerifying(false);
        return;
      }

      // Fixed expiry check
      if (new Date(data.expires).getTime() < Date.now()) {
        setError('This reset link has expired. Please request a new one.');
        setVerifying(false);
        return;
      }

      setUserId(data.user_id);
      setTokenValid(true);
      setVerifying(false);
    };

    verifyToken();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);

    try {
      // 1. Update password_hash in users table
      const { error: updateError } = await supabase
        .from('users')
        .update({ password_hash: password })
        .eq('user_id', userId);

      if (updateError) {
        console.error('Update error:', updateError);
        setError('Failed to update password. Please try again.');
        setLoading(false);
        return;
      }

      // 2. Delete used token
      await supabase
        .from('password_resets')
        .delete()
        .eq('token', token);

      setDone(true);

    } catch (err: any) {
      console.error('Full error:', err);
      setError(`Something went wrong: ${err?.message || JSON.stringify(err)}`);
    } finally {
      setLoading(false);
    }
  };

  const EyeIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  );

  const EyeOffIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  );

  const renderContent = () => {
    if (verifying) {
      return (
        <div className="rp-verifying">
          <span className="rp-spinner" />
          <p>Verifying your reset link...</p>
        </div>
      );
    }

    if (done) {
      return (
        <div className="rp-success">
          <div className="rp-success-icon">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
              <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
          </div>
          <p className="rp-success-text">Password reset successfully!</p>
          <p className="rp-success-sub">You can now log in with your new password.</p>
          <button className="rp-btn" onClick={() => navigate('/')}>
            Back to Login
          </button>
        </div>
      );
    }

    if (!tokenValid) {
      return (
        <div className="rp-success">
          <div className="rp-invalid-icon">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="15" y1="9" x2="9" y2="15"/>
              <line x1="9" y1="9" x2="15" y2="15"/>
            </svg>
          </div>
          <p className="rp-success-text">{error}</p>
          <button className="rp-btn" onClick={() => navigate('/forgot-password')}>
            Request New Link
          </button>
        </div>
      );
    }

    return (
      <form className="rp-form" onSubmit={handleSubmit}>
        {error && (
          <div className="rp-error">
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

        {/* New Password */}
        <div className="input-group">
          <span className="input-icon">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          </span>
          <input
            type={showPassword ? 'text' : 'password'}
            placeholder="New password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button type="button" className="rp-eye-btn"
            onClick={() => setShowPassword(p => !p)}>
            {showPassword ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        </div>

        {/* Confirm Password */}
        <div className="input-group">
          <span className="input-icon">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
          </span>
          <input
            type={showConfirm ? 'text' : 'password'}
            placeholder="Confirm new password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />
          <button type="button" className="rp-eye-btn"
            onClick={() => setShowConfirm(p => !p)}>
            {showConfirm ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        </div>

        <p className="rp-hint">Password must be at least 8 characters.</p>

        <button type="submit" className="rp-btn" disabled={loading}>
          {loading ? <span className="rp-spinner" /> : 'Reset Password'}
        </button>

        <a href="/forgot-password" className="rp-back-link">← Request a new link</a>
      </form>
    );
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

      <div className="rp-main-container">
        <div className="rp-card">
          <div className="rp-header">
            <div className="rp-icon">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
            </div>
            <h2 className="rp-title">Reset Password</h2>
            <p className="rp-subtitle">
              {done
                ? 'Your password has been updated.'
                : verifying
                ? 'Please wait while we verify your link.'
                : tokenValid
                ? 'Enter your new password below.'
                : 'Something went wrong with your link.'}
            </p>
          </div>

          {renderContent()}
        </div>
      </div>
    </div>
  );
}

export default ResetPassword;