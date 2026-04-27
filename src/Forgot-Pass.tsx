import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from './lib/supabase';
import emailjs from '@emailjs/browser';
import './Forgot-Pass.css';

const EMAILJS_SERVICE_ID = 'service_oifba6a';
const EMAILJS_TEMPLATE_ID = 'template_277yee7';
const EMAILJS_PUBLIC_KEY = 'kGjJQKBUgXW-aizIa';

function generateToken(length = 32) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function ForgotPassword() {
  const navigate = useNavigate();
  const [dateTime, setDateTime] = useState(new Date());
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const timer = setInterval(() => setDateTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formattedDateTime = `${dateTime.toLocaleDateString('en-US')} (${dateTime.toLocaleTimeString('en-US')})`;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // 1. Check if email exists in users table
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('user_id, username, email')
        .eq('email', email)
        .single();

      if (userError || !user) {
        setError('No account found with that email address.');
        setLoading(false);
        return;
      }

      // 2. Generate token + 24 hour expiry
      const token = generateToken();
      const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      // 3. Delete any existing tokens for this user
      await supabase
        .from('password_resets')
        .delete()
        .eq('user_id', user.user_id);

      // 4. Save new token
      const { error: insertError } = await supabase
        .from('password_resets')
        .insert({ user_id: user.user_id, token, expires });

      if (insertError) {
        console.error('Insert error:', insertError);
        setError('Failed to generate reset token. Please try again.');
        setLoading(false);
        return;
      }

      // 5. Send email with reset link
      const resetLink = `${window.location.origin}/reset-password?token=${token}`;

      await emailjs.send(
        EMAILJS_SERVICE_ID,
        EMAILJS_TEMPLATE_ID,
        {
          to_email: email,
          username: user.username,
          reset_link: resetLink,
        },
        EMAILJS_PUBLIC_KEY
      );

      setSent(true);

    } catch (err: any) {
      console.error('Full error:', err);
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

      <div className="fp-main-container">
        <div className="fp-card">

          <div className="fp-header">
            <div className="fp-icon">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
            </div>
            <h2 className="fp-title">Forgot Password</h2>
            <p className="fp-subtitle">
              {sent
                ? "Check your email for the reset link."
                : "Enter your email and we'll send you a reset link."}
            </p>
          </div>

          {sent ? (
            <div className="fp-success">
              <div className="fp-success-icon">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                  <polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
              </div>
              <p className="fp-success-text">Reset link sent to <strong>{email}</strong></p>
              <p className="fp-success-sub">Check your inbox and follow the instructions.</p>
              <button className="fp-btn" onClick={() => navigate('/')}>
                Back to Login
              </button>
            </div>
          ) : (
            <form className="fp-form" onSubmit={handleSubmit}>
              {error && (
                <div className="fp-error">
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

              <div className="input-group">
                <span className="input-icon">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                    <polyline points="22,6 12,13 2,6"/>
                  </svg>
                </span>
                <input
                  type="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <button type="submit" className="fp-btn" disabled={loading}>
                {loading ? <span className="fp-spinner" /> : 'Send Reset Link'}
              </button>

              <a href="/" className="fp-back-link">← Back to Login</a>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export default ForgotPassword;