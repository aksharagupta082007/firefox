import { useState, useEffect, useRef, useMemo } from "react";
import { createWebSocket } from "../api";
import AuroraMap from "../components/AuroraMap";
const STATUS_CONFIG = {
  EMERGENCY: { bg: "rgba(232,80,2,0.12)", border: "var(--severity-critical)", text: "var(--severity-critical)", glow: "0 0 60px rgba(232,80,2,0.35)", emoji: "" },
  CRITICAL: { bg: "rgba(255,140,66,0.10)", border: "var(--severity-high)", text: "var(--severity-high)", glow: "0 0 50px rgba(255,140,66,0.25)", emoji: "" },
  WATCH: { bg: "rgba(255,255,255,0.05)", border: "var(--severity-medium)", text: "var(--severity-medium)", glow: "0 0 30px rgba(255,255,255,0.1)", emoji: "" },
  NORMAL: { bg: "rgba(255,255,255,0.02)", border: "var(--severity-low)", text: "var(--severity-low)", glow: "0 0 20px rgba(255,255,255,0.05)", emoji: "" }
};
const LEVEL_COLORS = {
  CRITICAL: "var(--severity-critical)",
  HIGH: "var(--severity-high)",
  MEDIUM: "var(--severity-medium)",
  LOW: "var(--severity-low)",
  EMERGENCY: "var(--severity-critical)",
  WATCH: "var(--severity-medium)",
  NORMAL: "var(--severity-low)"
};
export default function ResponderDashboard({ pipelineResult, onGoToSimulator }) {
  const [events, setEvents] = useState([]);
  const [wsStatus, setWsStatus] = useState("connecting");
  const wsRef = useRef(null);
  useEffect(() => {
    try {
      const ws = createWebSocket((data2) => {
        setWsStatus("online");
        setEvents((prev) => [
          { ...data2, _ts: (/* @__PURE__ */ new Date()).toLocaleTimeString("en-IN", { hour12: false }) },
          ...prev.slice(0, 49)
        ]);
      });
      wsRef.current = ws;
      ws.onopen = () => setWsStatus("online");
      ws.onclose = () => setWsStatus("offline");
    } catch {
      setWsStatus("offline");
    }
    return () => {
      wsRef.current?.close();
    };
  }, []);
  const data = pipelineResult;
  const isVerified = data?.status === "complete";
  const decision = data?.layers?.["4_verification"]?.decision;
  const verifyData = data?.layers?.["4_verification"];
  const signalData = data?.layers?.["3_signal"];
  const triggerData = data?.layers?.["1_trigger"];
  const sensorSource = triggerData?.sensor_source || "unknown";
  const tacticalBrief = data?.layers?.["10_11_ai"]?.tactical_brief || [];
  const aiAvailable = data?.layers?.["10_11_ai"]?.ai_available ?? false;
  const dispatches = isVerified ? data?.layers?.["8_9_dispatch_routing"]?.dispatches || [] : [];
  const affectedInfra = isVerified ? data?.layers?.["5_impact"]?.affected_infra || [] : [];
  const scoredZones = isVerified ? data?.layers?.["7_priority"] || [] : [];
  const aiSummary = data?.layers?.["10_11_ai"]?.incident_summary;
  const currentStatus = decision?.status || "NORMAL";
  const sc = STATUS_CONFIG[currentStatus] || STATUS_CONFIG.NORMAL;
  const mapData = useMemo(() => {
    if (!data?.layers) return { epicenter: { lat: 18.5204, lon: 73.8567 } };
    const L = data.layers;
    if (!isVerified) {
      const phoneLoc = L["phone_location"] || L["1_trigger"]?.phone_location;
      return { epicenter: phoneLoc || { lat: L["1_trigger"]?.lat || 18.5204, lon: L["1_trigger"]?.lon || 73.8567 } };
    }
    return {
      epicenter: L["5_impact"]?.epicenter || { lat: 18.5204, lon: 73.8567 },
      impactPolygon: L["5_impact"]?.impact_polygon_geojson,
      affectedInfra: L["5_impact"]?.affected_infra,
      clusters: (L["6_survivors"]?.clusters || []).map((c, i) => ({
        ...c,
        priority_level: L["7_priority"]?.[i]?.priority_level || "MEDIUM"
      })),
      sosReports: L["6_survivors"]?.sos_reports,
      dispatches: L["8_9_dispatch_routing"]?.dispatches
    };
  }, [data, isVerified]);
  if (!data) {
    return <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "60vh", gap: 16 }}>
        <h2 style={{ color: "var(--text-primary)", fontWeight: 700 }}>Command Center</h2>
        <p className="text-muted" style={{ maxWidth: 400, textAlign: "center", lineHeight: 1.6 }}>
          No pipeline data yet. Run a simulation from the Demo Simulator to see live results here.
        </p>
        <button className="btn" onClick={onGoToSimulator} style={{
      background: "var(--text-primary)",
      border: "none",
      padding: "10px 24px",
      borderRadius: 8,
      cursor: "pointer",
      color: "#1a1a1a",
      fontWeight: 600,
      fontSize: "0.85rem"
    }}>
          Go to Demo Simulator
        </button>
      </div>;
  }
  const severeInfra = affectedInfra.filter((i) => i.estimated_damage === "severe");
  const otherInfra = affectedInfra.filter((i) => i.estimated_damage !== "severe");
  return <div>
      <div id="status-banner" style={{
    background: sc.bg,
    border: `1px solid ${sc.border}`,
    borderRadius: 12,
    padding: "16px 24px",
    marginBottom: 16,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between"
  }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: sc.border
  }} />
          <div>
            <div style={{ fontSize: "1.2rem", fontWeight: 700, color: sc.text }}>
              {decision?.label || "AWAITING DATA"}
            </div>
            <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: 2 }}>
              {decision?.tactical_suggestion || "Monitoring sensors..."}
            </div>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: "1.5rem", fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: sc.text }}>
            {verifyData?.verified_score ?? "\u2014"}
          </div>
          <div style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>
            Verified Score · {sensorSource === "phyphox" ? "Phyphox Live" : "Simulator"}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginBottom: 16 }}>
        {[
    { label: "Anomaly", value: signalData?.anomaly_score?.toFixed(3) ?? "\u2014", color: "var(--severity-high)" },
    { label: "Magnitude", value: isVerified ? triggerData?.magnitude ?? "\u2014" : "\u2014", color: "var(--severity-critical)" },
    { label: "Impact", value: isVerified ? `${data.layers?.["5_impact"]?.radius_km ?? "\u2014"} km` : "\u2014", color: "var(--text-secondary)" },
    { label: "Zones", value: isVerified ? scoredZones.length : "\u2014", color: "var(--text-primary)" },
    { label: "Dispatched", value: isVerified ? dispatches.length : "\u2014", color: "var(--text-secondary)" }
  ].map((s, i) => <div key={i} style={{
    background: "rgba(255, 255, 255, 0.03)",
    borderRadius: 10,
    padding: "10px 14px",
    border: "1px solid var(--border-subtle)",
    textAlign: "center"
  }}>
            <div style={{ fontSize: "1.2rem", fontWeight: 800, color: s.color, fontFamily: "'JetBrains Mono', monospace" }}>
              {s.value}
            </div>
            <div style={{ fontSize: "0.65rem", color: "var(--text-muted)", marginTop: 2, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              {s.label}
            </div>
          </div>)}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 16, marginBottom: 16 }}>

        <div style={{
    background: "rgba(255, 255, 255, 0.03)",
    borderRadius: 12,
    border: "1px solid var(--border-subtle)",
    overflow: "hidden"
  }}>
          <div style={{
    padding: "10px 16px",
    borderBottom: "1px solid var(--border-subtle)",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between"
  }}>
            <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-primary)" }}>
              {isVerified ? "Pune Impact Map" : "Live Location"}
            </span>
            {isVerified && <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                {affectedInfra.length} infra · {scoredZones.length} zones · {dispatches.length} units
              </span>}
          </div>
          <div style={{ height: 440 }}>
            <AuroraMap data={mapData} height={440} />
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          <div style={{
    background: "rgba(255, 255, 255, 0.03)",
    borderRadius: 12,
    border: "1px solid var(--border-subtle)",
    flex: 1,
    minHeight: 0,
    display: "flex",
    flexDirection: "column"
  }}>
            <div style={{
    padding: "10px 14px",
    borderBottom: "1px solid var(--border-subtle)",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center"
  }}>
              <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-primary)" }}>
                Tactical Brief
              </span>
              <span style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>
                {isVerified ? `${tacticalBrief.length} items` : "No alerts"}
              </span>
            </div>
            <div style={{ flex: 1, overflow: "auto", padding: "8px 10px" }}>
              {!isVerified && <div style={{ textAlign: "center", padding: "30px 16px" }}>
                  <div style={{ fontSize: "0.9rem", color: "var(--text-primary)", fontWeight: 700 }}>All Clear</div>
                  <div className="text-muted" style={{ fontSize: "0.75rem", marginTop: 6, lineHeight: 1.5 }}>
                    Sensor readings normal.<br />
                    Score: {verifyData?.verified_score ?? "\u2014"} (threshold: 0.55)
                  </div>
                </div>}

              {isVerified && tacticalBrief.map((item, i) => <div key={i} style={{
    padding: "8px 10px",
    marginBottom: 6,
    borderRadius: 8,
    background: "rgba(255,255,255,0.02)",
    borderLeft: `3px solid ${LEVEL_COLORS[item.level] || "var(--text-secondary)"}`,
    fontSize: "0.75rem",
    lineHeight: 1.4
  }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                    <span style={{
    fontSize: "0.58rem",
    fontWeight: 700,
    textTransform: "uppercase",
    padding: "1px 5px",
    borderRadius: 3,
    background: `${LEVEL_COLORS[item.level] || "var(--text-secondary)"}18`,
    color: LEVEL_COLORS[item.level] || "var(--text-secondary)"
  }}>
                      P{item.priority} · {item.category}
                    </span>
                  </div>
                  <div style={{ color: "var(--text-primary)" }}>{item.message}</div>
                </div>)}

              {isVerified && !aiAvailable && <div style={{
    margin: "6px 0",
    padding: "8px 10px",
    borderRadius: 6,
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.15)",
    fontSize: "0.7rem",
    color: "var(--text-secondary)"
  }}>
                  <strong>Gemma 4 Offline</strong> — AI-generated tactical actions will appear when LLM is connected.
                </div>}
            </div>
          </div>

          {isVerified && affectedInfra.length > 0 && <div style={{
    background: "rgba(255, 255, 255, 0.03)",
    borderRadius: 12,
    border: "1px solid var(--border-subtle)",
    maxHeight: 180,
    overflow: "auto"
  }}>
              <div style={{
    padding: "8px 14px",
    borderBottom: "1px solid var(--border-subtle)",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center"
  }}>
                <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text-primary)" }}>
                  Infrastructure
                </span>
                <span style={{ fontSize: "0.65rem" }}>
                  <span style={{ color: "var(--severity-critical)", fontWeight: 700 }}>{severeInfra.length} severe</span>
                  <span style={{ color: "var(--text-muted)" }}> · {otherInfra.length} other</span>
                </span>
              </div>
              <div style={{ padding: "4px 10px" }}>
                {severeInfra.slice(0, 5).map((inf, i) => <div key={i} style={{
    padding: "5px 0",
    fontSize: "0.72rem",
    display: "flex",
    justifyContent: "space-between",
    borderBottom: "1px solid rgba(255,255,255,0.03)"
  }}>
                    <span style={{ color: "var(--text-primary)" }}>
                      {inf.name}
                    </span>
                    <span style={{ color: "var(--severity-critical)", fontSize: "0.65rem", fontWeight: 600 }}>
                      {inf.distance_from_epicenter_km?.toFixed(1)}km
                    </span>
                  </div>)}
              </div>
            </div>}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isVerified ? "1fr 1fr" : "1fr", gap: 16 }}>

        {isVerified && dispatches.length > 0 && <div style={{
    background: "rgba(255, 255, 255, 0.03)",
    borderRadius: 12,
    border: "1px solid var(--border-subtle)"
  }}>
            <div style={{
    padding: "10px 16px",
    borderBottom: "1px solid var(--border-subtle)",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center"
  }}>
              <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-primary)" }}>
                Dispatches
              </span>
              <span style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>{dispatches.length} units</span>
            </div>
            <div style={{ maxHeight: 220, overflow: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.73rem" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                    {["Unit", "Zone", "Route", "ETA"].map((h) => <th key={h} style={{ padding: "7px 12px", textAlign: h === "ETA" ? "right" : "left", color: "var(--text-muted)", fontWeight: 600 }}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {dispatches.map((d, i) => <tr key={i} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                      <td style={{ padding: "7px 12px", textTransform: "capitalize" }}>
                        {d.unit_type?.replace("_", " ")}
                      </td>
                      <td style={{ padding: "7px 12px" }}>
                        <span style={{
    padding: "1px 5px",
    borderRadius: 3,
    fontSize: "0.63rem",
    fontWeight: 700,
    background: "rgba(255,255,255,0.05)",
    color: "var(--text-primary)"
  }}>Z{d.zone_id}</span>
                      </td>
                      <td style={{ padding: "7px 12px", color: "var(--text-secondary)", fontSize: "0.68rem" }}>
                        {d.route?.route_nodes?.slice(0, 3).join(" \u2192 ") || "\u2014"}
                      </td>
                      <td style={{
    padding: "7px 12px",
    textAlign: "right",
    fontFamily: "'JetBrains Mono', monospace",
    fontWeight: 700,
    color: d.eta_minutes > 10 ? "var(--severity-high)" : "var(--severity-low)"
  }}>
                        {d.eta_minutes?.toFixed(1)}m
                      </td>
                    </tr>)}
                </tbody>
              </table>
            </div>
          </div>}

        {/* Event Feed */}
        <div style={{
    background: "rgba(255, 255, 255, 0.03)",
    borderRadius: 12,
    border: "1px solid var(--border-subtle)"
  }}>
          <div style={{
    padding: "10px 16px",
    borderBottom: "1px solid var(--border-subtle)",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center"
  }}>
            <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-primary)" }}>
              Event Feed
            </span>
            <span className={`status-pill ${wsStatus === "online" ? "online" : "alert"}`} style={{ fontSize: "0.6rem" }}>
              {wsStatus === "online" ? "● Live" : "○ Offline"}
            </span>
          </div>
          <div className="event-log" style={{ maxHeight: 200, padding: 10 }}>
            {events.length === 0 && <p className="text-muted" style={{ textAlign: "center", padding: 20, fontSize: "0.75rem" }}>
                Waiting for events...
              </p>}
            {events.map((ev, i) => <div key={i} className={`log-entry ${ev.layer >= 4 ? "alert" : ""}`}>
                <span className="log-time">{ev._ts}</span>
                <span><strong>L{ev.layer}</strong> {ev.event}</span>
              </div>)}
          </div>
        </div>
      </div>

      {/* ── Back to simulator link ── */}
      <div style={{ textAlign: "center", marginTop: 16 }}>
        <button onClick={onGoToSimulator} style={{
    background: "none",
    border: "1px solid var(--border-subtle)",
    color: "var(--text-muted)",
    padding: "6px 16px",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: "0.75rem"
  }}>
          ← Run Another Simulation
        </button>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.3); }
        }
      `}</style>
    </div>
}
