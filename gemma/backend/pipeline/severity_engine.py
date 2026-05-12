"""
Layer 4: Verification Engine (Severity Engine) + Decision Engine
Multi-factor corroboration to prevent false positives.

Verified_Score = (0.40 × Official_Trigger) 
               + (0.25 × Phone_Anomaly) 
               + (0.20 × Distress_Density) 
               + (0.15 × Crowd_Disruption) 
               - (0.15 × Vibration_Penalty)

Decision Engine Thresholds:
  < 0.30 → NORMAL (ALL CLEAR)
  0.30–0.50 → WATCH (SIGNIFICANT ANOMALY)
  0.50–0.75 → CRITICAL (SITUATION DEVELOPING)
  > 0.75 → EMERGENCY (DISASTER CONFIRMED)
"""

import logging
from dataclasses import dataclass
from typing import Optional, List, Dict, Any

logger = logging.getLogger(__name__)

# Weight constants (from the master spec)
W_OFFICIAL = 0.40
W_PHONE_ANOMALY = 0.25
W_DISTRESS = 0.20
W_CROWD = 0.15
W_PENALTY = 0.15

# Thresholds
VERIFICATION_THRESHOLD = 0.55  # Score above this → verified earthquake


@dataclass
class VerificationInput:
    """All factors fed into the verification formula."""
    official_trigger: float = 0.0    # 0 or 1 from USGS/IMD
    phone_anomaly: float = 0.0      # from signal_processing anomaly_score
    distress_density: float = 0.0   # from survivor_reports density
    crowd_disruption: float = 0.0   # from mobility/crowd movement anomaly
    vibration_penalty: float = 0.0  # known non-seismic sources (traffic, metro construction)


@dataclass
class VerificationResult:
    """Output of the verification engine."""
    verified_score: float
    is_verified: bool
    breakdown: dict
    recommendation: str


# ═══════════════════════════════════════════════════════════════════════
#  DECISION ENGINE — Threshold-based Status Categorization
# ═══════════════════════════════════════════════════════════════════════

DECISION_THRESHOLDS = [
    {
        "min": 0.75,
        "max": 1.0,
        "status": "EMERGENCY",
        "label": "DISASTER CONFIRMED",
        "color": "#ef476f",
        "color_name": "red",
        "tactical_suggestion": "Full-scale rescue deployment required. Awaiting AI tactical orders.",
    },
    {
        "min": 0.50,
        "max": 0.75,
        "status": "CRITICAL",
        "label": "SITUATION DEVELOPING",
        "color": "#ff8c42",
        "color_name": "orange",
        "tactical_suggestion": "Elevated seismic activity confirmed. Awaiting AI tactical orders.",
    },
    {
        "min": 0.30,
        "max": 0.50,
        "status": "WATCH",
        "label": "SIGNIFICANT ANOMALY",
        "color": "#ffd166",
        "color_name": "yellow",
        "tactical_suggestion": "Anomalous sensor activity detected. Monitoring for confirmation.",
    },
    {
        "min": 0.0,
        "max": 0.30,
        "status": "NORMAL",
        "label": "ALL CLEAR",
        "color": "#06d6a0",
        "color_name": "green",
        "tactical_suggestion": "No seismic activity detected. Routine monitoring active.",
    },
]


def get_decision_status(verified_score: float) -> Dict[str, Any]:
    """
    Map a Verified_Score to a Decision Engine status.
    Returns the status level, color, label, and suggestion.
    NOTE: Tactical actions are NOT included here — they come from the LLM (Gemma 4).
    """
    for threshold in DECISION_THRESHOLDS:
        if verified_score >= threshold["min"]:
            return {
                "status": threshold["status"],
                "label": threshold["label"],
                "color": threshold["color"],
                "color_name": threshold["color_name"],
                "tactical_suggestion": threshold["tactical_suggestion"],
                "verified_score": round(verified_score, 4),
            }
    # Fallback
    return {**DECISION_THRESHOLDS[-1], "verified_score": round(verified_score, 4)}


def calculate_verified_score(inputs: VerificationInput) -> VerificationResult:
    """
    Applies the full verification formula.
    
    Returns VerificationResult with score, boolean, breakdown, and recommendation.
    """
    score = (
        (W_OFFICIAL * inputs.official_trigger)
        + (W_PHONE_ANOMALY * inputs.phone_anomaly)
        + (W_DISTRESS * inputs.distress_density)
        + (W_CROWD * inputs.crowd_disruption)
        - (W_PENALTY * inputs.vibration_penalty)
    )

    # Clamp to [0, 1]
    score = max(0.0, min(1.0, score))
    is_verified = score >= VERIFICATION_THRESHOLD

    breakdown = {
        "official_component": round(W_OFFICIAL * inputs.official_trigger, 4),
        "phone_component": round(W_PHONE_ANOMALY * inputs.phone_anomaly, 4),
        "distress_component": round(W_DISTRESS * inputs.distress_density, 4),
        "crowd_component": round(W_CROWD * inputs.crowd_disruption, 4),
        "penalty_component": round(W_PENALTY * inputs.vibration_penalty, 4),
    }

    # Use the Decision Engine for the recommendation
    decision = get_decision_status(score)
    recommendation = f"{decision['status']} — {decision['tactical_suggestion']}"

    logger.info(
        f"Verification: score={score:.3f}, verified={is_verified}, "
        f"status={decision['status']}, rec='{recommendation}'"
    )

    return VerificationResult(
        verified_score=round(score, 4),
        is_verified=is_verified,
        breakdown=breakdown,
        recommendation=recommendation,
    )


def estimate_vibration_penalty(
    near_metro_construction: bool = False,
    near_highway: bool = False,
    near_railway: bool = False,
    time_of_day_hour: int = 12,
) -> float:
    """
    Estimates the vibration penalty based on Pune-specific context.
    Pune context: Metro construction in Hinjewadi/Shivajinagar, 
    heavy traffic on Pune-Mumbai Expressway, Pune Junction railway.
    """
    penalty = 0.0

    if near_metro_construction:
        penalty += 0.4  # Pune Metro is under heavy construction
    if near_highway:
        penalty += 0.2
    if near_railway:
        penalty += 0.15

    # Rush hour penalty (higher baseline vibration 8-10am, 5-8pm)
    if 8 <= time_of_day_hour <= 10 or 17 <= time_of_day_hour <= 20:
        penalty += 0.1

    return min(1.0, penalty)
