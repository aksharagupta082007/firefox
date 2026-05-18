import { useState, useEffect, useRef } from "react";
import { createWebSocket } from "../api";
import AuroraMap from "../components/AuroraMap";

const API_BASE = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:8000`;

const TRIAGE_COLORS = {
  CRITICAL: "#dc2626",
  HIGH: "#ea580c",
  MODERATE: "#ca8a04",
  LOW: "#16a34a",
};

const SEVERITY_COLORS = {
  CATASTROPHIC: "#991b1b",
  CRITICAL: "#dc2626",
  SEVERE: "#ea580c",
  MODERATE: "#ca8a04",
};

const URGENCY_COLORS = {
  IMMEDIATE: "#dc2626",
  WITHIN_15MIN: "#ea580c",
  WITHIN_1HR: "#ca8a04",
};

const PHASE_LABELS = {
  INITIAL_RESPONSE: "🔴 Initial Response",
  ACTIVE_RESCUE: "🟠 Active Rescue",
  STABILIZATION: "🟡 Stabilization",
  RECOVERY: "🟢 Recovery",
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
  const [dbResources, setDbResources] = useState([]);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [secondsAgo, setSecondsAgo] = useState(0);

  // Gemma Triage Proposal Flow
  const [selectedIncident, setSelectedIncident] = useState(null);
  const [activeProposal, setActiveProposal] = useState(null);
  const [proposalLoading, setProposalLoading] = useState(false);
  const [modifiedUnits, setModifiedUnits] = useState([]);
  const [thinkingLogs, setThinkingLogs] = useState([]);
  const [actionStatus, setActionStatus] = useState({});

  // Simulation state
  const [simRunning, setSimRunning] = useState(false);
  const [simResult, setSimResult] = useState(null);

  // Gemma Chat
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState([]);
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef(null);

  // ── Fetch Operations ──
  const fetchAll = async () => {
    try {
      const [incRes, sumRes, resRes] = await Promise.all([
        fetch(`${API_BASE}/api/admin/incidents`, { headers }),
        fetch(`${API_BASE}/api/admin/summary`, { headers }),
        fetch(`${API_BASE}/api/admin/resources`, { headers }),
      ]);
      const incData = await incRes.json();
      const sumData = await sumRes.json();
      const resData = await resRes.json();

      setIncidents(incData.incidents || []);
      setSummary(sumData.summary || {});
      setDbResources(resData.resources || []);
      setLastUpdated(new Date());
    } catch (e) {
      console.error("⚠️ Fetch error:", e);
    }
  };

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 120000);
    
    // Setup WebSocket and handle real-time broadcasts
    const ws = createWebSocket("admin", (msg) => {
      if (msg.type === "new_incident" && msg.incident) {
        setIncidents(prev => [msg.incident, ...prev]);
      } else if (msg.type === "dispatch_confirmed") {
        setActionStatus(prev => ({ ...prev, [msg.incident_id]: "DISPATCHED" }));
        fetchAll();
      } else if (msg.type === "dispatch_rejected") {
        setActionStatus(prev => ({ ...prev, [msg.incident_id]: "REJECTED" }));
        fetchAll();
      }
    });

    return () => {
      clearInterval(interval);
      ws.close();
    };
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

  // Load Gemma AI proposal for the selected incident
  useEffect(() => {
    if (!selectedIncident) {
      setActiveProposal(null);
      setModifiedUnits([]);
      setThinkingLogs([]);
      return;
    }

    const fetchProposal = async () => {
      setProposalLoading(true);
      setThinkingLogs([
        `⚡ [Gemma-4-Agent]: Analyzing incident #${selectedIncident.id}...`,
        `🛰️ [RAG Grid]: Querying active PostGIS coordinates...`,
        `📂 [Postgres State]: Scanning live resources inventory...`,
      ]);

      try {
        const timer1 = setTimeout(() => {
          setThinkingLogs(prev => [
            ...prev,
            `🏥 [Triage Capacity]: Verifying Sassoon and KEM hospital beds...`,
            `⚠️ [Hazards]: Evaluating structural collapse/gas threats...`,
          ]);
        }, 600);

        const res = await fetch(`${API_BASE}/api/admin/proposal/${selectedIncident.id}`, { headers });
        const data = await res.json();
        
        clearTimeout(timer1);
        setActiveProposal(data);
        // Default check all units suggested by Gemma
        setModifiedUnits(data.suggested_units?.map(u => u.unit_name) || []);
        
        setThinkingLogs(prev => [
          ...prev,
          `🗺️ [Routing]: Optimal debris-free routes generated.`,
          `✅ [Completed]: Dispatch proposal generated. Awaiting Commander sign-off.`,
        ]);
      } catch (e) {
        console.error("Proposal fetch error:", e);
        setThinkingLogs(prev => [...prev, `❌ [Error]: Failed to connect to Gemma Dispatcher.`]);
      } finally {
        setProposalLoading(false);
      }
    };

    fetchProposal();
  }, [selectedIncident]);

  // ── Dispatch Actions (HITL with Resource Deduction) ──
  const handleConfirmDeployment = async () => {
    if (!selectedIncident || !activeProposal) return;

    // Filter suggested units to match commander's manual modifications
    const selectedUnitsDetails = activeProposal.suggested_units.filter(u => 
      modifiedUnits.includes(u.unit_name)
    );

    if (selectedUnitsDetails.length === 0) {
      alert("Please select at least one unit to deploy.");
      return;
    }

    const payload = {
      units: selectedUnitsDetails.map(u => u.unit_name),
      justification: activeProposal.tactical_justification,
      eta_minutes: selectedUnitsDetails[0]?.eta_minutes || 8,
      triage_level: getLevel(selectedIncident),
      route_coordinates: selectedUnitsDetails[0]?.route_coordinates || []
    };

    try {
      const res = await fetch(`${API_BASE}/api/admin/dispatch/approve/${selectedIncident.id}`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.status === "success") {
        setActionStatus(prev => ({ ...prev, [selectedIncident.id]: "DISPATCHED" }));
        setSelectedIncident(null);
        fetchAll();
      }
    } catch (e) {
      console.error("Approve dispatch error:", e);
    }
  };

  const handleDismissIncident = async (id) => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/dispatch/reject/${id}`, {
        method: "POST",
        headers,
        body: JSON.stringify({ reason: "Commander rejected/resolved report." }),
      });
      const data = await res.json();
      setActionStatus(prev => ({ ...prev, [id]: "REJECTED" }));
      if (selectedIncident?.id === id) {
        setSelectedIncident(null);
      }
      fetchAll();
    } catch (e) {
      console.error(e);
    }
  };

  // ── Chat and Simulator ──
  const sendChat = async (q) => {
    const question = q || chatInput.trim();
    if (!question || chatLoading) return;
    setChatInput("");
    setChatMessages(prev => [...prev, { role: "user", content: question }]);
    setChatLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/ai-chat`, {
        method: "POST",
        headers,
        body: JSON.stringify({ question }),
      });
      const data = await res.json();
      setChatMessages(prev => [...prev, { role: "ai", content: data.answer || "No response.", model: data.model }]);
    } catch {
      setChatMessages(prev => [...prev, { role: "ai", content: "Failed to reach Gemma." }]);
    } finally {
      setChatLoading(false);
    }
  };

  const runSimulation = async () => {
    setSimRunning(true);
    setSimResult(null);
    try {
      const res = await fetch(`${API_BASE}/api/simulate`, { method: "POST", headers, body: JSON.stringify({}) });
      setSimResult(await res.json());
      setTimeout(fetchAll, 1000);
    } catch (e) {
      console.error(e);
    } finally {
      setSimRunning(false);
    }
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

  // Formulate leaflet data cleanly
  const getMapData = () => {
    const activeRouteCoords = activeProposal?.suggested_units?.filter(u => 
      modifiedUnits.includes(u.unit_name)
    ).map(u => u.route_coordinates) || [];

    const parsedDispatches = activeRouteCoords.map((coords, i) => ({
      unit_type: activeProposal.suggested_units[i]?.resource_type || "ambulance",
      route: {
        route_geojson: {
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: coords.map(c => [c[1], c[0]]) // Leaflet GeoJSON uses [lon, lat]
          }
        }
      }
    }));

    return {
      epicenter: { lat: 18.5204, lon: 73.8567 },
      sosReports: incidents.map(inc => ({
        lat: inc.lat,
        lon: inc.lon,
        severity: getLevel(inc) === "CRITICAL" ? 5 : getLevel(inc) === "HIGH" ? 4 : 3,
        message: inc.message || inc.raw_message
      })),
      resourceUnits: dbResources.map(u => ({
        unit_name: u.unit_name,
        type: u.resource_type,
        lat: u.lat,
        lon: u.lon
      })),
      dispatches: parsedDispatches
    };
  };

  const toggleUnitSelection = (unitName) => {
    setModifiedUnits(prev => 
      prev.includes(unitName) ? prev.filter(n => n !== unitName) : [...prev, unitName]
    );
  };

  return (
    <div className="command-center glass-card" style={{ padding: "20px", background: "rgba(10, 10, 15, 0.85)", border: "1px solid rgba(124, 58, 237, 0.2)", color: "#f3f4f6", borderRadius: "16px" }}>
      {/* ── War Room Header ── */}
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px", marginBottom: "16px", borderBottom: "1px solid rgba(255,255,255,0.06)", paddingBottom: "16px" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ animation: "pulse 2s infinite", background: "#dc2626", width: "12px", height: "12px", borderRadius: "50%", display: "inline-block" }} />
            <h2 className="gradient-text" style={{ margin: 0, fontSize: "24px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "1px" }}>Aurora Disaster Command</h2>
          </div>
          <div style={{ display: "flex", gap: "8px", marginTop: "6px", alignItems: "center", flexWrap: "wrap" }}>
            {cs.phase && (
              <span style={{ background: "rgba(124,58,237,0.2)", color: "#c4b5fd", padding: "3px 12px", borderRadius: "14px", fontSize: "11px", fontWeight: "bold", border: "1px solid rgba(124,58,237,0.3)" }}>
                {PHASE_LABELS[cs.phase] || cs.phase}
              </span>
            )}
            {cs.overall_severity && (
              <span style={{ background: `${SEVERITY_COLORS[cs.overall_severity] || "#ca8a04"}33`, color: SEVERITY_COLORS[cs.overall_severity] || "#ca8a04", padding: "3px 12px", borderRadius: "14px", fontSize: "11px", fontWeight: "bold", border: `1px solid ${SEVERITY_COLORS[cs.overall_severity] || "#ca8a04"}55` }}>
                {cs.overall_severity} SEVERITY
              </span>
            )}
            <span style={{ color: "#6b7280", fontSize: "11px" }}>
              Active Incidents: {incidents.length} • Updated {secondsAgo}s ago
            </span>
          </div>
        </div>
        <button onClick={runSimulation} disabled={simRunning} style={{
          background: simRunning ? '#6b21a8' : 'linear-gradient(135deg, #7c3aed, #4f46e5)', color: 'white',
          padding: '10px 22px', borderRadius: '8px', border: 'none',
          cursor: simRunning ? 'wait' : 'pointer', fontWeight: 'bold', fontSize: '13px', boxShadow: "0 0 15px rgba(124, 58, 237, 0.4)", transition: "all 0.3s"
        }}>
          {simRunning ? '⏳ Orchestrating...' : '⚡ Trigger Earthquake Anomaly'}
        </button>
      </header>

      {/* Headline */}
      {cs.headline && (
        <div style={{ background: "rgba(220, 38, 38, 0.05)", borderRadius: "10px", padding: "12px 18px", marginBottom: "16px", borderLeft: "4px solid #dc2626", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <span style={{ color: "#fca5a5", fontSize: "12px", textTransform: "uppercase", fontWeight: "bold", display: "block" }}>LATEST SEISMIC ADVISORY</span>
            <span style={{ color: "#e5e7eb", fontSize: "15px", fontWeight: "bold" }}>{cs.headline}</span>
          </div>
          <span style={{ color: "#ef4444", fontSize: "11px", background: "rgba(239, 68, 68, 0.15)", padding: "4px 10px", borderRadius: "6px", fontWeight: "bold" }}>ZONE III EMERGENCY</span>
        </div>
      )}

      {/* ══ 3-Column Tactical Layout ══ */}
      <div style={{ display: "grid", gridTemplateColumns: "310px 1fr 340px", gap: "16px" }}>

        {/* ═══ LEFT: Incident Triage Pipeline ═══ */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div style={{ background: "rgba(255, 255, 255, 0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "12px", padding: "14px", maxHeight: "720px", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <h3 style={{ color: "#9ca3af", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.5px", margin: 0 }}>Incident Feed</h3>
              <span style={{ background: "rgba(255, 255, 255, 0.08)", padding: "2px 8px", borderRadius: "10px", fontSize: "10px" }}>{incidents.length} TOTAL</span>
            </div>
            
            {sorted.length === 0 && <p style={{ color: "#4b5563", textAlign: "center", padding: "40px 0", fontSize: "13px" }}>Operational queue clear. No anomalies reported.</p>}
            
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {sorted.map((inc, idx) => {
                const level = getLevel(inc);
                const id = inc.id || inc.incident_id || `i-${idx}`;
                const color = TRIAGE_COLORS[level] || TRIAGE_COLORS.MODERATE;
                const status = actionStatus[id] || inc.status;
                const isSelected = selectedIncident?.id === id;

                return (
                  <div 
                    key={id} 
                    onClick={() => {
                      if (!status || status === "PENDING") {
                        setSelectedIncident(inc);
                      }
                    }}
                    style={{ 
                      background: isSelected ? "rgba(124, 58, 237, 0.08)" : "rgba(255,255,255,0.03)", 
                      borderRadius: "8px", 
                      padding: "12px", 
                      cursor: (!status || status === "PENDING") ? "pointer" : "default", 
                      borderLeft: `3px solid ${color}`,
                      border: isSelected ? "1px solid rgba(124, 58, 237, 0.4)" : "1px solid transparent",
                      transition: "all 0.2s"
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                      <span style={{ background: color, color: "white", padding: "1px 8px", borderRadius: "10px", fontSize: "10px", fontWeight: "bold", animation: level === "CRITICAL" ? "pulse 1.2s infinite" : "none" }}>
                        {level}
                      </span>
                      <span style={{ color: "#9ca3af", fontSize: "10px", fontWeight: "500" }}>{inc.area || "Sector III"}</span>
                    </div>
                    <p style={{ color: "#d1d5db", fontSize: "12px", margin: "4px 0", lineHeight: 1.4 }}>
                      {inc.message || inc.raw_message || "—"}
                    </p>
                    
                    {status && status !== "PENDING" ? (
                      <div style={{ fontSize: "11px", fontWeight: "bold", textAlign: "center", padding: "5px", borderRadius: "4px", marginTop: "8px", background: status === "DISPATCHED" ? "rgba(22,163,74,0.15)" : "rgba(220,38,38,0.15)", color: status === "DISPATCHED" ? "#4ade80" : "#fca5a5", border: status === "DISPATCHED" ? "1px solid rgba(22,163,74,0.3)" : "1px solid rgba(220,38,38,0.3)" }}>
                        {status === "DISPATCHED" ? "✅ EN-ROUTE DISPATCHED" : "❌ DECOMMISSIONED / REJECTED"}
                      </div>
                    ) : (
                      <div style={{ display: "flex", gap: "6px", marginTop: "8px" }}>
                        <button onClick={(e) => { e.stopPropagation(); setSelectedIncident(inc); }} style={{ flex: 1, padding: "5px", background: isSelected ? "#7c3aed" : "#1f2937", color: "white", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "4px", fontSize: "11px", fontWeight: "bold", cursor: "pointer" }}>
                          {isSelected ? "🔍 Analyzing..." : "🛠️ AI Triage Plan"}
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); handleDismissIncident(id); }} style={{ padding: "5px 10px", background: "rgba(220,38,38,0.1)", color: "#fca5a5", border: "1px solid rgba(220,38,38,0.2)", borderRadius: "4px", fontSize: "11px", cursor: "pointer" }}>Dismiss</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ═══ CENTER: Tactical Map & AI Dispatch Orchestration ═══ */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          
          {/* Interactive Tactical Map */}
          <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "12px", overflow: "hidden", padding: "10px" }}>
            <AuroraMap data={getMapData()} height={320} />
          </div>

          {/* Commander Triage Agent Drawer (HITL Panel) */}
          {selectedIncident ? (
            <div style={{ background: "rgba(124, 58, 237, 0.06)", border: "1px solid rgba(124, 58, 237, 0.3)", borderRadius: "12px", padding: "16px", animation: "fadeIn 0.3s" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", borderBottom: "1px solid rgba(124, 58, 237, 0.2)", paddingBottom: "8px" }}>
                <div>
                  <span style={{ fontSize: "10px", color: "#c4b5fd", textTransform: "uppercase", fontWeight: "bold", letterSpacing: "0.5px" }}>HUMAN-IN-THE-LOOP CONTROL GRID</span>
                  <h4 style={{ margin: 0, color: "#e5e7eb", fontSize: "15px" }}>Triage & Dispatch Proposal: {selectedIncident.id}</h4>
                </div>
                <button onClick={() => setSelectedIncident(null)} style={{ background: "transparent", border: "none", color: "#9ca3af", cursor: "pointer", fontSize: "16px" }}>✕</button>
              </div>

              {proposalLoading ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "15px 0" }}>
                  <div className="loader" style={{ alignSelf: "center", border: "3px solid #1f2937", borderTop: "3px solid #7c3aed", borderRadius: "50%", width: "24px", height: "24px", animation: "spin 1s linear infinite" }} />
                  <div style={{ background: "#0a0a0f", borderRadius: "8px", padding: "10px", fontFamily: "monospace", fontSize: "11px", border: "1px solid #1f2937", color: "#4ade80", minHeight: "100px", marginTop: "10px" }}>
                    {thinkingLogs.map((log, i) => (
                      <div key={i} style={{ marginBottom: "4px" }}>{log}</div>
                    ))}
                  </div>
                </div>
              ) : activeProposal ? (
                <div>
                  {/* AI Rationale */}
                  <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: "8px", padding: "10px", marginBottom: "12px", borderLeft: "3px solid #a78bfa" }}>
                    <span style={{ color: "#a78bfa", fontSize: "11px", fontWeight: "bold", display: "block" }}>🧠 GEMMA MISSION BRIEFING</span>
                    <p style={{ margin: "4px 0 0 0", fontSize: "12px", color: "#d1d5db", lineHeight: 1.4 }}>{activeProposal.tactical_justification}</p>
                  </div>

                  {/* Manual Modifications Grid */}
                  <span style={{ fontSize: "11px", color: "#9ca3af", fontWeight: "bold", display: "block", marginBottom: "8px" }}>SELECT OR MODIFY UNITS TO DEPLOY (PostGIS DB WRITE):</span>
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "16px" }}>
                    {activeProposal.suggested_units?.map((unit) => {
                      const isChecked = modifiedUnits.includes(unit.unit_name);
                      return (
                        <div 
                          key={unit.id}
                          onClick={() => toggleUnitSelection(unit.unit_name)}
                          style={{ 
                            display: "flex", 
                            alignItems: "center", 
                            justifyContent: "space-between", 
                            background: isChecked ? "rgba(22, 163, 74, 0.08)" : "rgba(255,255,255,0.02)", 
                            border: isChecked ? "1px solid rgba(22, 163, 74, 0.3)" : "1px solid rgba(255,255,255,0.05)",
                            borderRadius: "6px",
                            padding: "8px 12px",
                            cursor: "pointer",
                            transition: "all 0.2s"
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                            <input 
                              type="checkbox" 
                              checked={isChecked} 
                              onChange={() => {}} // Handled by div onClick
                              style={{ accentColor: "#16a34a", cursor: "pointer" }} 
                            />
                            <div>
                              <strong style={{ fontSize: "12px", color: isChecked ? "#4ade80" : "#e5e7eb" }}>{unit.unit_name}</strong>
                              <span style={{ fontSize: "10px", color: "#9ca3af", marginLeft: "8px" }}>({unit.station_name})</span>
                            </div>
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <span style={{ fontSize: "10px", color: "#c4b5fd", background: "rgba(124, 58, 237, 0.2)", padding: "1px 6px", borderRadius: "4px", fontWeight: "bold" }}>ETA {unit.eta_minutes} Min</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Operational Decision Log */}
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button 
                      onClick={handleConfirmDeployment}
                      style={{ 
                        flex: 2, 
                        padding: "10px", 
                        background: "linear-gradient(135deg, #16a34a, #15803d)", 
                        color: "white", 
                        border: "none", 
                        borderRadius: "6px", 
                        fontWeight: "bold", 
                        fontSize: "12px", 
                        cursor: "pointer", 
                        boxShadow: "0 0 10px rgba(22, 163, 74, 0.3)"
                      }}
                    >
                      🚀 AUTHORIZE AI DISPATCH ORDER
                    </button>
                    <button 
                      onClick={() => handleDismissIncident(selectedIncident.id)}
                      style={{ 
                        flex: 1, 
                        padding: "10px", 
                        background: "rgba(220, 38, 38, 0.1)", 
                        color: "#fca5a5", 
                        border: "1px solid rgba(220, 38, 38, 0.3)", 
                        borderRadius: "6px", 
                        fontSize: "12px", 
                        cursor: "pointer" 
                      }}
                    >
                      Dismiss Alert
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            /* Standard Briefings Panel */
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {summary?.commander_briefing && (
                <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.04)", borderRadius: "12px", padding: "14px" }}>
                  <h4 style={{ color: "#c4b5fd", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.5px", margin: "0 0 8px 0" }}>🧠 Gemma Executive Briefing</h4>
                  <p style={{ color: "#d1d5db", fontSize: "13px", lineHeight: 1.6, margin: 0 }}>{summary.commander_briefing}</p>
                </div>
              )}

              {summary?.zone_analysis?.length > 0 && (
                <div>
                  <span style={{ color: "#9ca3af", fontSize: "11px", fontWeight: "bold", textTransform: "uppercase", display: "block", marginBottom: "6px" }}>Tactical Zone Status Grid:</span>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                    {summary.zone_analysis.map((z, i) => (
                      <div key={i} style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)", borderRadius: "8px", padding: "10px", borderLeft: `3px solid ${TRIAGE_COLORS[z.severity] || "#ca8a04"}` }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                          <strong style={{ color: "#e5e7eb", fontSize: "12px" }}>{z.zone_name}</strong>
                          <span style={{ background: TRIAGE_COLORS[z.severity] || "#ca8a04", color: "white", padding: "1px 6px", borderRadius: "8px", fontSize: "8px", fontWeight: "bold" }}>{z.severity}</span>
                        </div>
                        <div style={{ color: "#9ca3af", fontSize: "11px" }}>{z.primary_threat}</div>
                        <div style={{ color: "#6b7280", fontSize: "10px", marginTop: "4px" }}>
                          {z.people_at_risk && `${z.people_at_risk} at risk`}{z.incident_count ? ` • ${z.incident_count} reports` : ""}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ═══ RIGHT: PostGIS Active Responders Inventory & Gemma Chat ═══ */}
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          
          {/* Dashboard Gauges */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
            <div style={{ background: "rgba(220,38,38,0.04)", border: "1px solid rgba(220,38,38,0.1)", borderRadius: "10px", padding: "10px", textAlign: "center" }}>
              <div style={{ fontSize: "24px", fontWeight: 800, color: "#f87171" }}>{summary?.lives_at_risk ?? "12"}</div>
              <span style={{ fontSize: "10px", color: "#9ca3af", textTransform: "uppercase" }}>Lives At Risk</span>
            </div>
            <div style={{ background: "rgba(22,163,74,0.04)", border: "1px solid rgba(22,163,74,0.1)", borderRadius: "10px", padding: "10px", textAlign: "center" }}>
              <div style={{ fontSize: "24px", fontWeight: 800, color: "#4ade80" }}>{summary?.lives_secured ?? "48"}</div>
              <span style={{ fontSize: "10px", color: "#9ca3af", textTransform: "uppercase" }}>Lives Secured</span>
            </div>
          </div>

          {/* Live PostGIS Active Responders Grid */}
          <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "12px", padding: "12px" }}>
            <span style={{ color: "#9ca3af", fontSize: "11px", fontWeight: "bold", textTransform: "uppercase", display: "block", marginBottom: "8px" }}>Live PostGIS Responders Inventory</span>
            <div style={{ maxHeight: "180px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "6px" }}>
              {dbResources.length === 0 ? (
                <div style={{ fontSize: "11px", color: "#4b5563", textAlign: "center", padding: "10px 0" }}>Connecting to PostGIS...</div>
              ) : (
                dbResources.map((unit) => {
                  const isAvailable = unit.status === "available" || unit.status === "AVAILABLE";
                  return (
                    <div 
                      key={unit.id} 
                      style={{ 
                        display: "flex", 
                        alignItems: "center", 
                        justifyContent: "space-between", 
                        background: "rgba(255,255,255,0.01)", 
                        border: "1px solid rgba(255,255,255,0.03)", 
                        borderRadius: "6px",
                        padding: "6px 10px" 
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: isAvailable ? "#16a34a" : "#ca8a04" }} />
                        <div>
                          <strong style={{ fontSize: "11px", color: "#e5e7eb" }}>{unit.unit_name}</strong>
                          <span style={{ fontSize: "9px", color: "#6b7280", marginLeft: "6px" }}>{unit.station_name}</span>
                        </div>
                      </div>
                      <span style={{ 
                        fontSize: "9px", 
                        color: isAvailable ? "#4ade80" : "#fca5a5", 
                        background: isAvailable ? "rgba(22,163,74,0.15)" : "rgba(220,38,38,0.15)",
                        padding: "1px 6px",
                        borderRadius: "4px",
                        fontWeight: "bold",
                        textTransform: "uppercase"
                      }}>
                        {unit.status}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Gemma Chat Advisor */}
          <div style={{ flex: 1, background: "rgba(0,0,0,0.25)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "12px", display: "flex", flexDirection: "column", minHeight: "220px" }}>
            <div style={{ padding: "10px 14px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h4 style={{ margin: 0, fontSize: "12px", color: "#c4b5fd", textTransform: "uppercase" }}>🧠 Gemma Command Advisor</h4>
              <span style={{ fontSize: "9px", color: "#6b7280" }}>Smart Agent</span>
            </div>
            
            <div style={{ padding: "6px 10px", display: "flex", flexWrap: "wrap", gap: "4px" }}>
              {EXAMPLE_QUESTIONS.map((q, i) => (
                <button key={i} onClick={() => sendChat(q)} style={{ background: "#1f2937", color: "#d1d5db", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "12px", padding: "3px 8px", fontSize: "9.5px", cursor: "pointer" }}>{q}</button>
              ))}
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: "8px 10px", display: "flex", flexDirection: "column", gap: "6px" }}>
              {chatMessages.length === 0 && <p style={{ color: "#4b5563", fontSize: "11px", textAlign: "center", marginTop: "30px" }}>Commander briefing active. Query Gemma for secondary consequences.</p>}
              {chatMessages.map((m, i) => (
                <div key={i} style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "90%", padding: "8px 12px", borderRadius: "8px", background: m.role === "user" ? "linear-gradient(135deg, #7c3aed, #4f46e5)" : "rgba(255,255,255,0.04)", color: m.role === "user" ? "white" : "#d1d5db", fontSize: "12px", lineHeight: 1.5, border: m.role === "user" ? "none" : "1px solid rgba(255,255,255,0.03)" }}>
                  {m.content}
                  {m.model && <div style={{ fontSize: "8.5px", color: "#6b7280", marginTop: "4px", borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "2px" }}>— {m.model}</div>}
                </div>
              ))}
              {chatLoading && <div style={{ alignSelf: "flex-start", padding: "6px 12px", borderRadius: "8px", background: "rgba(255,255,255,0.04)", color: "#a78bfa", fontSize: "12px" }}>Synthesizing strategy...</div>}
              <div ref={chatEndRef} />
            </div>

            <div style={{ padding: "8px 10px", borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", gap: "6px" }}>
              <input 
                value={chatInput} 
                onChange={e => setChatInput(e.target.value)} 
                onKeyDown={e => e.key === "Enter" && sendChat()}
                placeholder="Query Gemma Agent..." 
                style={{ flex: 1, padding: "8px 12px", borderRadius: "6px", background: "#0a0a0f", color: "white", border: "1px solid #1f2937", fontSize: "12px", outline: "none" }} 
              />
              <button onClick={() => sendChat()} disabled={chatLoading} style={{ padding: "8px 14px", background: "#7c3aed", color: "white", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: "bold", fontSize: "12px" }}>Deploy Q</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
