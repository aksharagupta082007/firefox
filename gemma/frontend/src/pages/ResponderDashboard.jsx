import { useState, useEffect } from "react";
import { createWebSocket } from "../api";
import AuroraMap from "../components/AuroraMap";

const API_BASE = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:8000`;

const TRIAGE_COLORS = {
  CRITICAL: "#dc2626",
  HIGH: "#ea580c",
  MODERATE: "#ca8a04",
  LOW: "#16a34a",
};

export default function ResponderDashboard() {
  const token = localStorage.getItem("aurora_token");
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const renderFormattedContent = (text) => {
    if (!text) return null;
    const lines = text.split("\n");
    return lines.map((line, lineIdx) => {
      const parts = line.split("**");
      const formattedLine = parts.map((part, partIdx) => {
        if (partIdx % 2 === 1) {
          return <strong key={partIdx} style={{ color: '#ea580c', fontWeight: 'bold' }}>{part}</strong>;
        }
        return part;
      });

      return (
        <div key={lineIdx} style={{ minHeight: '1.2em' }}>
          {formattedLine}
        </div>
      );
    });
  };

  const [dispatches, setDispatches] = useState([]);
  const [wsStatus, setWsStatus] = useState("connecting");
  const [currentLocation] = useState({ lat: 18.5204, lon: 73.8567 });

  // Briefing modal state
  const [briefing, setBriefing] = useState(null);
  const [briefingLoading, setBriefingLoading] = useState(false);
  const [briefingIncidentId, setBriefingIncidentId] = useState(null);
  const [checkedSteps, setCheckedSteps] = useState({});
  const [checkedEquip, setCheckedEquip] = useState({});

  useEffect(() => {
    const ws = createWebSocket("responder", (msg) => {
      setWsStatus("online");
      if (msg.type === "new_dispatch") {
        setDispatches(prev => [msg, ...prev]);
        if (Notification.permission === "granted") {
          new Notification("New Dispatch Order", { body: msg.message });
        }
      }
    });

    ws.onopen = () => setWsStatus("online");
    ws.onclose = () => setWsStatus("offline");

    if (Notification.permission !== "granted") {
      Notification.requestPermission();
    }

    return () => ws.close();
  }, []);

  const handleComplete = (id) => {
    setDispatches(prev => prev.filter(d => d.incident_id !== id));
  };

  // ── Fetch Briefing ──
  const fetchBriefing = async (incidentId) => {
    setBriefingLoading(true);
    setBriefingIncidentId(incidentId);
    setBriefing(null);
    setCheckedSteps({});
    setCheckedEquip({});
    try {
      const res = await fetch(`${API_BASE}/api/responder/briefing/${incidentId}`, { headers });
      const data = await res.json();
      setBriefing(data.briefing || null);
    } catch (e) {
      console.error("Briefing fetch failed:", e);
      setBriefing({ situation_summary: "Failed to load briefing. Proceed with standard protocol." });
    } finally {
      setBriefingLoading(false);
    }
  };

  const closeBriefing = () => {
    setBriefing(null);
    setBriefingIncidentId(null);
  };

  const toggleStep = (idx) => {
    setCheckedSteps(prev => ({ ...prev, [idx]: !prev[idx] }));
  };

  const toggleEquip = (idx) => {
    setCheckedEquip(prev => ({ ...prev, [idx]: !prev[idx] }));
  };

  return (
    <div className="responder-dashboard glass-card">
      <header className="rd-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px", marginBottom: "24px" }}>
        <h2 className="gradient-text dashboard-title" style={{ margin: 0 }}>Responder Tactical Dashboard</h2>
        <div className={`status-pill ${wsStatus === 'online' ? 'online' : 'alert'}`}>
          {wsStatus === 'online' ? '● System Connected' : '○ Connection Lost'}
        </div>
      </header>

      {/* ══ MAP — Full Width at Top ══ */}
      <div style={{ borderRadius: "12px", overflow: "hidden", marginBottom: "28px", border: "1px solid rgba(255,255,255,0.06)" }}>
        <AuroraMap
          data={{
            epicenter: { lat: currentLocation.lat, lon: currentLocation.lon },
            sosReports: dispatches.map(d => ({
              lat: d.lat || 18.53,
              lon: d.lon || 73.86,
              message: d.message || "Dispatch Target",
              severity: d.triage_level === "CRITICAL" ? 5 : d.triage_level === "HIGH" ? 4 : 3,
            })),
          }}
          height={340}
        />
      </div>

      {/* ══ 2-Column: Dispatches | Unit Status ══ */}
      <div className="dash-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>

        {/* ── Left: Dispatches ── */}
        <div>
          <h3 style={{ fontSize: "13px", color: "#a7a7a7", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "16px", fontFamily: "Inter, sans-serif", fontWeight: 600 }}>
            Active Dispatches
          </h3>
          {dispatches.length === 0 ? (
            <p className="text-muted" style={{ textAlign: "center", padding: "40px 0", color: "#4b5563", fontSize: "14px" }}>
              Waiting for deployment orders...
            </p>
          ) : (
            dispatches.map(d => {
              const level = (d.triage_level || "HIGH").toUpperCase();
              const color = TRIAGE_COLORS[level] || TRIAGE_COLORS.HIGH;
              return (
                <div key={d.incident_id} style={{ background: "rgba(255,255,255,0.03)", borderRadius: "12px", padding: "16px", marginBottom: "14px", borderLeft: `4px solid ${color}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                    <span style={{ background: `${color}22`, color, padding: "3px 10px", borderRadius: "12px", fontSize: "11px", fontWeight: "700" }}>
                      {level}
                    </span>
                    <span style={{ color: "#4b5563", fontSize: "11px" }}>{d.incident_id}</span>
                  </div>
                  <div style={{ color: "#d1d5db", fontSize: "14px", margin: "10px 0", lineHeight: 1.6 }}>
                    {renderFormattedContent(d.message) || "Dispatch approved. Move to coordinates immediately."}
                  </div>
                  <div style={{ display: "flex", gap: "10px", marginTop: "12px" }}>
                    <button onClick={() => fetchBriefing(d.incident_id)} style={{ flex: 1, padding: "9px", background: "rgba(255,255,255,0.07)", color: "#f1f5f9", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", fontSize: "13px", fontFamily: "Inter, sans-serif", cursor: "pointer" }}>
                      Get Full Briefing
                    </button>
                    <button onClick={() => handleComplete(d.incident_id)} style={{ flex: 1, padding: "9px", background: "rgba(74,222,128,0.1)", color: "#4ade80", border: "1px solid rgba(74,222,128,0.2)", borderRadius: "8px", fontSize: "13px", fontFamily: "Inter, sans-serif", cursor: "pointer" }}>
                      ✓ Mark Arrived
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* ── Right: Unit Status ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <h3 style={{ fontSize: "13px", color: "#a7a7a7", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "0", fontFamily: "Inter, sans-serif", fontWeight: 600 }}>
            Unit Status
          </h3>
          <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: "12px", padding: "20px", border: "1px solid rgba(255,255,255,0.05)" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
              {[
                ["Unit ID", "RES_PUNE_08"],
                ["Specialty", "Medical / SAR"],
                ["Status", dispatches.length > 0 ? "EN ROUTE" : "STANDBY"],
                ["Location", `${currentLocation.lat.toFixed(4)}, ${currentLocation.lon.toFixed(4)}`],
              ].map(([label, value]) => (
                <div key={label} style={{ background: "rgba(255,255,255,0.02)", borderRadius: "8px", padding: "12px" }}>
                  <div style={{ color: "#646464", fontSize: "11px", marginBottom: "4px", fontFamily: "Inter, sans-serif", textTransform: "uppercase", letterSpacing: "0.5px" }}>{label}</div>
                  <div style={{ color: label === "Status" ? (dispatches.length > 0 ? "#f87171" : "#4ade80") : "#f1f5f9", fontSize: "14px", fontWeight: "600" }}>{value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>


      {/* ══════════════════════════════════════════════════════════ */}
      {/*  BRIEFING MODAL                                          */}
      {/* ══════════════════════════════════════════════════════════ */}
      {(briefing || briefingLoading) && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)",
          display: "flex", justifyContent: "center", alignItems: "center",
          zIndex: 9999, padding: "20px",
        }} onClick={closeBriefing}>
          <div style={{
            background: "#111827", borderRadius: "16px", maxWidth: "700px",
            width: "100%", maxHeight: "90vh", overflowY: "auto", padding: "0",
          }} onClick={e => e.stopPropagation()}>

            {briefingLoading ? (
              <div style={{ padding: "60px", textAlign: "center" }}>
                <div style={{ fontSize: "32px", marginBottom: "16px" }}></div>
                <p style={{ color: "#a78bfa", fontSize: "16px" }}>Gemma generating tactical briefing...</p>
                <p style={{ color: "#6b7280", fontSize: "13px", marginTop: "8px" }}>Analyzing incident data, building assessment, equipment list</p>
              </div>
            ) : briefing && (
              <>
                {/* Header */}
                <div style={{
                  background: TRIAGE_COLORS[
                    dispatches.find(d => d.incident_id === briefingIncidentId)?.triage_level?.toUpperCase() || "HIGH"
                  ] || "#ea580c",
                  padding: "16px 24px", borderRadius: "16px 16px 0 0",
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                }}>
                  <div>
                    <h2 style={{ margin: 0, color: "white", fontSize: "18px" }}>FIELD BRIEFING</h2>
                    <span style={{ color: "rgba(255,255,255,0.8)", fontSize: "12px" }}>
                      Incident: {briefingIncidentId} • Generated by gemma-4-31b-it
                    </span>
                  </div>
                  <button onClick={closeBriefing} style={{
                    background: "rgba(0,0,0,0.3)", border: "none", color: "white",
                    width: "32px", height: "32px", borderRadius: "50%",
                    fontSize: "16px", cursor: "pointer",
                  }}>✕</button>
                </div>

                <div style={{ padding: "20px 24px" }}>
                  {/* Situation Summary */}
                  {briefing.situation_summary && (
                    <div style={{ marginBottom: "20px" }}>
                      <h4 style={{ color: "#9ca3af", fontSize: "11px", textTransform: "uppercase", marginBottom: "6px" }}>Situation</h4>
                      <div style={{ color: "#e5e7eb", fontSize: "14px", lineHeight: 1.6 }}>{renderFormattedContent(briefing.situation_summary)}</div>
                    </div>
                  )}

                  {/* First 60 Seconds */}
                  {briefing.immediate_actions?.first_60_seconds && (
                    <div style={{
                      background: "rgba(202,138,4,0.15)", border: "1px solid rgba(202,138,4,0.3)",
                      borderRadius: "10px", padding: "14px", marginBottom: "20px",
                    }}>
                      <h4 style={{ color: "#fde68a", fontSize: "13px", margin: "0 0 6px 0" }}>⏱️ First 60 Seconds</h4>
                      <div style={{ color: "#fef3c7", fontSize: "14px", lineHeight: 1.6, margin: 0 }}>
                        {renderFormattedContent(briefing.immediate_actions.first_60_seconds)}
                      </div>
                    </div>
                  )}

                  {/* Hazard Warnings */}
                  {briefing.hazard_warnings?.length > 0 && (
                    <div style={{ marginBottom: "20px" }}>
                      <h4 style={{ color: "#9ca3af", fontSize: "11px", textTransform: "uppercase", marginBottom: "8px" }}>⚠️ Hazard Warnings</h4>
                      {briefing.hazard_warnings.map((h, i) => (
                        <div key={i} style={{
                          background: "rgba(220,38,38,0.12)", border: "1px solid rgba(220,38,38,0.3)",
                          borderRadius: "8px", padding: "10px 14px", marginBottom: "6px",
                          color: "#fca5a5", fontSize: "13px",
                        }}>
                          {h}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* On Arrival Checklist */}
                  {briefing.on_arrival_checklist?.length > 0 && (
                    <div style={{ marginBottom: "20px" }}>
                      <h4 style={{ color: "#9ca3af", fontSize: "11px", textTransform: "uppercase", marginBottom: "8px" }}>On Arrival Checklist</h4>
                      {briefing.on_arrival_checklist.map((step, i) => (
                        <label key={i} style={{
                          display: "flex", alignItems: "flex-start", gap: "10px",
                          padding: "8px 12px", borderRadius: "8px", marginBottom: "4px",
                          background: checkedSteps[i] ? "rgba(22,163,74,0.1)" : "rgba(255,255,255,0.03)",
                          cursor: "pointer", transition: "background 0.2s",
                        }}>
                          <input type="checkbox" checked={!!checkedSteps[i]}
                            onChange={() => toggleStep(i)}
                            style={{ marginTop: "3px", accentColor: "#16a34a", cursor: "pointer" }}
                          />
                          <span style={{
                            color: checkedSteps[i] ? "#4ade80" : "#d1d5db",
                            fontSize: "13px", lineHeight: 1.5,
                            textDecoration: checkedSteps[i] ? "line-through" : "none",
                          }}>
                            {i + 1}. {step}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}

                  {/* Equipment Needed */}
                  {briefing.equipment_needed?.length > 0 && (
                    <div style={{ marginBottom: "20px" }}>
                      <h4 style={{ color: "#9ca3af", fontSize: "11px", textTransform: "uppercase", marginBottom: "8px" }}>Equipment Needed</h4>
                      {briefing.equipment_needed.map((item, i) => (
                        <label key={i} style={{
                          display: "flex", alignItems: "center", gap: "10px",
                          padding: "6px 12px", marginBottom: "4px", cursor: "pointer",
                        }}>
                          <input type="checkbox" checked={!!checkedEquip[i]}
                            onChange={() => toggleEquip(i)}
                            style={{ accentColor: "#7c3aed", cursor: "pointer" }}
                          />
                          <span style={{
                            color: checkedEquip[i] ? "#a78bfa" : "#d1d5db",
                            fontSize: "13px",
                            textDecoration: checkedEquip[i] ? "line-through" : "none",
                          }}>
                            {item}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}

                  {/* Building Assessment */}
                  {briefing.building_assessment && (
                    <div style={{ marginBottom: "20px" }}>
                      <h4 style={{ color: "#9ca3af", fontSize: "11px", textTransform: "uppercase", marginBottom: "8px" }}>🏗️ Building Assessment</h4>
                      <div style={{
                        display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px",
                      }}>
                        {[
                          ["Structure", briefing.building_assessment.likely_structure],
                          ["Collapse Risk", briefing.building_assessment.collapse_risk],
                          ["Safe Entry", briefing.building_assessment.safe_entry_point],
                          ["Avoid", briefing.building_assessment.avoid],
                        ].map(([label, value], i) => value && (
                          <div key={i} style={{
                            background: "rgba(255,255,255,0.03)", borderRadius: "8px",
                            padding: "8px 12px",
                          }}>
                            <div style={{ color: "#6b7280", fontSize: "11px" }}>{label}</div>
                            <div style={{
                              color: label === "Collapse Risk"
                                ? (value === "HIGH" ? "#f87171" : value === "MODERATE" ? "#fbbf24" : "#4ade80")
                                : "#e5e7eb",
                              fontSize: "13px", fontWeight: label === "Collapse Risk" ? "bold" : "normal",
                            }}>{value}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Victim Status */}
                  {briefing.victim_status && (
                    <div style={{ marginBottom: "20px" }}>
                      <h4 style={{ color: "#9ca3af", fontSize: "11px", textTransform: "uppercase", marginBottom: "8px" }}>Victim Status</h4>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                        {[
                          ["Count", briefing.victim_status.count],
                          ["Mobility", briefing.victim_status.mobility],
                          ["Condition", briefing.victim_status.condition],
                          ["Location", briefing.victim_status.location_in_building],
                        ].map(([label, value], i) => value != null && (
                          <div key={i} style={{
                            background: "rgba(255,255,255,0.03)", borderRadius: "8px",
                            padding: "8px 12px",
                          }}>
                            <div style={{ color: "#6b7280", fontSize: "11px" }}>{label}</div>
                            <div style={{ color: "#e5e7eb", fontSize: "13px" }}>{String(value)}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Escalation */}
                  {briefing.immediate_actions?.escalate_if && (
                    <div style={{
                      background: "rgba(220,38,38,0.1)", border: "1px solid rgba(220,38,38,0.2)",
                      borderRadius: "8px", padding: "10px 14px", marginBottom: "20px",
                    }}>
                      <span style={{ color: "#f87171", fontSize: "12px", fontWeight: "bold" }}>ESCALATE IF: </span>
                      <span style={{ color: "#fca5a5", fontSize: "13px" }}>{briefing.immediate_actions.escalate_if}</span>
                    </div>
                  )}

                  {/* Gemma Tactical Note */}
                  {briefing.gemma_tactical_note && (
                    <div style={{
                      background: "rgba(124,58,237,0.1)", border: "1px solid rgba(124,58,237,0.2)",
                      borderRadius: "10px", padding: "14px", marginBottom: "10px",
                    }}>
                      <h4 style={{ color: "#a78bfa", fontSize: "12px", margin: "0 0 6px 0" }}>🧠 Gemma Tactical Insight</h4>
                      <p style={{ color: "#c4b5fd", fontSize: "13px", fontStyle: "italic", margin: 0, lineHeight: 1.5 }}>
                        {briefing.gemma_tactical_note}
                      </p>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
