import React, { useState } from 'react';
import styled from 'styled-components';
import { api } from '../api';

const LoginPage = ({ onLogin, setPage }) => {
  const [formData, setFormData] = useState({
    username: '', // Changed from email to username to match OAuth2 form
    password: ''
  });
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const data = await api.login(formData.username, formData.password);
      if (data.access_token) {
        // Decode user info from token or use the 'user' object returned
        onLogin(data.user);
      } else {
        alert(data.detail || "Invalid credentials.");
      }
    } catch (error) {
      console.error("Login error", error);
      alert("Authentication failed. Please check your credentials.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <StyledWrapper>
      <div className="container">
        <div className="login-box">
          <form className="form" onSubmit={handleSubmit}>
            <div className="logo" />
            <span className="header">AURORA LOGIN</span>
            
            <input 
              type="text" 
              name="username"
              placeholder="Email or username" 
              className="input" 
              value={formData.username}
              onChange={handleChange}
              required
            />
            
            <input 
              type="password" 
              name="password"
              placeholder="Password" 
              className="input" 
              value={formData.password}
              onChange={handleChange}
              required
            />

            <button type="submit" className="button sign-in" disabled={loading}>
              {loading ? "Authenticating..." : "Sign In"}
            </button>
            
            <p className="footer">
              Don't have an account? 
              <a href="#" className="link" onClick={(e) => { e.preventDefault(); setPage("signup"); }}> Sign up</a>
            </p>
          </form>
        </div>
      </div>
    </StyledWrapper>
  );
}

const StyledWrapper = styled.div`
  /* ... existing styles ... */
  min-height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
  background: transparent;
  
  .container {
    --form-width: 320px;
    --login-box-color: #1a1a1a;
    --input-color: #272727;
    --button-color: #e85002;
    --footer-color: rgba(255, 255, 255, 0.5);
    display: flex;
    justify-content: center;
    align-items: center;
    position: relative;
    overflow: hidden;
    background: var(--login-box-color);
    border-radius: 24px;
    width: calc(var(--form-width) + 2px);
    min-height: 480px;
    padding: 2px;
    z-index: 8;
    box-shadow: 0 10px 30px rgba(0,0,0,0.5);
  }

  .container::before {
    content: "";
    position: absolute;
    inset: -50%;
    z-index: -2;
    background: conic-gradient(from 45deg, transparent 75%, var(--button-color), transparent 100%);
    animation: spin 4s linear infinite;
  }

  @keyframes spin { 100% { transform: rotate(360deg); } }

  .login-box {
    background: var(--login-box-color);
    border-radius: 22px;
    padding: 30px;
    width: 100%;
    height: 100%;
    position: relative;
    z-index: 10;
    backdrop-filter: blur(15px);
  }

  .form { display: flex; flex-direction: column; gap: 15px; }
  .logo { width: 65px; height: 65px; background: var(--button-color); border-radius: 20px; margin: 0 auto 10px; border: 2px solid white; }
  .header { width: 100%; text-align: center; font-size: 24px; font-weight: bold; color: white; margin-bottom: 15px; }
  .input { width: 100%; padding: 12px 14px; border-radius: 12px; background: var(--input-color); color: white; border: 1px solid transparent; outline: none; transition: 0.3s; }
  .input:focus { border-color: var(--button-color); }
  .button { width: 100%; height: 44px; border-radius: 22px; background: var(--button-color); color: white; font-weight: 700; cursor: pointer; border: none; transition: 0.3s; margin-top: 10px; }
  .button:hover:not(:disabled) { transform: translateY(-2px); filter: brightness(1.1); }
  .button:disabled { opacity: 0.5; }
  .footer { width: 100%; text-align: center; color: var(--footer-color); font-size: 13px; margin-top: 15px; }
  .footer .link { color: white; font-weight: 600; text-decoration: none; margin-left: 4px; }
`;

export default LoginPage;
