import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow
});
function svgIcon(emoji, size = 28) {
  return L.divIcon({
    html: `<span style="font-size:${size}px;line-height:1">${emoji}</span>`,
    className: "aurora-marker",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2]
  });
}
const INFRA_ICONS = {
  hospital: "H",
  school: "S",
  fire_station: "F",
  police_station: "P",
  shelter: "S",
  bridge: "B",
  water_supply: "W"
};
const UNIT_ICONS = {
  ambulance: "A",
  fire_truck: "F",
  police: "P",
  ndrf: "N"
};
export default function AuroraMap({ data = {}, points = [], height = 500 }) {
  const mapRef = useRef(null);
  const leafletMap = useRef(null);
  const layersRef = useRef([]);
  useEffect(() => {
    if (!mapRef.current || leafletMap.current) return;
    const center = data.epicenter ? [data.epicenter.lat, data.epicenter.lon] : [18.5204, 73.8567];
    const map = L.map(mapRef.current, {
      center,
      zoom: 13,
      zoomControl: true
    });
    L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
      maxZoom: 19
    }).addTo(map);

    leafletMap.current = map;
    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
    });
    resizeObserver.observe(mapRef.current);
    return () => {
      resizeObserver.disconnect();
      map.remove();
      leafletMap.current = null;
    };
  }, []);
  useEffect(() => {
    const map = leafletMap.current;
    if (!map) return;
    layersRef.current.forEach((lg) => lg.clearLayers());
    layersRef.current = [];
    if (data.epicenter) {
      map.setView([data.epicenter.lat, data.epicenter.lon], 13);
    }
    if (data.impactPolygon?.geometry) {
      const impactLayer = L.layerGroup().addTo(map);
      layersRef.current.push(impactLayer);
      L.geoJSON(data.impactPolygon, {
        style: {
          color: "var(--severity-critical)",
          fillColor: "var(--severity-critical)",
          fillOpacity: 0.08,
          weight: 2,
          dashArray: "8 4"
        }
      }).addTo(impactLayer);
      if (data.epicenter) {
        L.marker([data.epicenter.lat, data.epicenter.lon], { icon: svgIcon("EP", 36) }).bindPopup(`<b>Epicenter</b><br/>Lat: ${data.epicenter.lat.toFixed(4)}<br/>Lon: ${data.epicenter.lon.toFixed(4)}`).addTo(impactLayer);
      }
    }
    if (data.affectedInfra?.length) {
      const infraLayer = L.layerGroup().addTo(map);
      layersRef.current.push(infraLayer);
      data.affectedInfra.forEach((infra) => {
        const icon = svgIcon(INFRA_ICONS[infra.type] || "I", 22);
        L.marker([infra.lat, infra.lon], { icon }).bindPopup(
          `<b>${infra.name}</b><br/>Type: ${infra.type}<br/>Distance: ${infra.distance_from_epicenter_km ?? "?"} km<br/>Damage: <span style="color:${infra.estimated_damage === "severe" ? "var(--severity-critical)" : infra.estimated_damage === "moderate" ? "var(--severity-high)" : "var(--severity-low)"}">${infra.estimated_damage ?? "unknown"}</span>`
        ).addTo(infraLayer);
      });
    }
    if (data.sosReports?.length) {
      const sosLayer = L.layerGroup().addTo(map);
      layersRef.current.push(sosLayer);
      data.sosReports.forEach((report) => {
        const color = report.severity >= 4 ? "var(--severity-critical)" : report.severity >= 3 ? "var(--severity-high)" : "var(--severity-low)";
        L.circleMarker([report.lat, report.lon], {
          radius: 4 + report.severity,
          color,
          fillColor: color,
          fillOpacity: 0.6,
          weight: 1
        }).bindPopup(`<b>SOS (Severity ${report.severity})</b><br/>${report.message || "No message"}`).addTo(sosLayer);
      });
    }
    if (data.clusters?.length) {
      const clusterLayer = L.layerGroup().addTo(map);
      layersRef.current.push(clusterLayer);
      data.clusters.forEach((cluster) => {
        const color = cluster.priority_level === "CRITICAL" ? "var(--severity-critical)" : cluster.priority_level === "HIGH" ? "var(--severity-high)" : "var(--severity-medium)";
        L.circle([cluster.centroid.lat, cluster.centroid.lon], {
          radius: 300,
          // ~300m visual radius
          color,
          fillColor: color,
          fillOpacity: 0.15,
          weight: 2
        }).addTo(clusterLayer);
        L.marker([cluster.centroid.lat, cluster.centroid.lon], {
          icon: L.divIcon({
            html: `<div style="background:${color};color:#fff;border-radius:50%;width:32px;height:32px;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:14px;border:2px solid #fff3">${cluster.survivor_count}</div>`,
            className: "aurora-marker",
            iconSize: [32, 32],
            iconAnchor: [16, 16]
          })
        }).bindPopup(
          `<b>Cluster #${cluster.cluster_id}</b><br/>Survivors: ${cluster.survivor_count}<br/>Avg Severity: ${cluster.avg_severity}<br/>Priority: <b style="color:${color}">${cluster.priority_level || "N/A"}</b>`
        ).addTo(clusterLayer);
      });
    }
    if (data.dispatches?.length) {
      const routeLayer = L.layerGroup().addTo(map);
      layersRef.current.push(routeLayer);
      data.dispatches.forEach((dispatch, i) => {
        const routeGeo = dispatch.route?.route_geojson;
        if (routeGeo?.geometry) {
          const color = dispatch.unit_type === "ambulance" ? "var(--severity-low)" : dispatch.unit_type === "fire_truck" ? "var(--severity-high)" : "var(--text-secondary)";
          L.geoJSON(routeGeo, {
            style: {
              color,
              weight: 4,
              opacity: 0.8,
              dashArray: dispatch.unit_type === "ambulance" ? void 0 : "6 4"
            }
          }).addTo(routeLayer);
        }
      });
    }
    if (data.resourceUnits?.length) {
      const unitLayer = L.layerGroup().addTo(map);
      layersRef.current.push(unitLayer);
      data.resourceUnits.forEach((unit) => {
        const icon = svgIcon(UNIT_ICONS[unit.type] || "U", 24);
        L.marker([unit.lat, unit.lon], { icon }).bindPopup(`<b>${unit.unit_name}</b><br/>Type: ${unit.type}`).addTo(unitLayer);
      });
    }
    if (points.length) {
      const pointsLayer = L.layerGroup().addTo(map);
      layersRef.current.push(pointsLayer);
      const bounds = [];
      points.forEach((point) => {
        if (typeof point.lat !== "number" || typeof point.lon !== "number") return;
        const icon = svgIcon(point.type === "responder" ? "R" : point.type === "incident" ? "!" : "P", 24);
        const latLng = [point.lat, point.lon];
        bounds.push(latLng);
        L.marker(latLng, { icon }).bindPopup(`<b>${point.label || "Map Point"}</b>`).addTo(pointsLayer);
      });
      if (!data.epicenter && bounds.length) {
        map.fitBounds(bounds, { padding: [36, 36], maxZoom: 14 });
      }
    }
  }, [data, points]);
  return <div
    ref={mapRef}
    style={{
      width: "100%",
      height: `${height}px`,
      borderRadius: "var(--radius-lg)",
      overflow: "hidden",
      border: "1px solid var(--border-subtle)"
    }}
  />;
}
