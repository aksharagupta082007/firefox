"""
Layer 9: Safe Routing
NetworkX-based navigation avoiding blocked/risky roads.
Uses OSMnx to load Pune road network and computes weighted shortest paths.
Falls back to Haversine straight-line if OSM data is unavailable.
"""

import logging
import math
import json
from typing import List, Dict, Any, Tuple, Optional
import networkx as nx

logger = logging.getLogger(__name__)

# ─── Pune Road Network (Simplified for Demo) ──────────────────────────
# In production, load via osmnx.graph_from_place("Pune, Maharashtra, India", network_type="drive")
# For the hackathon demo, we pre-build a simplified graph of key Pune roads.

# Key Pune intersections as graph nodes (node_id: (lat, lon, name))
PUNE_NODES = {
    1:  (18.5314, 73.8446, "Shivajinagar"),
    2:  (18.5204, 73.8567, "Pune Station"),
    3:  (18.5018, 73.8636, "Swargate"),
    4:  (18.5074, 73.8077, "Kothrud"),
    5:  (18.5565, 73.8250, "Aundh / SPPU"),
    6:  (18.5912, 73.7389, "Hinjewadi IT Park"),
    7:  (18.5130, 73.9270, "Magarpatta / Hadapsar"),
    8:  (18.5283, 73.8741, "Koregaon Park"),
    9:  (18.5171, 73.8413, "Deccan Gymkhana"),
    10: (18.4972, 73.8166, "Erandwane / Karve Road"),
    11: (18.5642, 73.9174, "Viman Nagar"),
    12: (18.5225, 73.8596, "Camp / Race Course"),
    13: (18.5158, 73.8410, "JM Road / FC Road Junction"),
    14: (18.4830, 73.8550, "Katraj"),
    15: (18.5400, 73.8900, "Yerwada"),
    16: (18.5600, 73.7700, "Baner / Balewadi"),
    17: (18.5239, 73.8700, "Sassoon / BJ Medical"),
    18: (18.5500, 73.8500, "Model Colony / University Rd"),
}

# Road connections (node_a, node_b, road_name, base_speed_kmh)
PUNE_EDGES = [
    (1, 2, "JM Road → Station Rd", 30),
    (1, 9, "FC Road", 25),
    (1, 5, "University Road", 35),
    (1, 8, "East Street", 30),
    (2, 3, "Laxmi Road → Swargate", 25),
    (2, 12, "Station → Camp", 30),
    (2, 17, "Sassoon Road", 20),
    (3, 14, "Satara Road", 40),
    (3, 7, "Solapur Road", 35),
    (4, 9, "Karve Road", 30),
    (4, 10, "Paud Road", 35),
    (4, 16, "Kothrud → Baner", 40),
    (5, 6, "Aundh → Hinjewadi (NH48)", 50),
    (5, 16, "Aundh → Baner", 35),
    (5, 18, "University Road North", 30),
    (6, 16, "Hinjewadi → Baner", 45),
    (7, 11, "Magarpatta → Viman Nagar", 35),
    (7, 3, "Hadapsar → Swargate", 30),
    (8, 12, "Koregaon Park → Camp", 25),
    (8, 15, "KP → Yerwada", 30),
    (8, 11, "Nagar Road Stretch", 40),
    (9, 13, "Deccan → JM Road", 20),
    (9, 4, "Karve Road West", 30),
    (10, 14, "Sinhagad Road", 35),
    (11, 15, "Airport Road", 45),
    (12, 17, "Camp → Sassoon", 20),
    (13, 1, "FC Road North", 25),
    (15, 2, "Yerwada → Station", 30),
    (16, 18, "Baner → Model Colony", 30),
    (18, 1, "Model Colony → Shivajinagar", 25),
]


def _haversine(lat1, lon1, lat2, lon2):
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def build_pune_graph(blocked_roads: List[Tuple[int, int]] = None) -> nx.Graph:
    """
    Build the Pune road network graph.
    Edge weights = travel_time_minutes = distance_km / speed_kmh * 60
    
    Args:
        blocked_roads: List of (node_a, node_b) tuples to remove (earthquake damage).
    """
    G = nx.Graph()

    # Add nodes
    for nid, (lat, lon, name) in PUNE_NODES.items():
        G.add_node(nid, lat=lat, lon=lon, name=name)

    # Add edges with travel time weights
    for a, b, road_name, speed in PUNE_EDGES:
        lat_a, lon_a, _ = PUNE_NODES[a]
        lat_b, lon_b, _ = PUNE_NODES[b]
        dist_km = _haversine(lat_a, lon_a, lat_b, lon_b)
        travel_time_min = (dist_km / speed) * 60

        G.add_edge(a, b,
                    distance_km=round(dist_km, 3),
                    travel_time_min=round(travel_time_min, 2),
                    road_name=road_name,
                    speed_kmh=speed,
                    is_blocked=False)

    # Remove blocked roads
    if blocked_roads:
        for a, b in blocked_roads:
            if G.has_edge(a, b):
                G[a][b]["is_blocked"] = True
                G[a][b]["travel_time_min"] = 9999  # effectively block
                logger.info(f"Road blocked: {PUNE_NODES[a][2]} ↔ {PUNE_NODES[b][2]}")

    return G


def find_nearest_node(G: nx.Graph, lat: float, lon: float) -> int:
    """Find the graph node nearest to (lat, lon)."""
    min_dist = float("inf")
    nearest = None
    for nid, data in G.nodes(data=True):
        d = _haversine(lat, lon, data["lat"], data["lon"])
        if d < min_dist:
            min_dist = d
            nearest = nid
    return nearest


def compute_safe_route(
    G: nx.Graph,
    from_lat: float,
    from_lon: float,
    to_lat: float,
    to_lon: float,
) -> Optional[Dict[str, Any]]:
    """
    Compute the safest (fastest avoiding blocked roads) route.
    
    Returns:
        Dict with route_nodes, route_names, geojson_linestring, 
        total_distance_km, eta_minutes.
        None if no path exists.
    """
    src = find_nearest_node(G, from_lat, from_lon)
    dst = find_nearest_node(G, to_lat, to_lon)

    if src is None or dst is None:
        return None

    try:
        path = nx.shortest_path(G, src, dst, weight="travel_time_min")
    except nx.NetworkXNoPath:
        logger.warning(f"No safe route from node {src} to {dst}")
        return None

    # Build route details
    total_dist = 0.0
    total_time = 0.0
    road_names = []
    coordinates = []

    for i in range(len(path)):
        nid = path[i]
        node_data = G.nodes[nid]
        coordinates.append([node_data["lon"], node_data["lat"]])

        if i < len(path) - 1:
            edge_data = G[path[i]][path[i + 1]]
            total_dist += edge_data["distance_km"]
            total_time += edge_data["travel_time_min"]
            road_names.append(edge_data["road_name"])

    geojson = {
        "type": "Feature",
        "geometry": {
            "type": "LineString",
            "coordinates": coordinates,
        },
        "properties": {
            "distance_km": round(total_dist, 2),
            "eta_minutes": round(total_time, 1),
            "road_names": road_names,
        },
    }

    return {
        "route_nodes": [PUNE_NODES[n][2] for n in path],
        "road_names": road_names,
        "route_geojson": geojson,
        "total_distance_km": round(total_dist, 2),
        "eta_minutes": round(total_time, 1),
        "source_node": PUNE_NODES[src][2],
        "destination_node": PUNE_NODES[dst][2],
    }


def compute_all_dispatch_routes(
    resource_locations: List[Dict[str, Any]],
    zone_centroids: List[Dict[str, Any]],
    blocked_roads: List[Tuple[int, int]] = None,
) -> List[Dict[str, Any]]:
    """
    For each rescue zone, find the best resource unit + route.
    Assigns closest available unit to highest-priority zone first.
    
    Args:
        resource_locations: [{"id": ..., "lat": ..., "lon": ..., "type": ...}]
        zone_centroids: [{"zone_id": ..., "lat": ..., "lon": ..., "priority_score": ...}]
        blocked_roads: roads to avoid
    
    Returns:
        List of dispatch assignments with routes.
    """
    G = build_pune_graph(blocked_roads)

    # Sort zones by priority (highest first)
    zones_sorted = sorted(zone_centroids, key=lambda z: z.get("priority_score", 0), reverse=True)

    assigned_units = set()
    dispatches = []

    for zone in zones_sorted:
        best_route = None
        best_unit = None
        best_eta = float("inf")

        for unit in resource_locations:
            if unit["id"] in assigned_units:
                continue

            route = compute_safe_route(
                G, unit["lat"], unit["lon"],
                zone["lat"], zone["lon"]
            )
            if route and route["eta_minutes"] < best_eta:
                best_eta = route["eta_minutes"]
                best_route = route
                best_unit = unit

        if best_unit and best_route:
            assigned_units.add(best_unit["id"])
            dispatches.append({
                "zone_id": zone["zone_id"],
                "zone_priority": zone.get("priority_score", 0),
                "unit_id": best_unit["id"],
                "unit_type": best_unit.get("type", "unknown"),
                "route": best_route,
                "eta_minutes": best_route["eta_minutes"],
            })

    logger.info(f"Dispatch routing: {len(dispatches)} units assigned to {len(zones_sorted)} zones")
    return dispatches
