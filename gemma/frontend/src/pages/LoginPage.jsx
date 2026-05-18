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
  min-height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
  background: transparent;

  .container {
    --form-width: 320px;
    --login-box-color: #272727;
    --input-color: #3a3a3a;
    --button-color: #e85002;
    --footer-color: rgba(255, 255, 255, 0.5);
    display: flex;
    justify-content: center;
    align-items: stretch;
    position: relative;
    overflow: hidden;
    background: var(--login-box-color);
    border-radius: 24px;
    width: calc(var(--form-width) + 2px);
    min-height: 480px;
    padding: 2px;
    z-index: 8;
    box-shadow:
      0 4px 8px rgba(0, 0, 0, 0.2),
      0 8px 16px rgba(0, 0, 0, 0.2),
      0 0 8px rgba(255, 255, 255, 0.1),
      0 0 16px rgba(255, 255, 255, 0.08);
  }

  .container::before {
    content: "";
    position: absolute;
    width: 800px;
    height: 800px;
    top: calc(50% - 400px);
    left: calc(50% - 400px);
    z-index: -2;
    background: conic-gradient(
      from 45deg,
      transparent 75%,
      var(--button-color),
      transparent 100%
    );
    animation: spin 4s linear infinite;
  }

  @keyframes spin {
    100% {
      transform: rotate(360deg);
    }
  }

  .login-box {
    background: var(--login-box-color);
    border-radius: 22px;
    padding: 30px;
    width: 100%;
    flex: 1;
    position: relative;
    z-index: 10;
    backdrop-filter: blur(15px);
    -webkit-backdrop-filter: blur(15px);
    box-shadow:
      inset 0 40px 60px -8px rgba(255, 255, 255, 0.12),
      inset 4px 0 12px -6px rgba(255, 255, 255, 0.12),
      inset 0 0 12px -4px rgba(255, 255, 255, 0.12);
  }

  .form {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .logo {
    width: 60px;
    height: 60px;
    background: linear-gradient(
      135deg,
      rgba(255, 255, 255, 0.2),
      rgba(0, 0, 0, 0.2)
    );
    box-shadow:
      8px 8px 16px rgba(0, 0, 0, 0.2),
      -8px -8px 16px rgba(255, 255, 255, 0.06);
    border-radius: 16px;
    border: 2px solid #fff;
    margin: 0 auto 10px;
    position: relative;
  }

  .logo::before {
    content: "";
    position: absolute;
    bottom: 8px;
    width: 50%;
    height: 20%;
    left: 25%;
    border-top-left-radius: 40px;
    border-top-right-radius: 40px;
    border-bottom-right-radius: 20px;
    border-bottom-left-radius: 20px;
    border: 2.5px solid #fff;
  }

  .logo::after {
    content: "";
    position: absolute;
    top: 8px;
    width: 30%;
    height: 30%;
    left: 35%;
    border-radius: 50%;
    border: 2.5px solid #fff;
  }

  .header {
    width: 100%;
    text-align: center;
    font-size: 24px;
    font-weight: bold;
    color: white;
    margin-bottom: 10px;
  }

  .input {
    width: 100%;
    padding: 12px 14px;
    border: 1px solid transparent;
    border-radius: 12px;
    background: var(--input-color);
    color: white;
    outline: none;
    font-size: 14px;
    font-family: inherit;
    transition: all 0.3s ease;
  }

  .input::placeholder {
    color: rgba(255, 255, 255, 0.4);
  }

  .input:focus {
    border: 1px solid var(--button-color);
    box-shadow: 0 0 8px rgba(232, 80, 2, 0.3);
  }

  .button {
    width: 100%;
    height: 44px;
    border: none;
    border-radius: 22px;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
    background: var(--button-color);
    color: white;
    transition: 0.3s;
    margin-top: 10px;
    box-shadow:
      0 4px 12px rgba(232, 80, 2, 0.3),
      inset 0px 2px 4px rgba(255, 255, 255, 0.3);
  }

  .button:hover:not(:disabled) {
    filter: brightness(1.1);
    transform: translateY(-2px);
    box-shadow:
      0 6px 16px rgba(232, 80, 2, 0.4),
      inset 0px 2px 4px rgba(255, 255, 255, 0.3);
  }

  .button:disabled {
    opacity: 0.5;
  }

  .footer {
    width: 100%;
    text-align: center;
    color: var(--footer-color);
    font-size: 13px;
    margin-top: 15px;
  }

  .footer .link {
    position: relative;
    color: white;
    font-weight: 600;
    text-decoration: none;
    transition: color 0.3s ease;
    margin-left: 4px;
  }

  .footer .link::after {
    content: "";
    position: absolute;
    left: 0;
    bottom: -2px;
    width: 0;
    height: 2px;
    border-radius: 2px;
    background: var(--button-color);
    transition: width 0.3s ease;
  }

  .footer .link:hover::after {
    width: 100%;
  }
`;

export default LoginPage;
