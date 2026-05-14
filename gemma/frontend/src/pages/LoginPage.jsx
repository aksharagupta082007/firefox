import React, { useState } from 'react';
import styled from 'styled-components';

const LoginPage = ({ setPage }) => {
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    console.log("Logging in with:", formData);
    try {
      const response = await fetch('http://localhost:8000/api/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData)
      });
      if (response.ok) {
        alert("Login successful!");
        setPage("demo"); // Navigate to demo or dashboard
      } else {
        alert("Invalid credentials.");
      }
    } catch (error) {
      console.error("Failed to fetch", error);
      alert("Login submitted (check console). API might not be implemented yet.");
      setPage("demo"); // Navigate to demo or dashboard
    }
  };

  return (
    <StyledWrapper>
      <div className="container">
        <div className="login-box">
          <form className="form" onSubmit={handleSubmit}>
            <div className="logo" />
            <span className="header">Welcome Back!</span>
            
            <input 
              type="email" 
              name="email"
              placeholder="Email" 
              className="input" 
              value={formData.email}
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

            <button type="submit" className="button sign-in">Sign In</button>
            
            <p className="footer">
              Don't have an account? 
              <a href="#" className="link" onClick={(e) => { e.preventDefault(); setPage("signup"); }}> Sign up, it's free!</a>
              <br/><br/>
              <a href="#" className="link">Forgot password?</a>
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
    align-items: center;
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
    inset: -50%;
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
    height: 100%;
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
    gap: 15px;
  }

  .logo {
    width: 65px;
    height: 65px;
    background: linear-gradient(
      135deg,
      rgba(255, 255, 255, 0.2),
      rgba(0, 0, 0, 0.2)
    );
    box-shadow:
      8px 8px 16px rgba(0, 0, 0, 0.2),
      -8px -8px 16px rgba(255, 255, 255, 0.06);
    border-radius: 20px;
    border: 2px solid #fff;
    margin: 0 auto 10px;
    position: relative;
  }

  .logo::before {
    content: "";
    position: absolute;
    bottom: 10px;
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
    top: 10px;
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
    margin-bottom: 15px;
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
    color: rgba(255,255,255,0.4);
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

  .button:hover {
    filter: brightness(1.1);
    transform: translateY(-2px);
    box-shadow:
      0 6px 16px rgba(232, 80, 2, 0.4),
      inset 0px 2px 4px rgba(255, 255, 255, 0.3);
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
