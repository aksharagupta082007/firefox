import React from "react";

function Footer() {
    return (
        <footer style={{
            padding: '24px', 
            textAlign: 'center', 
            borderTop: '1px solid rgba(255, 255, 255, 0.05)',
            color: 'var(--text-muted)',
            fontSize: '0.85rem'
        }}>
            <p>AURORA TECH v1.0 — Track 5: Global Resilience</p>
            <p style={{ marginTop: '4px' }}>Powered by Gemma 4 + Ollama</p>
        </footer>
    );
}

export default Footer;
