"""
Layer 7: Rescue Prioritization
Multi-factor scoring for high-risk zones.

Priority = (0.35 × Severity) 
         + (0.30 × Anomaly_Density) 
         + (0.20 × Distress_Density) 
         + (0.15 × Access_Difficulty)

Automatically set priority to CRITICAL for zones containing hospitals or schools.
"""

import logging
from typing import List, Dict, Any
from dataclasses import dataclass

logger = logging.getLogger(__name__)

# Weight constants from spec
W_SEVERITY = 0.35
W_ANOMALY_DENSITY = 0.30
W_DISTRESS_DENSITY = 0.20
W_ACCESS_DIFFICULTY = 0.15

# Critical infrastructure types that auto-escalate to CRITICAL
CRITICAL_INFRA_TYPES = {"hospital", "school"}


@dataclass
class ZonePriority:
    zone_id: int
    priority_score: float
    priority_level: str  # CRITICAL / HIGH / MEDIUM / LOW
    breakdown: Dict[str, float]
    auto_escalated: bool


def calculate_zone_priority(
    severity: float,
    anomaly_density: float,
    distress_density: float,
    access_difficulty: float,
    contains_critical_infra: bool = False,
) -> ZonePriority:
    """
    Calculate rescue priority for a single zone.
    
    Args:
        severity: Earthquake severity in this zone (0–1)
        anomaly_density: Sensor anomaly concentration (0–1)
        distress_density: SOS report concentration (0–1)
        access_difficulty: How hard it is to reach (0–1, from routing graph)
        contains_critical_infra: True if zone contains hospitals/schools
    
    Returns:
        ZonePriority dataclass with score, level, breakdown
    """
    # Compute base score
    score = (
        (W_SEVERITY * severity)
        + (W_ANOMALY_DENSITY * anomaly_density)
        + (W_DISTRESS_DENSITY * distress_density)
        + (W_ACCESS_DIFFICULTY * access_difficulty)
    )
    score = max(0.0, min(1.0, score))

    auto_escalated = False

    # Auto-escalate for critical infrastructure
    if contains_critical_infra:
        score = 1.0
        auto_escalated = True

    # Assign level
    if score >= 0.85 or auto_escalated:
        level = "CRITICAL"
    elif score >= 0.65:
        level = "HIGH"
    elif score >= 0.40:
        level = "MEDIUM"
    else:
        level = "LOW"

    breakdown = {
        "severity_component": round(W_SEVERITY * severity, 4),
        "anomaly_component": round(W_ANOMALY_DENSITY * anomaly_density, 4),
        "distress_component": round(W_DISTRESS_DENSITY * distress_density, 4),
        "access_component": round(W_ACCESS_DIFFICULTY * access_difficulty, 4),
    }

    return ZonePriority(
        zone_id=0,  # set by caller
        priority_score=round(score, 4),
        priority_level=level,
        breakdown=breakdown,
        auto_escalated=auto_escalated,
    )


def score_rescue_zones(
    clusters: List[Dict[str, Any]],
    affected_infra: List[Dict[str, Any]] = None,
    impact_data: Dict[str, Any] = None,
) -> List[Dict[str, Any]]:
    """
    Score and rank all rescue zones (DBSCAN clusters).
    This is the function called by Gemma 4 via function calling.
    
    For each cluster:
      - severity = cluster avg_severity / 5.0 (normalized)
      - anomaly_density = derived from sensor readings in cluster area
      - distress_density = report_count / max_reports (normalized)
      - access_difficulty = estimated from road density (placeholder: 0.5 default)
      - contains_critical_infra = check if any infra falls within cluster boundary
    """
    if not clusters:
        return []

    if affected_infra is None:
        affected_infra = []

    max_reports = max(c.get("report_count", 1) for c in clusters)

    scored_zones = []
    for cluster in clusters:
        cid = cluster["cluster_id"]
        centroid = cluster["centroid"]

        # Normalize inputs
        severity = min(1.0, cluster.get("avg_severity", 3.0) / 5.0)
        distress_density = cluster.get("report_count", 1) / max(max_reports, 1)

        # Check if critical infra is in this cluster's area
        # Simple: check if any hospital/school is within ~500m of centroid
        contains_critical = False
        for infra in affected_infra:
            if infra.get("type") in CRITICAL_INFRA_TYPES:
                from backend.pipeline.impact_zone import _haversine
                dist = _haversine(
                    centroid["lat"], centroid["lon"],
                    infra["lat"], infra["lon"]
                )
                if dist <= 0.5:  # 500m
                    contains_critical = True
                    break

        # Anomaly density placeholder (in production, query sensor_readings in area)
        anomaly_density = min(1.0, cluster.get("trapped_count", 0) * 0.3 + 0.2)

        # Access difficulty (in production, from route_optimization graph)
        access_difficulty = 0.5  # default moderate

        priority = calculate_zone_priority(
            severity=severity,
            anomaly_density=anomaly_density,
            distress_density=distress_density,
            access_difficulty=access_difficulty,
            contains_critical_infra=contains_critical,
        )
        priority.zone_id = cid

        scored_zones.append({
            **cluster,
            "priority_score": priority.priority_score,
            "priority_level": priority.priority_level,
            "priority_breakdown": priority.breakdown,
            "auto_escalated": priority.auto_escalated,
            "contains_critical_infra": contains_critical,
        })

    # Sort by priority score descending
    scored_zones.sort(key=lambda x: x["priority_score"], reverse=True)

    logger.info(
        f"Scored {len(scored_zones)} zones: "
        f"{sum(1 for z in scored_zones if z['priority_level'] == 'CRITICAL')} CRITICAL, "
        f"{sum(1 for z in scored_zones if z['priority_level'] == 'HIGH')} HIGH"
    )

    return scored_zones
