"""
Layer 1: Trigger Detection
Ingests official seismic alerts (USGS/IMD simulation).
Provides both a real API poller and a simulation mode for demos.
"""

import asyncio
import logging
import httpx
from datetime import datetime
from typing import Optional, Dict, Any

logger = logging.getLogger(__name__)

# USGS real-time earthquake feed (GeoJSON)
USGS_FEED_URL = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_hour.geojson"

# Pune bounding box for filtering relevant events
PUNE_BBOX = {
    "min_lat": 18.35,
    "max_lat": 18.70,
    "min_lon": 73.70,
    "max_lon": 74.05,
}


async def poll_usgs_feed() -> list[Dict[str, Any]]:
    """
    Polls the USGS GeoJSON feed and filters for events near Pune.
    In a real deployment, this would also hit the IMD Seismology API.
    """
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(USGS_FEED_URL)
            resp.raise_for_status()
            data = resp.json()
    except Exception as e:
        logger.warning(f"USGS feed unavailable: {e}")
        return []

    events = []
    for feature in data.get("features", []):
        coords = feature["geometry"]["coordinates"]  # [lon, lat, depth]
        lon, lat, depth = coords[0], coords[1], coords[2]
        props = feature["properties"]

        # Filter to Pune region
        if (PUNE_BBOX["min_lat"] <= lat <= PUNE_BBOX["max_lat"] and
                PUNE_BBOX["min_lon"] <= lon <= PUNE_BBOX["max_lon"]):
            events.append({
                "source": "usgs",
                "magnitude": props["mag"],
                "lat": lat,
                "lon": lon,
                "depth_km": depth,
                "timestamp": datetime.utcfromtimestamp(props["time"] / 1000),
                "place": props.get("place", "Near Pune"),
                "official_trigger": 1.0,  # Official source = full confidence
            })

    logger.info(f"USGS poll: {len(events)} events near Pune")
    return events


def generate_simulated_trigger(
    lat: float = 18.5204,
    lon: float = 73.8567,
    magnitude: float = 5.2,
    depth_km: float = 10.0
) -> Dict[str, Any]:
    """
    Generates a simulated IMD-style seismic trigger centered on Pune.
    Default epicenter: Shivajinagar, Pune.
    """
    return {
        "source": "simulation",
        "magnitude": magnitude,
        "lat": lat,
        "lon": lon,
        "depth_km": depth_km,
        "timestamp": datetime.utcnow(),
        "place": "Simulated - Pune, Maharashtra",
        "official_trigger": 1.0,
    }
