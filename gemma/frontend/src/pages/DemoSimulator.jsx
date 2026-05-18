import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import { api } from "../api";
import ImpactMap from "../components/ImpactMap";
import SensorsBlocks from "../components/SensorsBlocks";
const PIPELINE_STEPS = [
  "Trigger",
  "Sensors",
  "Signal",
  "Verify",
  "Impact",
  "Survivors",
  "Priority",
  "Dispatch",
  "Routes",
  "Citizen",
  "Dashboard"
];
export default function DemoSimulator({ onSimulationComplete }) {
  const [magnitude, setMagnitude] = useState(5.2);
  const [lat, setLat] = useState(18.5204);
  const [lon, setLon] = useState(73.8567);
  const [depth, setDepth] = useState(10);
  const [useRealSensor, setUseRealSensor] = useState(false);
  const [running, setRunning] = useState(false);
  const [activeStep, setActiveStep] = useState(-1);
  const [result, setResult] = useState(null);
  const [logs, setLogs] = useState([]);
  const [sensorStatus, setSensorStatus] = useState({ status: "untested" });
  const logRef = useRef(null);
  useEffect(() => {
    if (useRealSensor) {
      testSensor();
    } else {
      setSensorStatus({ status: "untested" });
    }
  }, [useRealSensor]);
  const testSensor = async () => {
    setSensorStatus({ status: "testing" });
    try {
      const data = await api.testSensor();
      if (data.status === "connected") {
        setSensorStatus({
          status: "connected",
          reading: data.reading,
          sensors: data.sensors,
          has_gps: data.has_gps,
          devices: data.devices
        });
        if (data.has_gps && data.sensors?.location?.lat) {
          setLat(data.sensors.location.lat);
          setLon(data.sensors.location.lon);
        }
      } else {
        setSensorStatus({ status: "unreachable", error: data.error, devices: data.devices });
      }
    } catch (err) {
      setSensorStatus({ status: "error", error: String(err) });
    }
  };
  const addLog = useCallback((msg, type = "info") => {
    const time = (/* @__PURE__ */ new Date()).toLocaleTimeString("en-IN", { hour12: false, fractionalSecondDigits: 1 });
    setLogs((prev) => [...prev, { time, msg, type }]);
    setTimeout(() => logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" }), 50);
  }, []);
  const runSimulation = useCallback(async () => {
    setRunning(true);
    setResult(null);
    setLogs([]);
    setActiveStep(0);
    if (useRealSensor) {
      addLog(`LIVE MODE: Fetching data from Phyphox...`, "alert");
      addLog(`Location: (${lat.toFixed(4)}, ${lon.toFixed(4)}) ${sensorStatus.has_gps ? "(GPS)" : "(manual)"}`, "info");
    } else {
      addLog(`SIMULATOR MODE: Synthetic earthquake at Pune`, "alert");
    }
    addLog(`Earthquake M${magnitude} triggered at (${lat}, ${lon})`, "alert");
    try {
      const stepInterval = setInterval(() => {
        setActiveStep((prev) => {
          if (prev < 8) {
            addLog(`Layer ${prev + 2}: Processing...`);
            return prev + 1;
          }
          clearInterval(stepInterval);
          return prev;
        });
      }, 800);
      const data = await api.simulate({
        magnitude,
        epicenter_lat: useRealSensor ? lat : 18.5204,
        epicenter_lon: useRealSensor ? lon : 73.8567,
        depth_km: depth,
        use_real_sensor: useRealSensor
      });
      clearInterval(stepInterval);
      setActiveStep(10);
      setResult(data);
      const source = data.layers?.["2_sensors"]?.source || data.sensor_source || "unknown";
      addLog(`Data source: ${source.toUpperCase()}`, source === "phyphox" ? "info" : "warning");
      if (data.sensor_source?.startsWith("phyphox")) {
        addLog(`Phyphox readings: ${data.sensor_reading_count || 0} from ${data.sensor_device_count || 0} device(s)`, data.sensor_reading_count ? "info" : "warning");
      }
      if (data.layers?.["1_trigger"]?.phone_location) {
        const loc = data.layers["1_trigger"].phone_location;
        addLog(`Phone GPS: (${loc.lat?.toFixed(5)}, ${loc.lon?.toFixed(5)})`, "info");
      }
      addLog(`Pipeline complete in ${data.total_time_s}s`, data.under_30s ? "info" : "warning");
      addLog(`Verified Score: ${data.layers?.["4_verification"]?.verified_score}`, "info");
      onSimulationComplete?.(data);
      addLog(`Impact Radius: ${data.layers?.["5_impact"]?.radius_km} km`, "info");
      addLog(`Survivor Clusters: ${data.layers?.["6_survivors"]?.total_clusters}`, "info");
      addLog(`Units Dispatched: ${data.layers?.["8_9_dispatch_routing"]?.units_deployed}`, "info");
    } catch (err) {
      addLog(`Simulation failed: ${err}`, "alert");
    } finally {
      setRunning(false);
    }
  }, [magnitude, lat, lon, depth, useRealSensor, sensorStatus, addLog]);
  const mapData = useMemo(() => {
    if (!result) return { epicenter: { lat, lon } };
    const layers = result.layers || {};
    return {
      epicenter: layers["5_impact"]?.epicenter || { lat, lon },
      impactPolygon: layers["5_impact"]?.impact_polygon_geojson,
      affectedInfra: layers["5_impact"]?.affected_infra,
      clusters: (layers["6_survivors"]?.clusters || []).map((c, i) => ({
        ...c,
        priority_level: layers["7_priority"]?.[i]?.priority_level || "MEDIUM"
      })),
      heatmapPoints: layers["6_survivors"]?.heatmap_points,
      sosReports: layers["6_survivors"]?.sos_reports,
      dispatches: layers["8_9_dispatch_routing"]?.dispatches
    };
  }, [result, lat, lon]);
  return <div>
      <h2 className="dashboard-title" style={{ marginBottom: 8 }}>Track 5 — Demo Simulator</h2>
      <p className="text-muted" style={{ marginBottom: 24, fontSize: "0.85rem" }}>
        One-click full pipeline execution. Target: Detection → Dispatch in &lt; 30 seconds.
      </p>

      {
    /* Controls */
  }
      <div className="sim-controls">
        <div className="sim-field">
          <label>Magnitude</label>
          <input
    type="number"
    step="0.1"
    min="3"
    max="8"
    value={magnitude}
    onChange={(e) => setMagnitude(+e.target.value)}
  />
        </div>
        <div className="sim-field">
          <label>Latitude</label>
          <input
    type="number"
    step="0.001"
    value={useRealSensor ? lat : 18.5204}
    onChange={(e) => setLat(+e.target.value)}
    disabled={!useRealSensor}
  />
        </div>
        <div className="sim-field">
          <label>Longitude</label>
          <input
    type="number"
    step="0.001"
    value={useRealSensor ? lon : 73.8567}
    onChange={(e) => setLon(+e.target.value)}
    disabled={!useRealSensor}
  />
        </div>
        <div className="sim-field">
          <label>Depth (km)</label>
          <input
    type="number"
    step="1"
    min="1"
    max="50"
    value={depth}
    onChange={(e) => setDepth(+e.target.value)}
  />
        </div>
        <div className="sim-field">
          <label>Data Source</label>
          <select value={useRealSensor ? "phyphox" : "synthetic"} onChange={(e) => setUseRealSensor(e.target.value === "phyphox")}>
            <option value="synthetic">Simulator (Pune)</option>
            <option value="phyphox">Live Phyphox</option>
          </select>
        </div>
        <button className="btn btn-danger btn-lg" onClick={runSimulation} disabled={running}>
          {running ? "Running Pipeline..." : "Trigger Earthquake"}
        </button>
      </div>

      <SensorsBlocks 
        useRealSensor={useRealSensor} 
        sensorStatus={sensorStatus} 
        testSensor={testSensor} 
      />

      {
    /* Pipeline Tracker */
  }
      <div className="pipeline-tracker">
        {PIPELINE_STEPS.map((step, i) => <div
    key={step}
    className={`pipeline-step ${i <= activeStep ? i === activeStep && running ? "active" : "done" : ""}`}
  >
            {i < activeStep ? "\u2713" : i + 1}
            <br />{step}
          </div>)}
      </div>

      {/* Map */}
      <ImpactMap useRealSensor={useRealSensor} mapData={mapData} />

      {
    /* Results Grid */
  }
      {result && <>
          {
    /* Source badge */
  }
          <div style={{ marginBottom: 16, display: "flex", gap: 8, alignItems: "center" }}>
            <span
    className={`card-badge ${(result.layers?.["2_sensors"]?.source || result.sensor_source) === "phyphox" ? "badge-critical" : "badge-medium"}`}
    style={{ padding: "6px 14px", fontSize: "0.8rem" }}
  >
              {(result.layers?.["2_sensors"]?.source || result.sensor_source) === "phyphox" ? "Live Phyphox Data" : "Synthetic Data"}
            </span>
            <span className="text-muted" style={{ fontSize: "0.8rem" }}>
              {result.layers?.["2_sensors"]?.reading_count ?? result.sensor_reading_count ?? 0} readings from {result.layers?.["2_sensors"]?.device_count ?? result.sensor_device_count ?? 0} device(s)
            </span>
          </div>

          <div className="stat-grid">
            <div className="stat-card">
              <div className={`stat-value ${result.under_30s ? "cyan" : "red"}`}>
                {result.total_time_s}s
              </div>
              <div className="stat-label">{result.under_30s ? "Under 30s!" : "Over 30s"}</div>
            </div>
            <div className="stat-card">
              <div className="stat-value amber">
                {result.layers?.["4_verification"]?.verified_score ?? "\u2014"}
              </div>
              <div className="stat-label">Verified Score</div>
            </div>
            <div className="stat-card">
              <div className="stat-value purple">
                {result.layers?.["5_impact"]?.radius_km ?? "\u2014"} km
              </div>
              <div className="stat-label">Impact Radius</div>
            </div>
            <div className="stat-card">
              <div className="stat-value red">
                {result.layers?.["6_survivors"]?.total_clusters ?? "\u2014"}
              </div>
              <div className="stat-label">Survivor Clusters</div>
            </div>
            <div className="stat-card">
              <div className="stat-value blue">
                {result.layers?.["8_9_dispatch_routing"]?.units_deployed ?? "\u2014"}
              </div>
              <div className="stat-label">Units Dispatched</div>
            </div>
            <div className="stat-card">
              <div className="stat-value cyan">
                {result.layers?.["5_impact"]?.summary?.hospitals_affected ?? "\u2014"}
              </div>
              <div className="stat-label">Hospitals Affected</div>
            </div>
          </div>

          {
    /* Layer Timing */
  }
          <div className="card" style={{ marginBottom: 24 }}>
            <div className="card-header">
              <span className="card-title">Layer Timing Breakdown</span>
              <span className="card-badge badge-low">Performance</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 8 }}>
              {Object.entries(result.timing || {}).map(([key, val]) => <div key={key} style={{ padding: "8px 12px", background: "rgba(255,255,255,0.02)", borderRadius: 8, fontSize: "0.8rem" }}>
                  <span className="text-muted">{key.replace(/_ms$/, "")}</span>
                  <span className="mono" style={{ float: "right", color: "var(--text-primary)" }}>{val}ms</span>
                </div>)}
            </div>
          </div>

          {
    /* Dispatch Table */
  }
          {result.layers?.["8_9_dispatch_routing"]?.dispatches?.length > 0 && <div className="card" style={{ marginBottom: 24 }}>
              <div className="card-header">
                <span className="card-title">Dispatch Assignments</span>
              </div>
              <table className="dispatch-table">
                <thead>
                  <tr><th>Unit</th><th>Type</th><th>Zone</th><th>ETA</th><th>Route</th></tr>
                </thead>
                <tbody>
                  {result.layers["8_9_dispatch_routing"].dispatches.map((d, i) => <tr key={i}>
                      <td className="mono">{d.unit_id}</td>
                      <td><span className={`card-badge ${d.unit_type === "ambulance" ? "badge-critical" : "badge-medium"}`}>{d.unit_type}</span></td>
                      <td>Zone {d.zone_id}</td>
                      <td className="mono" style={{ color: "var(--severity-high)" }}>{d.eta_minutes} min</td>
                      <td className="text-muted" style={{ fontSize: "0.75rem" }}>{d.route?.route_nodes?.join(" → ")}</td>
                    </tr>)}
                </tbody>
              </table>
            </div>}

          {
    /* AI Summary */
  }
          {result.layers?.["10_11_ai"]?.incident_summary && <div className="card">
              <div className="card-header">
                <span className="card-title">AI Incident Summary</span>
                <span className="card-badge badge-low">{result.layers["10_11_ai"]?.ai_orchestration?.mode || "N/A"}</span>
              </div>
              <pre style={{ whiteSpace: "pre-wrap", fontSize: "0.85rem", color: "var(--text-secondary)", fontFamily: "Inter, sans-serif", lineHeight: 1.8 }}>
                {result.layers["10_11_ai"].incident_summary}
              </pre>
            </div>}
        </>}

      {/* Event Log */}
      <div className="card" style={{ marginTop: 24 }}>
        <div className="card-header">
          <span className="card-title">Event Log</span>
          <span className="text-muted" style={{ fontSize: "0.75rem" }}>{logs.length} events</span>
        </div>
        <div className="event-log" ref={logRef}>
          {logs.map((log, i) => <div key={i} className={`log-entry ${log.type}`}>
              <span className="log-time">{log.time}</span>
              <span>{log.msg}</span>
            </div>)}
          {logs.length === 0 && <p className="text-muted" style={{ textAlign: "center", padding: 40 }}>Click "Trigger Earthquake" to begin simulation</p>}
        </div>
      </div>
    </div>
}
