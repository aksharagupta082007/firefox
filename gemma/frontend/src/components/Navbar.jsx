import React, { useState, useEffect } from "react";

function Navbar({ page, setPage, isAlert, navItems }) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <nav className={`navbar ${scrolled ? "scrolled" : ""}`}>
      <a className="navbar-brand" href="#" onClick={(e) => { e.preventDefault(); setPage("demo"); }}>
        <div className="logo"></div>
        <h1>AURORA TECH</h1>
      </a>

      <button className="hamburger" onClick={() => setMenuOpen(!menuOpen)}>
        ☰
      </button>

      <div className={`navbar-links ${menuOpen ? "open" : ""}`}>
        {navItems.map((item) => (
          <button
            key={item.id}
            className={`nav-link ${page === item.id ? "active" : ""}`}
            onClick={() => {
              setPage(item.id);
              setMenuOpen(false);
              // scroll to app section smoothly
              document.getElementById('app-section')?.scrollIntoView({ behavior: 'smooth' });
            }}
          >{item.label}
          </button>
        ))}
      </div>

      <div className="navbar-status">
        <span className="text-muted" style={{ fontSize: "0.75rem", fontFamily: "JetBrains Mono" }}>
          Pune, MH · Zone III
        </span>
        <span className={`status-pill ${isAlert ? "alert" : "online"}`}>
          {isAlert ? "ALERT" : "● Monitoring"}
        </span>
      </div>
    </nav>
  );
}

export default Navbar;