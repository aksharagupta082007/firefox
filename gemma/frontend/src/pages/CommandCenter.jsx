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
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px", marginBottom: "16px" }}>
        <div>
          <h2 className="gradient-text" style={{ margin: 0, fontSize: "22px" }}>Command Center</h2>
          <div style={{ display: "flex", gap: "8px", marginTop: "6px", alignItems: "center", flexWrap: "wrap" }}>
            {cs.phase && (
              <span style={{ background: "rgba(124,58,237,0.2)", color: "#c4b5fd", padding: "3px 12px", borderRadius: "14px", fontSize: "12px", fontWeight: "bold" }}>
                {PHASE_LABELS[cs.phase] || cs.phase}
              </span>
            )}
            {cs.overall_severity && (
              <span style={{ background: `${SEVERITY_COLORS[cs.overall_severity] || "#ca8a04"}33`, color: SEVERITY_COLORS[cs.overall_severity] || "#ca8a04", padding: "3px 12px", borderRadius: "14px", fontSize: "12px", fontWeight: "bold" }}>
                {cs.overall_severity}
              </span>
            )}
            <span style={{ color: "#6b7280", fontSize: "11px" }}>
              Active: {incidents.length} • Updated {secondsAgo}s ago
            </span>
          </div>
        </div>
        <button onClick={runSimulation} disabled={simRunning} style={{
          background: simRunning ? '#6b21a8' : '#7c3aed', color: 'white',
          padding: '10px 20px', borderRadius: '8px', border: 'none',
          cursor: simRunning ? 'wait' : 'pointer', fontWeight: 'bold', fontSize: '14px',
        }}>
          {simRunning ? '⏳ Running...' : '🎮 Run Simulation'}
        </button>
      </header>

      {/* Headline */}
      {cs.headline && (
        <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: "10px", padding: "12px 18px", marginBottom: "16px", borderLeft: "4px solid #7c3aed" }}>
          <span style={{ color: "#e5e7eb", fontSize: "16px", fontWeight: "bold" }}>{cs.headline}</span>
        </div>
      )}

      {/* Sim Results */}
      {simResult?.simulation_complete && (
        <div style={{ background: "rgba(124,58,237,0.08)", border: "1px solid rgba(124,58,237,0.2)", borderRadius: "10px", padding: "14px", marginBottom: "16px" }}>
          <strong style={{ color: "#c4b5fd", fontSize: "13px" }}>Simulation: </strong>
          <span style={{ color: "#d1d5db", fontSize: "13px" }}>
            {simResult.incidents_processed} incidents — CRIT: {simResult.triage_summary?.CRITICAL || 0}, HIGH: {simResult.triage_summary?.HIGH || 0}, MOD: {simResult.triage_summary?.MODERATE || 0}
          </span>
        </div>
      )}

      {/* ══ 3-Column Grid ══ */}
      <div style={{ display: "grid", gridTemplateColumns: "300px 1fr 320px", gap: "16px" }}>

        {/* ═══ LEFT: Incidents ═══ */}
        <div style={{ maxHeight: "700px", overflowY: "auto" }}>
          <h3 style={{ color: "#9ca3af", fontSize: "12px", textTransform: "uppercase", marginBottom: "10px" }}>Live Incidents ({incidents.length})</h3>
          {sorted.length === 0 && <p style={{ color: "#4b5563", textAlign: "center", padding: "30px 0", fontSize: "13px" }}>No incidents. Run simulation.</p>}
          {sorted.map((inc, idx) => {
            const level = getLevel(inc);
            const id = inc.id || inc.incident_id || `i-${idx}`;
            const color = TRIAGE_COLORS[level] || TRIAGE_COLORS.MODERATE;
            const status = actionStatus[id];
            return (
              <div key={id} style={{ background: "rgba(255,255,255,0.03)", borderRadius: "8px", padding: "10px", marginBottom: "8px", borderLeft: `3px solid ${color}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                  <span style={{ background: color, color: "white", padding: "1px 8px", borderRadius: "10px", fontSize: "10px", fontWeight: "bold", animation: level === "CRITICAL" ? "pulse 1s infinite" : "none" }}>
                    {level}
                  </span>
                  <span style={{ color: "#4b5563", fontSize: "10px" }}>{inc.area || id}</span>
                </div>
                <p style={{ color: "#d1d5db", fontSize: "12px", margin: "4px 0", lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                  {inc.message || inc.raw_message || "—"}
                </p>
                {status ? (
                  <div style={{ fontSize: "11px", fontWeight: "bold", textAlign: "center", padding: "4px", borderRadius: "4px", marginTop: "6px", background: status === "DISPATCHED" ? "rgba(22,163,74,0.15)" : "rgba(220,38,38,0.15)", color: status === "DISPATCHED" ? "#4ade80" : "#fca5a5" }}>
                    {status === "DISPATCHED" ? "✅ DISPATCHED" : "❌ REJECTED"}
                  </div>
                ) : (
                  <div style={{ display: "flex", gap: "6px", marginTop: "6px" }}>
                    <button onClick={() => handleApprove(id)} style={{ flex: 1, padding: "4px", background: "#16a34a", color: "white", border: "none", borderRadius: "4px", fontSize: "11px", fontWeight: "bold", cursor: "pointer" }}>✅ Dispatch</button>
                    <button onClick={() => handleReject(id)} style={{ flex: 1, padding: "4px", background: "#dc2626", color: "white", border: "none", borderRadius: "4px", fontSize: "11px", fontWeight: "bold", cursor: "pointer" }}>❌ Reject</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ═══ MIDDLE: Intelligence Report ═══ */}
        <div style={{ maxHeight: "700px", overflowY: "auto" }}>
          {/* Commander Briefing */}
          {summary?.commander_briefing && (
            <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: "10px", padding: "16px", marginBottom: "16px" }}>
              <h4 style={{ color: "#9ca3af", fontSize: "11px", textTransform: "uppercase", marginBottom: "8px" }}>Commander Briefing</h4>
              <p style={{ color: "#f3f4f6", fontSize: "14px", lineHeight: 1.7, margin: 0 }}>{summary.commander_briefing}</p>
            </div>
          )}

          {/* Zone Analysis */}
          {summary?.zone_analysis?.length > 0 && (
            <div style={{ marginBottom: "16px" }}>
              <h4 style={{ color: "#9ca3af", fontSize: "11px", textTransform: "uppercase", marginBottom: "8px" }}>Zone Analysis</h4>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                {summary.zone_analysis.map((z, i) => (
                  <div key={i} style={{ background: "rgba(255,255,255,0.03)", borderRadius: "8px", padding: "10px", borderLeft: `3px solid ${TRIAGE_COLORS[z.severity] || "#ca8a04"}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                      <strong style={{ color: "#e5e7eb", fontSize: "13px" }}>{z.zone_name}</strong>
                      <span style={{ background: TRIAGE_COLORS[z.severity] || "#ca8a04", color: "white", padding: "1px 6px", borderRadius: "8px", fontSize: "9px", fontWeight: "bold" }}>{z.severity}</span>
                    </div>
                    <div style={{ color: "#9ca3af", fontSize: "11px" }}>{z.primary_threat}</div>
                    <div style={{ color: "#6b7280", fontSize: "10px", marginTop: "4px" }}>
                      {z.people_at_risk && `${z.people_at_risk} at risk`}{z.incident_count ? ` • ${z.incident_count} incidents` : ""}
                    </div>
                    {z.gemma_assessment && <div style={{ color: "#a78bfa", fontSize: "10px", fontStyle: "italic", marginTop: "4px" }}>{z.gemma_assessment}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Critical Decisions */}
          {summary?.critical_decisions?.length > 0 && (
            <div style={{ marginBottom: "16px" }}>
              <h4 style={{ color: "#9ca3af", fontSize: "11px", textTransform: "uppercase", marginBottom: "8px" }}>Critical Decisions</h4>
              {summary.critical_decisions.map((d, i) => (
                <div key={i} style={{ background: "rgba(255,255,255,0.03)", borderRadius: "8px", padding: "12px", marginBottom: "8px", borderLeft: `3px solid ${URGENCY_COLORS[d.urgency] || "#ca8a04"}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                    <span style={{ color: "#e5e7eb", fontSize: "13px", fontWeight: "bold" }}>{d.decision}</span>
                    <span style={{ color: URGENCY_COLORS[d.urgency] || "#ca8a04", fontSize: "10px", fontWeight: "bold" }}>{d.urgency}</span>
                  </div>
                  <div style={{ display: "flex", gap: "6px", marginBottom: "6px" }}>
                    {d.options?.map((opt, j) => (
                      <button key={j} onClick={() => sendChat(`Commander chose: "${opt}" for decision "${d.decision}". Analyze the consequences.`)}
                        style={{ flex: 1, padding: "6px", background: "#374151", color: "#d1d5db", border: "1px solid #4b5563", borderRadius: "6px", fontSize: "11px", cursor: "pointer" }}>
                        {opt}
                      </button>
                    ))}
                  </div>
                  {d.gemma_recommendation && <div style={{ color: "#a78bfa", fontSize: "11px", fontStyle: "italic" }}>Gemma: {d.gemma_recommendation}</div>}
                </div>
              ))}
            </div>
          )}

          {/* Timeline */}
          {(tf.next_30_min || tf.next_2_hours || tf.resolution_estimate) && (
            <div style={{ marginBottom: "16px" }}>
              <h4 style={{ color: "#9ca3af", fontSize: "11px", textTransform: "uppercase", marginBottom: "8px" }}>Timeline Forecast</h4>
              {[
                ["Next 30 min", tf.next_30_min, "#f87171"],
                ["Next 2 hours", tf.next_2_hours, "#fbbf24"],
                ["Resolution", tf.resolution_estimate, "#4ade80"],
              ].map(([label, text, color], i) => text && (
                <div key={i} style={{ display: "flex", gap: "10px", marginBottom: "6px", alignItems: "flex-start" }}>
                  <span style={{ color, fontSize: "11px", fontWeight: "bold", minWidth: "80px" }}>{label}</span>
                  <span style={{ color: "#d1d5db", fontSize: "12px", lineHeight: 1.4 }}>{text}</span>
                </div>
              ))}
            </div>
          )}

          {/* Map */}
          <div style={{ borderRadius: "10px", overflow: "hidden", minHeight: "250px" }}>
            <AuroraMap points={incidents.map(i => ({ lat: i.lat, lon: i.lon, label: getLevel(i) }))} zoom={12} />
          </div>
        </div>

        {/* ═══ RIGHT: Resources + Chat ═══ */}
        <div style={{ display: "flex", flexDirection: "column", gap: "12px", maxHeight: "700px" }}>

          {/* Efficiency Score */}
          <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: "10px", padding: "16px", textAlign: "center" }}>
            <div style={{ position: "relative", width: "80px", height: "80px", margin: "0 auto 8px" }}>
              <svg viewBox="0 0 36 36" style={{ width: "100%", height: "100%", transform: "rotate(-90deg)" }}>
                <circle cx="18" cy="18" r="15.5" fill="none" stroke="#1f2937" strokeWidth="3" />
                <circle cx="18" cy="18" r="15.5" fill="none"
                  stroke={summary?.efficiency_score >= 7 ? "#4ade80" : summary?.efficiency_score >= 4 ? "#fbbf24" : "#f87171"}
                  strokeWidth="3" strokeDasharray={`${(summary?.efficiency_score || 0) * 9.74} 97.4`}
                  strokeLinecap="round" style={{ transition: "stroke-dasharray 0.8s" }} />
              </svg>
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "20px", fontWeight: "bold", color: "#e5e7eb" }}>
                {summary?.efficiency_score ?? "—"}
              </div>
            </div>
            <div style={{ color: "#9ca3af", fontSize: "11px" }}>Efficiency Score</div>
          </div>

          {/* Lives Counters */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
            <div style={{ background: "rgba(220,38,38,0.08)", borderRadius: "8px", padding: "10px", textAlign: "center" }}>
              <div style={{ fontSize: "22px", fontWeight: "bold", color: "#f87171" }}>{summary?.lives_at_risk ?? "—"}</div>
              <div style={{ fontSize: "10px", color: "#9ca3af" }}>At Risk</div>
            </div>
            <div style={{ background: "rgba(22,163,74,0.08)", borderRadius: "8px", padding: "10px", textAlign: "center" }}>
              <div style={{ fontSize: "22px", fontWeight: "bold", color: "#4ade80" }}>{summary?.lives_secured ?? "—"}</div>
              <div style={{ fontSize: "10px", color: "#9ca3af" }}>Secured</div>
            </div>
          </div>

          {/* Resource Bars */}
          <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: "10px", padding: "14px" }}>
            <h4 style={{ color: "#9ca3af", fontSize: "11px", textTransform: "uppercase", marginBottom: "10px" }}>Resources</h4>
            <ResourceBar label="Ambulances" data={ra.ambulances} color="#f87171" />
            <ResourceBar label="Fire Trucks" data={ra.fire_trucks} color="#fbbf24" />
            <ResourceBar label="NDRF Teams" data={ra.ndrf_teams} color="#60a5fa" />
          </div>

          {/* Gemma Chat */}
          <div style={{ flex: 1, background: "rgba(0,0,0,0.2)", borderRadius: "10px", display: "flex", flexDirection: "column", minHeight: "200px" }}>
            <div style={{ padding: "10px 14px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <h4 style={{ margin: 0, fontSize: "13px", color: "#c4b5fd" }}>🧠 Gemma Advisor</h4>
            </div>
            <div style={{ padding: "6px 10px", display: "flex", flexWrap: "wrap", gap: "4px" }}>
              {EXAMPLE_QUESTIONS.map((q, i) => (
                <button key={i} onClick={() => sendChat(q)} style={{ background: "#374151", color: "#d1d5db", border: "none", borderRadius: "12px", padding: "3px 8px", fontSize: "10px", cursor: "pointer" }}>{q}</button>
              ))}
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "8px 10px", display: "flex", flexDirection: "column", gap: "6px" }}>
              {chatMessages.length === 0 && <p style={{ color: "#4b5563", fontSize: "11px", textAlign: "center", marginTop: "20px" }}>Ask Gemma...</p>}
              {chatMessages.map((m, i) => (
                <div key={i} style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "90%", padding: "6px 10px", borderRadius: "8px", background: m.role === "user" ? "#7c3aed" : "rgba(255,255,255,0.05)", color: m.role === "user" ? "white" : "#d1d5db", fontSize: "12px", lineHeight: 1.4 }}>
                  {m.content}
                  {m.model && <div style={{ fontSize: "9px", color: "#6b7280", marginTop: "3px" }}>— {m.model}</div>}
                </div>
              ))}
              {chatLoading && <div style={{ alignSelf: "flex-start", padding: "6px 10px", borderRadius: "8px", background: "rgba(255,255,255,0.05)", color: "#a78bfa", fontSize: "12px" }}>Thinking...</div>}
              <div ref={chatEndRef} />
            </div>
            <div style={{ padding: "8px 10px", borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", gap: "6px" }}>
              <input value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === "Enter" && sendChat()}
                placeholder="Ask Gemma..." style={{ flex: 1, padding: "6px 10px", borderRadius: "6px", background: "#1f2937", color: "white", border: "1px solid #374151", fontSize: "12px", outline: "none" }} />
              <button onClick={() => sendChat()} disabled={chatLoading} style={{ padding: "6px 12px", background: "#7c3aed", color: "white", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: "bold", fontSize: "12px" }}>➤</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
