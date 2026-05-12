import { useState, useCallback } from 'react';
import './index.css';
import DemoSimulator from './pages/DemoSimulator';
import ResponderDashboard from './pages/ResponderDashboard';
import CitizenApp from './pages/CitizenApp';

type Page = 'demo' | 'responder' | 'citizen';

const NAV_ITEMS: { id: Page; icon: string; label: string }[] = [
  { id: 'demo', icon: '🎯', label: 'Demo Simulator' },
  { id: 'responder', icon: '🏛️', label: 'Command Center' },
  { id: 'citizen', icon: '📱', label: 'Citizen Mode' },
];

export default function App() {
  const [page, setPage] = useState<Page>('demo');
  const [isAlert, setIsAlert] = useState(false);

  // Shared state: latest pipeline result flows directly from Simulator → Command Center
  const [latestResult, setLatestResult] = useState<any>(null);

  const handleSimulationComplete = useCallback((data: any) => {
    setLatestResult(data);
    // Auto-navigate to Command Center after simulation
    setPage('responder');
    // Update alert status based on decision
    const status = data?.layers?.['4_verification']?.decision?.status;
    setIsAlert(status === 'CRITICAL' || status === 'EMERGENCY');
  }, []);

  return (
    <div className={`app-layout ${page === 'citizen' ? 'citizen-mode' : ''}`}>
      {/* ── Navbar ─────────────────────────────────────── */}
      <nav className="navbar">
        <a className="navbar-brand" href="#" onClick={() => setPage('demo')}>
          <div className="logo">AT</div>
          <h1>AURORA TECH</h1>
        </a>
        <div className="navbar-status">
          <span className="text-muted" style={{ fontSize: '0.75rem', fontFamily: 'JetBrains Mono' }}>
            Pune, MH · Zone III
          </span>
          <span className={`status-pill ${isAlert ? 'alert' : 'online'}`}>
            {isAlert ? '🚨 ALERT' : '● Monitoring'}
          </span>
        </div>
      </nav>

      {/* ── Sidebar (hidden in citizen mode) ──────────── */}
      {page !== 'citizen' && (
        <aside className="sidebar">
          {NAV_ITEMS.map(item => (
            <button key={item.id}
              className={`sidebar-link ${page === item.id ? 'active' : ''}`}
              onClick={() => setPage(item.id)}>
              <span className="icon">{item.icon}</span>
              {item.label}
            </button>
          ))}
          <div style={{ flex: 1 }} />
          <div style={{ padding: '16px 12px', borderTop: '1px solid var(--border-subtle)' }}>
            <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 4 }}>
              AURORA TECH v1.0
            </p>
            <p style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
              Track 5: Global Resilience<br />
              Gemma 4 + Ollama
            </p>
          </div>
        </aside>
      )}

      {/* ── Main Content ──────────────────────────────── */}
      <main className="main-content">
        <div style={{ display: page === 'demo' ? 'block' : 'none' }}>
          <DemoSimulator onSimulationComplete={handleSimulationComplete} />
        </div>
        <div style={{ display: page === 'responder' ? 'block' : 'none' }}>
          <ResponderDashboard
            pipelineResult={latestResult}
            onGoToSimulator={() => setPage('demo')}
          />
        </div>
        <div style={{ display: page === 'citizen' ? 'block' : 'none' }}>
          <button className="btn btn-outline" style={{ marginBottom: 16 }}
            onClick={() => setPage('demo')}>
            ← Back to Dashboard
          </button>
          <CitizenApp />
        </div>
      </main>
    </div>
  );
}
