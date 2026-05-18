import { useState, useEffect, useRef } from "react";
import { createWebSocket } from "../api";
import AuroraMap from "../components/AuroraMap";

const API_BASE = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:8000`;

const TRIAGE_COLORS = {
  CRITICAL: "#dc2626", HIGH: "#ea580c", MODERATE: "#ca8a04", LOW: "#16a34a",
};
const SEVERITY_COLORS = {
  CATASTROPHIC: "#991b1b", CRITICAL: "#dc2626", SEVERE: "#ea580c", MODERATE: "#ca8a04",
};
const URGENCY_COLORS = {
  IMMEDIATE: "#dc2626", WITHIN_15MIN: "#ea580c", WITHIN_1HR: "#ca8a04",
};
const PHASE_LABELS = {
  INITIAL_RESPONSE: "🔴 Initial Response", ACTIVE_RESCUE: "🟠 Active Rescue",
  STABILIZATION: "🟡 Stabilization", RECOVERY: "🟢 Recovery",
};
const EXAMPLE_QUESTIONS = [
  "Which zone needs help most urgently?",
  "Should I divert ambulances from Kothrud to Katraj?",
  "What is the biggest risk in the next 30 minutes?",
  "Do we have enough NDRF teams?",
];

export default function CommandCenter() {
  const token = localStorage.getItem("aurora_token");
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const [incidents, setIncidents] = useState([]);
  const [summary, setSummary] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [secondsAgo, setSecondsAgo] = useState(0);
  const [actionStatus, setActionStatus] = useState({});

  // Simulation
  const [simRunning, setSimRunning] = useState(false);
  const [simResult, setSimResult] = useState(null);

  // Gemma Chat
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState([]);
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef(null);

  // ── Fetch all data ──
  const fetchAll = async () => {
    try {
      const [incRes, sumRes] = await Promise.all([
        fetch(`${API_BASE}/api/admin/incidents`, { headers }),
        fetch(`${API_BASE}/api/admin/summary`, { headers }),
      ]);
      const incData = await incRes.json();
      const sumData = await sumRes.json();
      setIncidents(incData.incidents || []);
      setSummary(sumData.summary || {});
      setLastUpdated(new Date());
    } catch (e) {
      console.error("Fetch error:", e);
    }
  };

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 15000);
    const ws = createWebSocket("admin", (msg) => {
      if (msg.type === "new_incident" && msg.incident) {
        setIncidents(prev => [msg.incident, ...prev]);
      }
    });
    return () => { clearInterval(interval); ws.close(); };
  }, []);

  // Seconds-ago ticker
  useEffect(() => {
    const t = setInterval(() => {
      if (lastUpdated) setSecondsAgo(Math.round((Date.now() - lastUpdated.getTime()) / 1000));
    }, 1000);
    return () => clearInterval(t);
  }, [lastUpdated]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  // ── Actions ──
  const handleApprove = async (id) => {
    try {
      await fetch(`${API_BASE}/api/admin/approve/${id}`, { method: "POST", headers });
      setActionStatus(prev => ({ ...prev, [id]: "DISPATCHED" }));
    } catch (e) { console.error(e); }
  };
  const handleReject = async (id) => {
    try {
      await fetch(`${API_BASE}/api/admin/reject/${id}`, { method: "POST", headers });
      setActionStatus(prev => ({ ...prev, [id]: "REJECTED" }));
    } catch (e) { console.error(e); }
  };

  const sendChat = async (q) => {
    const question = q || chatInput.trim();
    if (!question || chatLoading) return;
    setChatInput("");
    setChatMessages(prev => [...prev, { role: "user", content: question }]);
    setChatLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/ai-chat`, {
        method: "POST", headers, body: JSON.stringify({ question }),
      });
      const data = await res.json();
      setChatMessages(prev => [...prev, { role: "ai", content: data.answer || "No response.", model: data.model }]);
    } catch {
      setChatMessages(prev => [...prev, { role: "ai", content: "Failed to reach Gemma." }]);
    } finally { setChatLoading(false); }
  };

  const runSimulation = async () => {
    setSimRunning(true); setSimResult(null);
    try {
      const res = await fetch(`${API_BASE}/api/simulate`, { method: "POST", headers });
      setSimResult(await res.json());
      setTimeout(fetchAll, 1000);
    } catch (e) { console.error(e); }
    finally { setSimRunning(false); }
  };

  // ── Helpers ──
  const getLevel = (inc) => (inc.triage_level || inc.triage?.triage_level || "MODERATE").toUpperCase();

  const sorted = [...incidents].sort((a, b) => {
    const order = { CRITICAL: 0, HIGH: 1, MODERATE: 2, LOW: 3 };
    return (order[getLevel(a)] ?? 2) - (order[getLevel(b)] ?? 2);
  });

  const cs = summary?.command_status || {};
  const ra = summary?.resource_allocation || {};
  const tf = summary?.timeline_forecast || {};

  // Resource bar helper
  const ResourceBar = ({ label, data, color }) => {
    const total = data?.total || 0;
    const deployed = data?.deployed || 0;
    const pct = total > 0 ? (deployed / total) * 100 : 0;
    return (
      <div style={{ marginBottom: "12px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", marginBottom: "4px" }}>
          <span style={{ color: "#d1d5db" }}>{label}</span>
          <span style={{ color }}>{deployed}/{total}</span>
        </div>
        <div style={{ height: "8px", borderRadius: "4px", background: "#1f2937" }}>
          <div style={{ width: `${pct}%`, height: "100%", borderRadius: "4px", background: color, transition: "width 0.5s" }} />
        </div>
        {data?.recommendation && (
          <div style={{ fontSize: "11px", color: "#6b7280", marginTop: "3px" }}>{data.recommendation}</div>
        )}
      </div>
    );
  };

  return (
    <div className="command-center glass-card">

      {/* ── Header ── */}
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px", marginBottom: "24px" }}>
        <div>
          <h2 className="gradient-text dashboard-title" style={{ margin: 0, fontSize: "22px" }}>Command Center</h2>
          <div style={{ display: "flex", gap: "8px", marginTop: "6px", alignItems: "center", flexWrap: "wrap" }}>
            {cs.phase && (
              <span style={{ background: "rgba(255,255,255,0.06)", color: "#d1d5db", padding: "3px 12px", borderRadius: "14px", fontSize: "12px" }}>
                {PHASE_LABELS[cs.phase] || cs.phase}
              </span>
            )}
            {cs.overall_severity && (
              <span style={{ background: "rgba(255,255,255,0.05)", color: "#a7a7a7", padding: "3px 12px", borderRadius: "14px", fontSize: "12px" }}>
                {cs.overall_severity}
              </span>
            )}
            <span style={{ color: "#646464", fontSize: "11px" }}>
              Active: {incidents.length} • Updated {secondsAgo}s ago
            </span>
          </div>
        </div>
        <button onClick={runSimulation} disabled={simRunning} style={{
          background: simRunning ? '#374151' : 'rgba(255,255,255,0.08)', color: simRunning ? '#9ca3af' : '#f1f5f9',
          padding: '10px 20px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)',
          cursor: simRunning ? 'wait' : 'pointer', fontWeight: '600', fontSize: '14px', fontFamily: 'Inter, sans-serif',
        }}>
          {simRunning ? 'Running...' : 'Run Simulation'}
        </button>
      </header>

      {/* Headline */}
      {cs.headline && (
        <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: "10px", padding: "12px 18px", marginBottom: "20px", borderLeft: "3px solid rgba(255,255,255,0.15)" }}>
          <span style={{ color: "#e5e7eb", fontSize: "15px" }}>{cs.headline}</span>
        </div>
      )}

      {/* Sim Results */}
      {simResult?.simulation_complete && (
        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "10px", padding: "12px", marginBottom: "20px" }}>
          <strong style={{ color: "#a7a7a7", fontSize: "12px" }}>Simulation: </strong>
          <span style={{ color: "#d1d5db", fontSize: "13px" }}>
            {simResult.incidents_processed} incidents — CRIT: {simResult.triage_summary?.CRITICAL || 0}, HIGH: {simResult.triage_summary?.HIGH || 0}, MOD: {simResult.triage_summary?.MODERATE || 0}
          </span>
        </div>
      )}

      {/* ══ MAP — Full Width at Top ══ */}
      <div style={{ borderRadius: "12px", overflow: "hidden", marginBottom: "28px", border: "1px solid rgba(255,255,255,0.06)" }}>
        <AuroraMap
          data={{
            epicenter: { lat: 18.5204, lon: 73.8567 },
            sosReports: incidents.map(i => ({
              lat: i.lat || 18.5204,
              lon: i.lon || 73.8567,
              message: i.message || '',
              severity: i.triage_level === 'CRITICAL' ? 5 : i.triage_level === 'HIGH' ? 4 : 3
            }))
          }}
          height={320}
        />
      </div>

      {/* ══ 2-Column Grid: Incidents+Chat | Intelligence+Resources ══ */}
      <div className="dash-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>

        {/* ═══ LEFT: Incidents + Gemma Chat ═══ */}
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

          {/* Incidents */}
          <div>
            <h3 style={{ color: "#a7a7a7", fontSize: "13px", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "14px", fontFamily: "Inter, sans-serif", fontWeight: 600 }}>
              Live Incidents ({incidents.length})
            </h3>
            <div style={{ maxHeight: "340px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "10px" }}>
              {sorted.length === 0 && <p style={{ color: "#4b5563", textAlign: "center", padding: "30px 0", fontSize: "13px" }}>No incidents. Run simulation.</p>}
              {sorted.map((inc, idx) => {
                const level = getLevel(inc);
                const id = inc.id || inc.incident_id || `i-${idx}`;
                const color = TRIAGE_COLORS[level] || TRIAGE_COLORS.MODERATE;
                const status = actionStatus[id];
                return (
                  <div key={id} style={{ background: "rgba(255,255,255,0.03)", borderRadius: "10px", padding: "14px", borderLeft: `3px solid ${color}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                      <span style={{ background: `${color}22`, color, padding: "2px 10px", borderRadius: "10px", fontSize: "11px", fontWeight: "700" }}>
                        {level}
                      </span>
                      <span style={{ color: "#4b5563", fontSize: "11px" }}>{inc.area || id}</span>
                    </div>
                    <p style={{ color: "#d1d5db", fontSize: "13px", margin: "6px 0 10px", lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                      {inc.message || inc.raw_message || "—"}
                    </p>
                    {status ? (
                      <div style={{ fontSize: "12px", fontWeight: "bold", textAlign: "center", padding: "6px", borderRadius: "6px", background: status === "DISPATCHED" ? "rgba(22,163,74,0.12)" : "rgba(220,38,38,0.12)", color: status === "DISPATCHED" ? "#4ade80" : "#fca5a5" }}>
                        {status === "DISPATCHED" ? "✓ DISPATCHED" : "✕ REJECTED"}
                      </div>
                    ) : (
                      <div style={{ display: "flex", gap: "8px" }}>
                        <button onClick={() => handleApprove(id)} style={{ flex: 1, padding: "7px", background: "rgba(22,163,74,0.12)", color: "#4ade80", border: "1px solid rgba(22,163,74,0.2)", borderRadius: "6px", fontSize: "12px", fontFamily: "Inter, sans-serif", cursor: "pointer" }}>Dispatch</button>
                        <button onClick={() => handleReject(id)} style={{ flex: 1, padding: "7px", background: "rgba(220,38,38,0.12)", color: "#fca5a5", border: "1px solid rgba(220,38,38,0.2)", borderRadius: "6px", fontSize: "12px", fontFamily: "Inter, sans-serif", cursor: "pointer" }}>Reject</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Gemma Chat */}
          <div style={{ background: "rgba(0,0,0,0.15)", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.05)", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
              <h3 style={{ margin: 0, fontSize: "13px", color: "#a7a7a7", fontFamily: "Inter, sans-serif", fontWeight: 600, textTransform: "uppercase", letterSpacing: "1px" }}>Gemma Advisor</h3>
            </div>
            <div style={{ padding: "8px 12px", display: "flex", flexWrap: "wrap", gap: "6px" }}>
              {EXAMPLE_QUESTIONS.map((q, i) => (
                <button key={i} onClick={() => sendChat(q)} style={{ background: "rgba(255,255,255,0.05)", color: "#a7a7a7", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "12px", padding: "4px 10px", fontSize: "11px", fontFamily: "Inter, sans-serif", cursor: "pointer" }}>{q}</button>
              ))}
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px", display: "flex", flexDirection: "column", gap: "8px", maxHeight: "260px" }}>
              {chatMessages.length === 0 && <p style={{ color: "#4b5563", fontSize: "12px", textAlign: "center", marginTop: "20px" }}>Ask Gemma...</p>}
              {chatMessages.map((m, i) => (
                <div key={i} style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "90%", padding: "10px 14px", borderRadius: "10px", background: m.role === "user" ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.04)", color: m.role === "user" ? "#f1f5f9" : "#d1d5db", fontSize: "13px", lineHeight: 1.5, border: "1px solid rgba(255,255,255,0.07)" }}>
                  {m.content}
                  {m.model && <div style={{ fontSize: "10px", color: "#4b5563", marginTop: "4px" }}>— {m.model}</div>}
                </div>
              ))}
              {chatLoading && <div style={{ alignSelf: "flex-start", padding: "10px 14px", borderRadius: "10px", background: "rgba(255,255,255,0.04)", color: "#a7a7a7", fontSize: "13px" }}>Thinking...</div>}
              <div ref={chatEndRef} />
            </div>
            <div style={{ padding: "10px 12px", borderTop: "1px solid rgba(255,255,255,0.05)", display: "flex", gap: "8px" }}>
              <input value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === "Enter" && sendChat()}
                placeholder="Ask Gemma..." style={{ flex: 1, padding: "9px 12px", borderRadius: "8px", background: "rgba(255,255,255,0.04)", color: "#f1f5f9", border: "1px solid rgba(255,255,255,0.08)", fontSize: "13px", fontFamily: "Inter, sans-serif", outline: "none" }} />
              <button onClick={() => sendChat()} disabled={chatLoading} style={{ padding: "9px 16px", background: "rgba(255,255,255,0.08)", color: "#f1f5f9", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", cursor: "pointer", fontFamily: "Inter, sans-serif", fontSize: "13px" }}>Send</button>
            </div>
          </div>
        </div>

        {/* ═══ RIGHT: Intelligence + Resources ═══ */}
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

          {/* Efficiency + Lives */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
            <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: "10px", padding: "16px", textAlign: "center", border: "1px solid rgba(255,255,255,0.05)" }}>
              <div style={{ fontSize: "28px", fontWeight: "700", color: "#f1f5f9" }}>{summary?.efficiency_score ?? "—"}</div>
              <div style={{ fontSize: "11px", color: "#646464", marginTop: "4px", fontFamily: "Inter, sans-serif", textTransform: "uppercase", letterSpacing: "0.5px" }}>Efficiency</div>
            </div>
            <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: "10px", padding: "16px", textAlign: "center", border: "1px solid rgba(255,255,255,0.05)" }}>
              <div style={{ fontSize: "28px", fontWeight: "700", color: "#f87171" }}>{summary?.lives_at_risk ?? "—"}</div>
              <div style={{ fontSize: "11px", color: "#646464", marginTop: "4px", fontFamily: "Inter, sans-serif", textTransform: "uppercase", letterSpacing: "0.5px" }}>At Risk</div>
            </div>
            <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: "10px", padding: "16px", textAlign: "center", border: "1px solid rgba(255,255,255,0.05)" }}>
              <div style={{ fontSize: "28px", fontWeight: "700", color: "#4ade80" }}>{summary?.lives_secured ?? "—"}</div>
              <div style={{ fontSize: "11px", color: "#646464", marginTop: "4px", fontFamily: "Inter, sans-serif", textTransform: "uppercase", letterSpacing: "0.5px" }}>Secured</div>
            </div>
          </div>

          {/* Commander Briefing */}
          {summary?.commander_briefing && (
            <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: "12px", padding: "18px", border: "1px solid rgba(255,255,255,0.06)" }}>
              <h3 style={{ color: "#a7a7a7", fontSize: "12px", textTransform: "uppercase", marginBottom: "10px", fontFamily: "Inter, sans-serif", fontWeight: 600, letterSpacing: "1px" }}>Commander Briefing</h3>
              <p style={{ color: "#e5e7eb", fontSize: "14px", lineHeight: 1.7, margin: 0 }}>{summary.commander_briefing}</p>
            </div>
          )}

          {/* Zone Analysis */}
          {summary?.zone_analysis?.length > 0 && (
            <div>
              <h3 style={{ color: "#a7a7a7", fontSize: "12px", textTransform: "uppercase", marginBottom: "12px", fontFamily: "Inter, sans-serif", fontWeight: 600, letterSpacing: "1px" }}>Zone Analysis</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {summary.zone_analysis.map((z, i) => (
                  <div key={i} style={{ background: "rgba(255,255,255,0.03)", borderRadius: "8px", padding: "12px 14px", borderLeft: `3px solid ${TRIAGE_COLORS[z.severity] || "#646464"}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                      <strong style={{ color: "#e5e7eb", fontSize: "13px" }}>{z.zone_name}</strong>
                      <span style={{ color: "#a7a7a7", fontSize: "11px" }}>{z.severity}</span>
                    </div>
                    <div style={{ color: "#9ca3af", fontSize: "12px" }}>{z.primary_threat}</div>
                    {z.gemma_assessment && <div style={{ color: "#646464", fontSize: "11px", marginTop: "4px", fontStyle: "italic" }}>{z.gemma_assessment}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Resource Bars */}
          <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: "12px", padding: "18px", border: "1px solid rgba(255,255,255,0.06)" }}>
            <h3 style={{ color: "#a7a7a7", fontSize: "12px", textTransform: "uppercase", marginBottom: "14px", fontFamily: "Inter, sans-serif", fontWeight: 600, letterSpacing: "1px" }}>Resources</h3>
            <ResourceBar label="Ambulances" data={ra.ambulances} color="#f87171" />
            <ResourceBar label="Fire Trucks" data={ra.fire_trucks} color="#fbbf24" />
            <ResourceBar label="NDRF Teams" data={ra.ndrf_teams} color="#60a5fa" />
          </div>

          {/* Timeline */}
          {(tf.next_30_min || tf.next_2_hours || tf.resolution_estimate) && (
            <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: "12px", padding: "18px", border: "1px solid rgba(255,255,255,0.06)" }}>
              <h3 style={{ color: "#a7a7a7", fontSize: "12px", textTransform: "uppercase", marginBottom: "14px", fontFamily: "Inter, sans-serif", fontWeight: 600, letterSpacing: "1px" }}>Timeline Forecast</h3>
              {[
                ["Next 30 min", tf.next_30_min],
                ["Next 2 hours", tf.next_2_hours],
                ["Resolution", tf.resolution_estimate],
              ].map(([label, text], i) => text && (
                <div key={i} style={{ display: "flex", gap: "12px", marginBottom: "10px", alignItems: "flex-start" }}>
                  <span style={{ color: "#a7a7a7", fontSize: "11px", fontWeight: "600", minWidth: "80px", fontFamily: "Inter, sans-serif" }}>{label}</span>
                  <span style={{ color: "#d1d5db", fontSize: "13px", lineHeight: 1.5 }}>{text}</span>
                </div>
              ))}
            </div>
          )}

          {/* Critical Decisions */}
          {summary?.critical_decisions?.length > 0 && (
            <div>
              <h3 style={{ color: "#a7a7a7", fontSize: "12px", textTransform: "uppercase", marginBottom: "12px", fontFamily: "Inter, sans-serif", fontWeight: 600, letterSpacing: "1px" }}>Critical Decisions</h3>
              {summary.critical_decisions.map((d, i) => (
                <div key={i} style={{ background: "rgba(255,255,255,0.03)", borderRadius: "8px", padding: "12px 14px", marginBottom: "8px", border: "1px solid rgba(255,255,255,0.06)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                    <span style={{ color: "#e5e7eb", fontSize: "13px", fontWeight: "600" }}>{d.decision}</span>
                    <span style={{ color: "#a7a7a7", fontSize: "11px" }}>{d.urgency}</span>
                  </div>
                  <div style={{ display: "flex", gap: "6px", marginBottom: "6px" }}>
                    {d.options?.map((opt, j) => (
                      <button key={j} onClick={() => sendChat(`Commander chose: "${opt}" for decision "${d.decision}". Analyze the consequences.`)}
                        style={{ flex: 1, padding: "7px", background: "rgba(255,255,255,0.05)", color: "#d1d5db", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "6px", fontSize: "12px", fontFamily: "Inter, sans-serif", cursor: "pointer" }}>
                        {opt}
                      </button>
                    ))}
                  </div>
                  {d.gemma_recommendation && <div style={{ color: "#a7a7a7", fontSize: "11px", fontStyle: "italic" }}>{d.gemma_recommendation}</div>}
                </div>
              ))}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

