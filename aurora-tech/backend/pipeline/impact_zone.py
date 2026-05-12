"""
Layer 5: Impact Estimation
PostGIS-based circular buffer around epicenter, then intersects with
critical_infrastructure to determine affected assets.
Uses Shapely for geometry when running without PostGIS (demo mode).
"""

import logging
import math
from typing import List, Dict, Any, Tuple
from shapely.geometry import Point, shape
from shapely.ops import transform
import pyproj
from functools import partial

logger = logging.getLogger(__name__)

# ─── Pune Critical Infrastructure Seed Data ─────────────────────────────
# Pre-seeded for Hackathon demo — in production this comes from PostGIS
PUNE_INFRASTRUCTURE = [
    # Hospitals
    {"name": "Sahyadri Hospital, Deccan", "type": "hospital", "lat": 18.5158, "lon": 73.8410, "capacity": 300},
    {"name": "Ruby Hall Clinic, Pune", "type": "hospital", "lat": 18.5308, "lon": 73.8810, "capacity": 500},
    {"name": "Sassoon General Hospital", "type": "hospital", "lat": 18.5239, "lon": 73.8700, "capacity": 1300},
    {"name": "Deenanath Mangeshkar Hospital", "type": "hospital", "lat": 18.4972, "lon": 73.8166, "capacity": 400},
    {"name": "KEM Hospital, Rasta Peth", "type": "hospital", "lat": 18.5123, "lon": 73.8623, "capacity": 600},
    {"name": "Jehangir Hospital", "type": "hospital", "lat": 18.5283, "lon": 73.8741, "capacity": 350},
    # Schools / Universities
    {"name": "Savitribai Phule Pune University", "type": "school", "lat": 18.5565, "lon": 73.8250, "capacity": 10000},
    {"name": "Fergusson College", "type": "school", "lat": 18.5242, "lon": 73.8402, "capacity": 5000},
    {"name": "COEP Technological University", "type": "school", "lat": 18.5290, "lon": 73.8508, "capacity": 4000},
    {"name": "Symbiosis International University", "type": "school", "lat": 18.5642, "lon": 73.9174, "capacity": 8000},
    # Fire Stations
    {"name": "Pune Fire Station - Shivajinagar", "type": "fire_station", "lat": 18.5314, "lon": 73.8446, "capacity": 50},
    {"name": "Pune Fire Station - Swargate", "type": "fire_station", "lat": 18.5018, "lon": 73.8636, "capacity": 50},
    {"name": "Pune Fire Station - Kothrud", "type": "fire_station", "lat": 18.5074, "lon": 73.8077, "capacity": 40},
    # Police Stations
    {"name": "Shivajinagar Police Station", "type": "police_station", "lat": 18.5320, "lon": 73.8470, "capacity": 80},
    {"name": "Deccan Police Station", "type": "police_station", "lat": 18.5170, "lon": 73.8390, "capacity": 60},
    {"name": "Hinjewadi Police Station", "type": "police_station", "lat": 18.5912, "lon": 73.7389, "capacity": 50},
    # Shelters / Open Grounds
    {"name": "Sambhaji Park, Deccan", "type": "shelter", "lat": 18.5171, "lon": 73.8413, "capacity": 2000},
    {"name": "Pune Race Course", "type": "shelter", "lat": 18.5225, "lon": 73.8596, "capacity": 5000},
    {"name": "Magarpatta City Open Grounds", "type": "shelter", "lat": 18.5130, "lon": 73.9270, "capacity": 3000},
    # Bridges
    {"name": "Sangam Bridge, Pune", "type": "bridge", "lat": 18.5110, "lon": 73.8570, "capacity": None},
    {"name": "Z-Bridge, Pune Station", "type": "bridge", "lat": 18.5283, "lon": 73.8743, "capacity": None},
]


def _create_geodesic_buffer(lat: float, lon: float, radius_km: float, segments: int = 64):
    """
    Create a circular buffer around a point using geodesic (real-world) distance.
    Returns a Shapely Polygon in EPSG:4326.
    """
    # Project to a local UTM zone for accurate distance buffering
    local_crs = pyproj.CRS(f"+proj=aeqd +lat_0={lat} +lon_0={lon} +datum=WGS84")
    wgs84 = pyproj.CRS("EPSG:4326")

    project_to_local = pyproj.Transformer.from_crs(wgs84, local_crs, always_xy=True).transform
    project_to_wgs84 = pyproj.Transformer.from_crs(local_crs, wgs84, always_xy=True).transform

    # Create buffer in local projection (meters)
    center_local = transform(project_to_local, Point(lon, lat))
    buffer_local = center_local.buffer(radius_km * 1000, resolution=segments)

    # Transform back to WGS84
    buffer_wgs84 = transform(project_to_wgs84, buffer_local)
    return buffer_wgs84


def estimate_impact_radius(magnitude: float, depth_km: float) -> float:
    """
    Estimate impact radius in km based on magnitude and depth.
    Uses a simplified attenuation model.
    
    For Zone III (Pune), moderate amplification factor applied.
    """
    # Base radius: empirical formula for felt area
    # R = 10^(0.5 * M - 1.0) adjusted for depth
    base_radius = 10 ** (0.5 * magnitude - 1.0)

    # Depth factor: shallower → wider impact
    depth_factor = max(0.5, 1.0 - (depth_km / 100.0))

    # Zone III amplification factor (alluvial soil in Pune river basin)
    zone_amplification = 1.15

    radius_km = base_radius * depth_factor * zone_amplification
    return round(min(radius_km, 50.0), 2)  # Cap at 50km


def compute_impact_zone(
    epicenter_lat: float,
    epicenter_lon: float,
    magnitude: float,
    depth_km: float = 10.0,
    infrastructure: List[Dict] = None,
) -> Dict[str, Any]:
    """
    Main impact estimation function.
    
    1. Computes impact radius from magnitude/depth.
    2. Creates geodesic circular buffer around epicenter.
    3. Intersects with critical infrastructure.
    4. Returns affected infra list, impact polygon (GeoJSON), and stats.
    """
    if infrastructure is None:
        infrastructure = PUNE_INFRASTRUCTURE

    # Step 1: Estimate radius
    radius_km = estimate_impact_radius(magnitude, depth_km)

    # Step 2: Create buffer polygon
    impact_polygon = _create_geodesic_buffer(epicenter_lat, epicenter_lon, radius_km)

    # Step 3: Intersect with infrastructure
    epicenter = Point(epicenter_lon, epicenter_lat)
    affected = []
    for infra in infrastructure:
        infra_point = Point(infra["lon"], infra["lat"])
        if impact_polygon.contains(infra_point):
            # Compute distance from epicenter
            dist_km = _haversine(epicenter_lat, epicenter_lon, infra["lat"], infra["lon"])
            affected.append({
                **infra,
                "distance_from_epicenter_km": round(dist_km, 2),
                "estimated_damage": _estimate_damage_level(magnitude, dist_km, depth_km),
            })

    # Sort by distance (closest first)
    affected.sort(key=lambda x: x["distance_from_epicenter_km"])

    # Stats
    hospitals_affected = [a for a in affected if a["type"] == "hospital"]
    schools_affected = [a for a in affected if a["type"] == "school"]
    total_capacity_at_risk = sum(a.get("capacity", 0) or 0 for a in affected)

    result = {
        "epicenter": {"lat": epicenter_lat, "lon": epicenter_lon},
        "magnitude": magnitude,
        "depth_km": depth_km,
        "impact_radius_km": radius_km,
        "impact_polygon_geojson": _polygon_to_geojson(impact_polygon),
        "affected_infrastructure": affected,
        "summary": {
            "total_affected": len(affected),
            "hospitals_affected": len(hospitals_affected),
            "schools_affected": len(schools_affected),
            "fire_stations_affected": len([a for a in affected if a["type"] == "fire_station"]),
            "shelters_in_zone": len([a for a in affected if a["type"] == "shelter"]),
            "total_capacity_at_risk": total_capacity_at_risk,
        },
    }

    logger.info(
        f"Impact Zone: radius={radius_km}km, "
        f"affected={len(affected)} infra, "
        f"hospitals={len(hospitals_affected)}, "
        f"schools={len(schools_affected)}"
    )
    return result


def _haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Haversine distance in km."""
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(dlon / 2) ** 2)
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _estimate_damage_level(magnitude: float, distance_km: float, depth_km: float) -> str:
    """Simplified damage estimate based on distance from epicenter."""
    # Modified Mercalli-style approximation
    intensity = magnitude - 1.5 * math.log10(max(distance_km, 0.1)) - 0.5 * math.log10(max(depth_km, 1))
    if intensity >= 7:
        return "severe"
    elif intensity >= 5:
        return "moderate"
    elif intensity >= 3:
        return "light"
    else:
        return "minimal"


def _polygon_to_geojson(polygon) -> Dict:
    """Convert Shapely polygon to GeoJSON."""
    coords = list(polygon.exterior.coords)
    return {
        "type": "Feature",
        "geometry": {
            "type": "Polygon",
            "coordinates": [[[c[0], c[1]] for c in coords]],
        },
        "properties": {"type": "impact_zone"},
    }
