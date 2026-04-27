import React, { useState } from "react";
import "./Login.css";
import { FaEye, FaEyeSlash } from "react-icons/fa";

interface Props {
  onLogin: (username: string) => void;
}

export const Login: React.FC<Props> = ({ onLogin }) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="login-container">
      <div className="login-box">
        <h2>Welcome Back</h2>
        <p className="subtitle">Please login to continue</p>

        <div className="input-group">
          <label>Username</label>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="admin / warehouse / sales"
          />
        </div>

        <div className="input-group">
          <label>Password</label>

          <div className="password-wrapper">
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />

            <span
              className="toggle-password"
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? <FaEyeSlash /> : <FaEye />}
            </span>
          </div>
        </div>

        <button className="btn-login" onClick={() => onLogin(username)}>
          Login
        </button>
      </div>
    </div>
  );
};

export default Login;
