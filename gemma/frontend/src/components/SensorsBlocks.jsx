import React from 'react';
import { api } from '../api';

export default function SensorsBlocks({ useRealSensor, sensorStatus, testSensor }) {
  if (!useRealSensor) return null;

  return (
    <div className="card" style={{ marginBottom: 16, padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <strong style={{ fontSize: "0.9rem" }}>Phyphox Device Network</strong>
          <span className={`status-pill ${sensorStatus.status === "connected" ? "online" : "alert"}`} style={{ fontSize: "0.7rem" }}>
            {sensorStatus.status === "testing" ? "◌ Testing..." : sensorStatus.status === "connected" ? "● Connected" : sensorStatus.status === "unreachable" ? "○ Unreachable" : sensorStatus.status === "error" ? "✕ Error" : "○ Not Tested"}
          </span>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button className="btn btn-outline" style={{ padding: "6px 14px", fontSize: "0.75rem" }} onClick={testSensor}>
            Test All
          </button>
          <button
            className="btn btn-outline"
            style={{ padding: "6px 14px", fontSize: "0.75rem" }}
            onClick={async () => {
              const ip = prompt("Enter Phyphox phone IP address (e.g., 192.168.31.100):");
              if (ip) {
                const name = prompt("Device name (optional):", `Phone-${ip.split(".").pop()}`);
                await api.registerDevice(ip, name || void 0);
                testSensor();
              }
            }}
          >
            Add Device
          </button>
        </div>
      </div>

      {sensorStatus.status === "connected" && sensorStatus.sensors && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 8, fontSize: "0.78rem" }}>
          <div style={{ padding: "8px 12px", background: "rgba(255,255,255,0.02)", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)" }}>
            <span className="text-muted">Accelerometer</span><br />
            <span className="mono" style={{ color: "var(--text-primary)" }}>
              X:{sensorStatus.sensors.accelerometer[0]?.toFixed(3)}
              {" "}Y:{sensorStatus.sensors.accelerometer[1]?.toFixed(3)}
              {" "}Z:{sensorStatus.sensors.accelerometer[2]?.toFixed(3)}
            </span>
          </div>
          <div style={{ padding: "8px 12px", background: "rgba(255,255,255,0.02)", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)" }}>
            <span className="text-muted">Gyroscope</span><br />
            <span className="mono" style={{ color: "var(--text-primary)" }}>
              X:{sensorStatus.sensors.gyroscope[0]?.toFixed(3)}
              {" "}Y:{sensorStatus.sensors.gyroscope[1]?.toFixed(3)}
              {" "}Z:{sensorStatus.sensors.gyroscope[2]?.toFixed(3)}
            </span>
          </div>
          <div style={{ padding: "8px 12px", background: "rgba(255,255,255,0.02)", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)" }}>
            <span className="text-muted">Linear Acceleration</span><br />
            <span className="mono" style={{ color: "var(--text-primary)" }}>
              X:{sensorStatus.sensors.linear_acceleration[0]?.toFixed(3)}
              {" "}Y:{sensorStatus.sensors.linear_acceleration[1]?.toFixed(3)}
              {" "}Z:{sensorStatus.sensors.linear_acceleration[2]?.toFixed(3)}
            </span>
          </div>
          <div style={{ padding: "8px 12px", background: sensorStatus.has_gps ? "rgba(255,255,255,0.02)" : "rgba(232,80,2,0.06)", borderRadius: 8, border: `1px solid ${sensorStatus.has_gps ? "rgba(255,255,255,0.1)" : "rgba(232,80,2,0.15)"}` }}>
            <span className="text-muted">Location {sensorStatus.has_gps ? "[OK]" : "[NO GPS]"}</span><br />
            <span className="mono" style={{ color: sensorStatus.has_gps ? "var(--text-primary)" : "var(--severity-critical)" }}>
              {sensorStatus.has_gps ? `${sensorStatus.sensors.location.lat?.toFixed(5)}, ${sensorStatus.sensors.location.lon?.toFixed(5)}` : "Enable GPS in Phyphox"}
            </span>
          </div>
        </div>
      )}

      {sensorStatus.status === "unreachable" && (
        <div style={{ padding: 12, background: "rgba(232,80,2,0.08)", borderRadius: 8, fontSize: "0.8rem", color: "var(--severity-critical)" }}>
          No devices reachable. Click "Add Device" to register a Phyphox phone by IP.
          <br /><span className="text-muted" style={{ fontSize: "0.75rem" }}>Make sure: (1) Phyphox is open on phone (2) Remote access is enabled (3) Both devices are on same WiFi</span>
        </div>
      )}
    </div>
  );
}
