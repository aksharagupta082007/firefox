"""
Layer 6: Survivor Intelligence
KDE Heatmaps and DBSCAN Survivor Clustering.

Takes SOS/distress reports (lat, lon, severity) and:
  1. Generates a KDE heatmap grid (for frontend visualization)
  2. Runs DBSCAN to identify survivor clusters
  3. Computes cluster centroids, boundaries, and stats
"""

import logging
import numpy as np
from typing import List, Dict, Any, Tuple
from scipy.stats import gaussian_kde
from sklearn.cluster import DBSCAN
from shapely.geometry import MultiPoint

logger = logging.getLogger(__name__)

# DBSCAN params tuned for urban Pune density (~500m cluster radius)
DBSCAN_EPS_KM = 0.5      # Max distance between points in a cluster (km)
DBSCAN_MIN_SAMPLES = 3   # Minimum reports to form a cluster
EARTH_RADIUS_KM = 6371.0

# KDE grid resolution
KDE_GRID_SIZE = 100  # 100x100 grid points


def _to_radians(degrees: float) -> float:
    return degrees * np.pi / 180.0


def _haversine_distance_matrix(coords: np.ndarray) -> np.ndarray:
    """
    Compute pairwise Haversine distances in km for DBSCAN.
    coords: Nx2 array of [lat, lon] in degrees.
    """
    n = len(coords)
    lats = np.radians(coords[:, 0])
    lons = np.radians(coords[:, 1])

    dist = np.zeros((n, n))
    for i in range(n):
        dlat = lats - lats[i]
        dlon = lons - lons[i]
        a = np.sin(dlat / 2) ** 2 + np.cos(lats[i]) * np.cos(lats) * np.sin(dlon / 2) ** 2
        dist[i] = EARTH_RADIUS_KM * 2 * np.arctan2(np.sqrt(a), np.sqrt(1 - a))
    return dist


def run_dbscan_clustering(
    reports: List[Dict[str, Any]],
    eps_km: float = DBSCAN_EPS_KM,
    min_samples: int = DBSCAN_MIN_SAMPLES,
) -> List[Dict[str, Any]]:
    """
    Cluster survivor reports using DBSCAN with Haversine metric.
    
    Args:
        reports: List of dicts with 'lat', 'lon', 'severity', 'people_count',
                 'needs_medical', 'is_trapped'.
    
    Returns:
        List of cluster dicts, each containing:
          - cluster_id
          - centroid (lat, lon)
          - boundary_geojson (convex hull)
          - survivor_count
          - avg_severity
          - medical_cases
          - trapped_count
          - member_reports (list of report indices)
    """
    if len(reports) < DBSCAN_MIN_SAMPLES:
        logger.warning(f"Only {len(reports)} reports — too few for clustering")
        return []

    coords = np.array([[r["lat"], r["lon"]] for r in reports])

    # Compute Haversine distance matrix
    dist_matrix = _haversine_distance_matrix(coords)

    # Run DBSCAN
    db = DBSCAN(eps=eps_km, min_samples=min_samples, metric="precomputed")
    labels = db.fit_predict(dist_matrix)

    unique_labels = set(labels)
    unique_labels.discard(-1)  # Remove noise label

    clusters = []
    for cluster_id in sorted(unique_labels):
        mask = labels == cluster_id
        indices = np.where(mask)[0].tolist()
        cluster_reports = [reports[i] for i in indices]
        cluster_coords = coords[mask]

        # Centroid
        centroid_lat = float(np.mean(cluster_coords[:, 0]))
        centroid_lon = float(np.mean(cluster_coords[:, 1]))

        # Boundary (convex hull) via Shapely
        if len(cluster_coords) >= 3:
            points = MultiPoint([(c[1], c[0]) for c in cluster_coords])  # lon, lat for Shapely
            hull = points.convex_hull
            boundary_geojson = {
                "type": "Feature",
                "geometry": {
                    "type": hull.geom_type,
                    "coordinates": list(hull.exterior.coords) if hull.geom_type == "Polygon" else list(hull.coords),
                },
            }
        else:
            boundary_geojson = None

        # Stats
        survivor_count = sum(r.get("people_count", 1) for r in cluster_reports)
        avg_severity = float(np.mean([r.get("severity", 3) for r in cluster_reports]))
        medical_cases = sum(1 for r in cluster_reports if r.get("needs_medical", False))
        trapped_count = sum(1 for r in cluster_reports if r.get("is_trapped", False))

        clusters.append({
            "cluster_id": int(cluster_id),
            "centroid": {"lat": centroid_lat, "lon": centroid_lon},
            "boundary_geojson": boundary_geojson,
            "survivor_count": survivor_count,
            "avg_severity": round(avg_severity, 2),
            "medical_cases": medical_cases,
            "trapped_count": trapped_count,
            "report_count": len(cluster_reports),
            "member_indices": indices,
        })

    # Tag noise points
    noise_count = int(np.sum(labels == -1))

    logger.info(
        f"DBSCAN: {len(clusters)} clusters found, {noise_count} noise points "
        f"from {len(reports)} reports"
    )

    return clusters


def generate_kde_heatmap(
    reports: List[Dict[str, Any]],
    grid_size: int = KDE_GRID_SIZE,
    bbox: Dict[str, float] = None,
) -> Dict[str, Any]:
    """
    Generate a Kernel Density Estimation heatmap for the frontend.
    
    Args:
        reports: List of dicts with 'lat', 'lon', 'severity'.
        grid_size: Resolution of the output grid.
        bbox: Bounding box dict with min_lat, max_lat, min_lon, max_lon.
              Defaults to Pune core area.
    
    Returns:
        Dict with:
          - grid: 2D array of density values (grid_size x grid_size)
          - bbox: bounding box used
          - max_density: peak density value
          - heatmap_points: list of [lat, lon, intensity] for Leaflet heatmap layer
    """
    if len(reports) < 2:
        return {"grid": [], "bbox": bbox, "max_density": 0.0, "heatmap_points": []}

    if bbox is None:
        bbox = {"min_lat": 18.45, "max_lat": 18.60, "min_lon": 73.78, "max_lon": 73.95}

    lats = np.array([r["lat"] for r in reports])
    lons = np.array([r["lon"] for r in reports])
    severities = np.array([r.get("severity", 3) for r in reports])

    # Weight by severity for KDE
    weights = severities / severities.sum()

    # Build KDE
    try:
        kde = gaussian_kde(
            np.vstack([lats, lons]),
            weights=weights,
            bw_method="scott",
        )
    except np.linalg.LinAlgError:
        logger.error("KDE failed — likely duplicate points")
        return {"grid": [], "bbox": bbox, "max_density": 0.0, "heatmap_points": []}

    # Evaluate on grid
    lat_grid = np.linspace(bbox["min_lat"], bbox["max_lat"], grid_size)
    lon_grid = np.linspace(bbox["min_lon"], bbox["max_lon"], grid_size)
    lat_mesh, lon_mesh = np.meshgrid(lat_grid, lon_grid)
    positions = np.vstack([lat_mesh.ravel(), lon_mesh.ravel()])

    density = kde(positions).reshape(grid_size, grid_size)
    max_density = float(np.max(density))

    # Normalize to [0, 1]
    if max_density > 0:
        density_normalized = density / max_density
    else:
        density_normalized = density

    # Generate heatmap points for Leaflet (above threshold for performance)
    heatmap_points = []
    threshold = 0.1
    for i in range(grid_size):
        for j in range(grid_size):
            if density_normalized[j, i] > threshold:
                heatmap_points.append([
                    float(lat_grid[i]),
                    float(lon_grid[j]),
                    float(density_normalized[j, i]),
                ])

    return {
        "grid": density_normalized.tolist(),
        "bbox": bbox,
        "max_density": max_density,
        "heatmap_points": heatmap_points,
    }


def get_survivor_clusters(
    reports: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    High-level function that runs both KDE and DBSCAN.
    This is the function called by Gemma 4 via function calling.
    """
    clusters = run_dbscan_clustering(reports)
    heatmap = generate_kde_heatmap(reports)

    return {
        "clusters": clusters,
        "heatmap": heatmap,
        "total_reports": len(reports),
        "total_clusters": len(clusters),
        "total_survivors": sum(c["survivor_count"] for c in clusters),
    }
