import React from 'react';
import AuroraMap from './AuroraMap';

export default function ImpactMap({ useRealSensor, mapData }) {
  return (
    <div className="card" style={{ marginBottom: 24 }}>
      <div className="card-header">
        <span className="card-title">{useRealSensor ? "Live Location" : "Pune"} Impact Map</span>
        <span className={`card-badge ${useRealSensor ? "badge-critical" : "badge-medium"}`}>
          {useRealSensor ? "LIVE" : "Zone III"}
        </span>
      </div>
      <AuroraMap data={mapData} height={480} />
    </div>
  );
}
