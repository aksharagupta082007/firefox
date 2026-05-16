import { useState, useEffect } from "react";
import { api, createWebSocket } from "../api";
import AuroraMap from "../components/AuroraMap";

export default function CommandCenter() {
  const [incidents, setIncidents] = useState([]);
  const [summary, setSummary] = useState(null);
  const [activeTab, setActiveTab] = useState("incidents");

  useEffect(() => {
    fetchData();
    const ws = createWebSocket("admin", (msg) => {
      if (msg.type === "new_incident") {
        setIncidents(prev => [msg, ...prev]);
      }
    });
    return () => ws.close();
  }, []);

  const fetchData = async () => {
    const incidentsData = await api.getActiveIncidents();
    const summaryData = await api.getOversightSummary();
    setIncidents(incidentsData.incidents || []);
    setSummary(summaryData.summary);
  };

  const handleApprove = async (id) => {
    await api.approveAction(id);
    fetchData();
  };

  return (
    <div className="command-center glass-card">
      <header className="cc-header">
        <h2 className="gradient-text">Command Center — Operational Intelligence</h2>
        <div className="cc-stats">
          <div className="stat-badge">Active: {incidents.length}</div>
          <div className="stat-badge alert">Critical: {incidents.filter(i => i.severity === 'critical').length}</div>
        </div>
      </header>

      <div className="cc-grid">
        <aside className="cc-sidebar">
          <nav className="cc-nav">
            <button className={`nav-btn ${activeTab === 'incidents' ? 'active' : ''}`} onClick={() => setActiveTab('incidents')}>Incidents</button>
            <button className={`nav-btn ${activeTab === 'oversight' ? 'active' : ''}`} onClick={() => setActiveTab('oversight')}>Strategic Oversight</button>
          </nav>

          <div className="cc-list-container">
            {activeTab === 'incidents' ? (
              <div className="incident-list">
                {incidents.map(inc => (
                  <div key={inc.id || inc.incident_id} className={`incident-item ${inc.severity}`}>
                    <div className="incident-info">
                      <strong>{inc.severity.toUpperCase()}</strong>
                      <span>{inc.incident_id}</span>
                      <p>{inc.raw_message}</p>
                    </div>
                    <button className="btn-approve" onClick={() => handleApprove(inc.incident_id)}>Approve Dispatch</button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="oversight-briefing">
                {summary ? (
                  <>
                    <h3>Strategic Synthesis</h3>
                    <p>{summary.operational_briefing}</p>
                    <h4>Bottlenecks</h4>
                    <ul>{summary.bottlenecks?.map((b, i) => <li key={i}>{b}</li>)}</ul>
                    <div className="efficiency-meter">
                      <span>Efficiency: {summary.system_efficiency_score}%</span>
                      <div className="meter-bar" style={{ width: `${summary.system_efficiency_score}%` }}></div>
                    </div>
                  </>
                ) : <p>Generating synthesis...</p>}
              </div>
            )}
          </div>
        </aside>

        <main className="cc-map-view">
          <AuroraMap 
            points={incidents.map(i => ({ lat: i.lat, lon: i.lon, label: i.severity }))}
            zoom={12}
          />
        </main>
      </div>
    </div>
  );
}
