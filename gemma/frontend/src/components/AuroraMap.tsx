import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet default marker icons (Vite asset issue)
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

// ── Custom Icons ────────────────────────────────────────────────────
function svgIcon(emoji: string, size = 28): L.DivIcon {
  return L.divIcon({
    html: `<span style="font-size:${size}px;line-height:1">${emoji}</span>`,
    className: 'aurora-marker',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

const INFRA_ICONS: Record<string, string> = {
  hospital: '🏥',
  school: '🏫',
  fire_station: '🚒',
  police_station: '🚔',
  shelter: '⛺',
  bridge: '🌉',
  water_supply: '💧',
};

const UNIT_ICONS: Record<string, string> = {
  ambulance: '🚑',
  fire_truck: '🚒',
  police: '🚔',
  ndrf: '🛡️',
};

// ── Types ───────────────────────────────────────────────────────────
interface MapData {
  epicenter?: { lat: number; lon: number };
  impactPolygon?: any; // GeoJSON Feature
  affectedInfra?: Array<{ name: string; type: string; lat: number; lon: number; estimated_damage?: string; distance_from_epicenter_km?: number }>;
  clusters?: Array<{ cluster_id: number; centroid: { lat: number; lon: number }; survivor_count: number; avg_severity: number; priority_level?: string }>;
  heatmapPoints?: Array<[number, number, number]>; // [lat, lon, intensity]
  sosReports?: Array<{ lat: number; lon: number; severity: number; message?: string }>;
  dispatches?: Array<{ unit_id: number; unit_type: string; zone_id: number; eta_minutes: number; route?: { route_geojson?: any } }>;
  resourceUnits?: Array<{ id: number; unit_name: string; type: string; lat: number; lon: number }>;
  blockedRoads?: Array<[number, number]>;
}

interface AuroraMapProps {
  data: MapData;
  height?: number;
}

export default function AuroraMap({ data, height = 500 }: AuroraMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMap = useRef<L.Map | null>(null);
  const layersRef = useRef<L.LayerGroup[]>([]);

  // Initialize map once
  useEffect(() => {
    if (!mapRef.current || leafletMap.current) return;

    const center: [number, number] = data.epicenter
      ? [data.epicenter.lat, data.epicenter.lon]
      : [18.5204, 73.8567]; // default Pune

    const map = L.map(mapRef.current, {
      center,
      zoom: 13,
      zoomControl: true,
    });

    // Dark tile layer for premium look
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
      maxZoom: 19,
    }).addTo(map);

    leafletMap.current = map;

    // Fix for Leaflet not rendering correctly when its container is initially hidden (display: none)
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

  // Update layers when data changes
  useEffect(() => {
    const map = leafletMap.current;
    if (!map) return;

    // Clear previous layers
    layersRef.current.forEach(lg => lg.clearLayers());
    layersRef.current = [];

    // Recenter if epicenter changed
    if (data.epicenter) {
      map.setView([data.epicenter.lat, data.epicenter.lon], 13);
    }

    // ── Impact Zone Polygon ─────────────────────────────────────
    if (data.impactPolygon?.geometry) {
      const impactLayer = L.layerGroup().addTo(map);
      layersRef.current.push(impactLayer);

      L.geoJSON(data.impactPolygon, {
        style: {
          color: '#ef476f',
          fillColor: '#ef476f',
          fillOpacity: 0.08,
          weight: 2,
          dashArray: '8 4',
        },
      }).addTo(impactLayer);

      // Epicenter marker
      if (data.epicenter) {
        L.marker([data.epicenter.lat, data.epicenter.lon], { icon: svgIcon('💥', 36) })
          .bindPopup(`<b>Epicenter</b><br/>Lat: ${data.epicenter.lat.toFixed(4)}<br/>Lon: ${data.epicenter.lon.toFixed(4)}`)
          .addTo(impactLayer);
      }
    }

    // ── Infrastructure Markers ───────────────────────────────────
    if (data.affectedInfra?.length) {
      const infraLayer = L.layerGroup().addTo(map);
      layersRef.current.push(infraLayer);

      data.affectedInfra.forEach(infra => {
        const icon = svgIcon(INFRA_ICONS[infra.type] || '📍', 22);
        L.marker([infra.lat, infra.lon], { icon })
          .bindPopup(
            `<b>${infra.name}</b><br/>Type: ${infra.type}<br/>` +
            `Distance: ${infra.distance_from_epicenter_km ?? '?'} km<br/>` +
            `Damage: <span style="color:${infra.estimated_damage === 'severe' ? '#ef476f' : infra.estimated_damage === 'moderate' ? '#ffd166' : '#06d6a0'}">${infra.estimated_damage ?? 'unknown'}</span>`
          )
          .addTo(infraLayer);
      });
    }

    // ── SOS Reports (individual dots) ────────────────────────────
    if (data.sosReports?.length) {
      const sosLayer = L.layerGroup().addTo(map);
      layersRef.current.push(sosLayer);

      data.sosReports.forEach(report => {
        const color = report.severity >= 4 ? '#ef476f' : report.severity >= 3 ? '#ffd166' : '#06d6a0';
        L.circleMarker([report.lat, report.lon], {
          radius: 4 + report.severity,
          color,
          fillColor: color,
          fillOpacity: 0.6,
          weight: 1,
        })
          .bindPopup(`<b>SOS (Severity ${report.severity})</b><br/>${report.message || 'No message'}`)
          .addTo(sosLayer);
      });
    }

    // ── Survivor Clusters ────────────────────────────────────────
    if (data.clusters?.length) {
      const clusterLayer = L.layerGroup().addTo(map);
      layersRef.current.push(clusterLayer);

      data.clusters.forEach(cluster => {
        const color = cluster.priority_level === 'CRITICAL' ? '#ef476f'
          : cluster.priority_level === 'HIGH' ? '#ff6b35'
          : '#ffd166';

        // Cluster area circle
        L.circle([cluster.centroid.lat, cluster.centroid.lon], {
          radius: 300, // ~300m visual radius
          color,
          fillColor: color,
          fillOpacity: 0.15,
          weight: 2,
        }).addTo(clusterLayer);

        // Cluster center marker
        L.marker([cluster.centroid.lat, cluster.centroid.lon], {
          icon: L.divIcon({
            html: `<div style="background:${color};color:#fff;border-radius:50%;width:32px;height:32px;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:14px;box-shadow:0 0 12px ${color}80;border:2px solid #fff3">${cluster.survivor_count}</div>`,
            className: 'aurora-marker',
            iconSize: [32, 32],
            iconAnchor: [16, 16],
          })
        })
          .bindPopup(
            `<b>Cluster #${cluster.cluster_id}</b><br/>` +
            `Survivors: ${cluster.survivor_count}<br/>` +
            `Avg Severity: ${cluster.avg_severity}<br/>` +
            `Priority: <b style="color:${color}">${cluster.priority_level || 'N/A'}</b>`
          )
          .addTo(clusterLayer);
      });
    }

    // ── Dispatch Routes ──────────────────────────────────────────
    if (data.dispatches?.length) {
      const routeLayer = L.layerGroup().addTo(map);
      layersRef.current.push(routeLayer);

      data.dispatches.forEach((dispatch, i) => {
        const routeGeo = dispatch.route?.route_geojson;
        if (routeGeo?.geometry) {
          const color = dispatch.unit_type === 'ambulance' ? '#06d6a0'
            : dispatch.unit_type === 'fire_truck' ? '#ff8c42'
            : '#7b68ee';

          L.geoJSON(routeGeo, {
            style: {
              color,
              weight: 4,
              opacity: 0.8,
              dashArray: dispatch.unit_type === 'ambulance' ? undefined : '6 4',
            },
          }).addTo(routeLayer);
        }
      });
    }

    // ── Resource Unit Markers ─────────────────────────────────────
    if (data.resourceUnits?.length) {
      const unitLayer = L.layerGroup().addTo(map);
      layersRef.current.push(unitLayer);

      data.resourceUnits.forEach(unit => {
        const icon = svgIcon(UNIT_ICONS[unit.type] || '🚐', 24);
        L.marker([unit.lat, unit.lon], { icon })
          .bindPopup(`<b>${unit.unit_name}</b><br/>Type: ${unit.type}`)
          .addTo(unitLayer);
      });
    }

  }, [data]);

  return (
    <div
      ref={mapRef}
      style={{
        width: '100%',
        height: `${height}px`,
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
        border: '1px solid var(--border-subtle)',
      }}
    />
  );
}
