import { useState, useEffect, useRef } from "react";
import { createWebSocket } from "../api";
import AuroraMap from "../components/AuroraMap";

export default function ResponderDashboard() {
  const [dispatches, setDispatches] = useState([]);
  const [wsStatus, setWsStatus] = useState("connecting");
  const [currentLocation, setCurrentLocation] = useState({ lat: 18.5204, lon: 73.8567 });

  useEffect(() => {
    // 1. Connect to Responder WebSocket
    const ws = createWebSocket("responder", (msg) => {
      setWsStatus("online");
      if (msg.type === "new_dispatch") {
        setDispatches(prev => [msg, ...prev]);
        // Trigger notification sound or alert
        if (Notification.permission === "granted") {
          new Notification("New Dispatch Order", { body: msg.message });
        }
      }
    });

    ws.onopen = () => setWsStatus("online");
    ws.onclose = () => setWsStatus("offline");

    // 2. Request notification permission
    if (Notification.permission !== "granted") {
      Notification.requestPermission();
    }

    return () => ws.close();
  }, []);

  const handleComplete = (id) => {
    setDispatches(prev => prev.filter(d => d.incident_id !== id));
  };

  return (
    <div className="responder-dashboard glass-card">
      <header className="rd-header">
        <h2 className="gradient-text">Responder Tactical Dashboard</h2>
        <div className={`status-pill ${wsStatus === 'online' ? 'online' : 'alert'}`}>
          {wsStatus === 'online' ? '● System Connected' : '○ Connection Lost'}
        </div>
      </header>

      <div className="rd-grid">
        <aside className="rd-sidebar">
          <div className="active-dispatches">
            <h3>Active Dispatches</h3>
            {dispatches.length === 0 ? (
              <p className="text-muted">Waiting for deployment orders...</p>
            ) : (
              dispatches.map(d => (
                <div key={d.incident_id} className="dispatch-card alert">
                  <div className="dispatch-info">
                    <strong>DISPATCH ORDER</strong>
                    <p>{d.message}</p>
                    <span>Incident: {d.incident_id}</span>
                  </div>
                  <div className="dispatch-actions">
                    <button className="btn btn-primary" onClick={() => handleComplete(d.incident_id)}>Mark Arrived</button>
                    <button className="btn btn-outline">Safe Route</button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="responder-status info-box">
            <h3>Unit Status</h3>
            <p>ID: RES_PUNE_08</p>
            <p>Specialty: Medical / Search & Rescue</p>
            <p>Status: {dispatches.length > 0 ? 'EN ROUTE' : 'STANDBY'}</p>
          </div>
        </aside>

        <main className="rd-map-view">
          <AuroraMap 
            points={[
              { ...currentLocation, label: "Your Location", type: "responder" },
              ...dispatches.map(d => ({ lat: 18.53, lon: 73.86, label: "Target Site", type: "incident" })) // Mocked target
            ]}
            zoom={14}
          />
        </main>
      </div>
    </div>
  );
}
