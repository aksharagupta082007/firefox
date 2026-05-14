"""
AURORA TECH — FastAPI Entry Point
Ties all 11 pipeline layers together with REST + WebSocket endpoints.
"""
import asyncio, json, logging, time, os, sys
from datetime import datetime
from typing import List, Dict, Any
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

# Imports from requirements.txt
import uvicorn
import sqlalchemy
import psycopg2
import aiohttp
import numpy as np
import scipy
import sklearn
import networkx as nx
import websockets
import httpx
import shapely

# ── Pipeline imports ─────────────────────────────────────────────────
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from backend.pipeline.trigger_detection import generate_simulated_trigger, poll_usgs_feed
from backend.pipeline.data_collection import PhyphoxCollector
from backend.pipeline.signal_processing import process_sensor_buffer
from backend.pipeline.severity_engine import VerificationInput, calculate_verified_score, get_decision_status
from backend.pipeline.impact_zone import compute_impact_zone
from backend.pipeline.survivor_mapping import get_survivor_clusters
from backend.pipeline.rescue_prioritization import score_rescue_zones
from backend.pipeline.route_optimization import compute_all_dispatch_routes
from backend.simulator.earthquake_sim import EarthquakeSimulator, run_full_simulation
from backend.ai.gemma_cloud import run_cloud_orchestration, generate_incident_summary
from backend.ai.gemma_edge import chat_with_edge_model, check_ollama_status

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("aurora")

# ── WebSocket Connection Manager ─────────────────────────────────────
class ConnectionManager:
    def __init__(self):
        self.active: List[WebSocket] = []

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.active.append(ws)
        logger.info(f"WS client connected. Total: {len(self.active)}")

    def disconnect(self, ws: WebSocket):
        self.active.remove(ws)
        logger.info(f"WS client disconnected. Total: {len(self.active)}")

    async def broadcast(self, message: dict):
        data = json.dumps(message, default=str)
        for ws in self.active[:]:
            try:
                await ws.send_text(data)
            except Exception:
                self.active.remove(ws)

manager = ConnectionManager()
collector = PhyphoxCollector(initial_devices=["192.168.31.146"])

from backend.database import init_db

# ── Lifespan ─────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("🚀 AURORA TECH starting up...")
    try:
        init_db()
        logger.info("✅ Database tables verified/created.")
    except Exception as e:
        logger.error(f"❌ Database initialization failed: {e}")
    yield
    collector.stop()
    logger.info("AURORA TECH shutting down.")

app = FastAPI(
    title="AURORA TECH — Global Resilience System",
    description="AI-Powered Earthquake Prediction & Response (Pune Edition)",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(CORSMiddleware, allow_origins=["*"],
    allow_credentials=True, allow_methods=["*"], allow_headers=["*"])


# ── Pydantic Models ──────────────────────────────────────────────────
class SimulationRequest(BaseModel):
    magnitude: float = 5.2
    epicenter_lat: float = 18.5204
    epicenter_lon: float = 73.8567
    depth_km: float = 10.0
    use_real_sensor: bool = False

class SOSRequest(BaseModel):
    lat: float
    lon: float
    severity: int = 3
    message: str = ""
    people_count: int = 1
    needs_medical: bool = False
    is_trapped: bool = False

class TriageMessage(BaseModel):
    message: str
    history: list = []


# ── Health & Status ──────────────────────────────────────────────────
@app.get("/")
async def root():
    return {"name": "AURORA TECH", "status": "operational",
            "region": "Pune, Maharashtra", "version": "1.0.0"}

@app.get("/api/status")
async def system_status():
    ollama = await check_ollama_status()
    has_api_key = bool(os.getenv("GOOGLE_AI_API_KEY"))
    return {"backend": "online", "ai_cloud": "available" if has_api_key else "no_api_key",
            "ai_edge": ollama, "sensor_polling": collector.running,
            "ws_clients": len(manager.active)}


# Store last simulation result for the Command Center to poll
last_simulation_result: Dict[str, Any] = {}


def _generate_tactical_brief(
    decision: Dict[str, Any],
    impact: Dict[str, Any],
    scored_zones: List[Dict[str, Any]],
    dispatches: List[Dict[str, Any]],
    sos_reports: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """
    Generate a grounded, actionable Tactical Brief from real pipeline data.
    Each item has a priority level, a specific grounded message, and a category.
    """
    brief = []
    priority_counter = 0

    # Infrastructure-grounded alerts
    affected_infra = impact.get("affected_infrastructure", [])
    for infra in affected_infra:
        if infra.get("estimated_damage") == "severe":
            priority_counter += 1
            infra_type = infra.get("type", "facility").replace("_", " ").title()
            brief.append({
                "priority": priority_counter,
                "level": "CRITICAL",
                "category": "INFRASTRUCTURE",
                "message": f"Structure failure likely at {infra['name']} ({infra_type}). "
                           f"Distance: {infra.get('distance_from_epicenter_km', '?')}km from epicenter. "
                           f"Immediate extraction team needed.",
                "icon": "🏥" if infra.get("type") == "hospital" else "🏫" if infra.get("type") == "school" else "⚠️",
            })

    # Survivor cluster alerts
    critical_zones = [z for z in scored_zones if z.get("priority_level") == "CRITICAL"]
    high_zones = [z for z in scored_zones if z.get("priority_level") == "HIGH"]

    for zone in critical_zones[:3]:
        priority_counter += 1
        brief.append({
            "priority": priority_counter,
            "level": "CRITICAL",
            "category": "RESCUE",
            "message": f"Survivor cluster #{zone['cluster_id']} — "
                       f"{zone.get('survivor_count', '?')} survivors, "
                       f"avg severity {zone.get('avg_severity', '?')}/5. "
                       f"{'Auto-escalated: hospital/school within 500m. ' if zone.get('auto_escalated') else ''}"
                       f"Deploy extraction team immediately.",
            "icon": "🆘",
        })

    for zone in high_zones[:2]:
        priority_counter += 1
        brief.append({
            "priority": priority_counter,
            "level": "HIGH",
            "category": "RESCUE",
            "message": f"Cluster #{zone['cluster_id']} — "
                       f"{zone.get('survivor_count', '?')} survivors at "
                       f"({zone['centroid']['lat']:.4f}, {zone['centroid']['lon']:.4f}). "
                       f"Medical cases: {zone.get('medical_cases', 0)}, "
                       f"trapped: {zone.get('trapped_count', 0)}.",
            "icon": "🔴",
        })

    # Dispatch route alerts
    for dispatch in dispatches[:3]:
        route = dispatch.get("route", {})
        route_nodes = route.get("route_nodes", [])
        priority_counter += 1
        brief.append({
            "priority": priority_counter,
            "level": "HIGH" if dispatch.get("eta_minutes", 99) > 10 else "MEDIUM",
            "category": "DISPATCH",
            "message": f"{dispatch.get('unit_type', 'unit').replace('_', ' ').upper()} "
                       f"→ Zone {dispatch.get('zone_id', '?')} "
                       f"(ETA: {dispatch.get('eta_minutes', '?')} min). "
                       f"Route: {' → '.join(route_nodes[:4])}"
                       f"{'...' if len(route_nodes) > 4 else ''}. "
                       f"Distance: {route.get('total_distance_km', '?')}km.",
            "icon": "🚑" if "ambulance" in dispatch.get("unit_type", "") else "🚒",
        })

    # Blocked road alerts
    if dispatches:
        # Check if any dispatch has a long ETA suggesting road issues
        long_etas = [d for d in dispatches if d.get("eta_minutes", 0) > 15]
        for d in long_etas[:2]:
            route = d.get("route", {})
            priority_counter += 1
            brief.append({
                "priority": priority_counter,
                "level": "HIGH",
                "category": "ROUTE",
                "message": f"Road blockage detected on route to Zone {d.get('zone_id', '?')}. "
                           f"ETA extended to {d.get('eta_minutes', '?')} min. "
                           f"Consider secondary path via {route.get('road_names', ['alternate route'])[0]}.",
                "icon": "🚧",
            })

    # SOS volume alert
    if len(sos_reports) > 15:
        priority_counter += 1
        brief.append({
            "priority": priority_counter,
            "level": "HIGH",
            "category": "CROWD",
            "message": f"{len(sos_reports)} SOS reports received in impact zone. "
                       f"Crowd density anomaly — consider deploying crowd management units to high-report areas.",
            "icon": "📢",
        })

    # NOTE: Tactical action items (e.g., "Mobilize ambulances to Kothrud")
    # are NOT generated here — they come from the LLM (Gemma 4).
    # This function only generates data-grounded observations from the pipeline.

    return brief


# ═══════════════════════════════════════════════════════════════════════
#  CORE PIPELINE — The 11-Layer Execution
# ═══════════════════════════════════════════════════════════════════════

@app.post("/api/simulate")
async def run_simulation(req: SimulationRequest):
    """
    ONE-CLICK DEMO: Runs the full 11-layer pipeline.
    Detection → Dispatch target: < 30 seconds.
    """
    start_time = time.time()
    results = {"layers": {}, "timing": {}}
    global last_simulation_result

    # ── Layer 1: Trigger Detection ────────────────────────────────────
    t0 = time.time()

    # Determine data source and location
    sensor_source = "synthetic"
    live_location = None

    if req.use_real_sensor:
        # Try to do a direct burst-fetch from Phyphox right now
        logger.info(f"🔴 LIVE MODE: Fetching from {collector.device_count} device(s)...")
        live_readings = await collector.burst_fetch(polls=5, interval=0.2)

        if live_readings:
            sensor_source = "phyphox"
            logger.info(f"✅ Got {len(live_readings)} readings from Phyphox")

            # Extract GPS location from the readings
            for r in reversed(live_readings):  # latest first
                if r.get("lat") and r.get("lon") and r["lat"] != 0.0 and r["lon"] != 0.0:
                    live_location = {"lat": r["lat"], "lon": r["lon"]}
                    break

            if live_location:
                logger.info(f"📍 Phone GPS location: ({live_location['lat']:.5f}, {live_location['lon']:.5f})")
                # Override epicenter with phone location for live mode
                req.epicenter_lat = live_location["lat"]
                req.epicenter_lon = live_location["lon"]
            else:
                logger.warning("⚠️ No GPS fix from Phyphox, using provided coordinates")
                live_location = {"lat": req.epicenter_lat, "lon": req.epicenter_lon, "source": "manual"}
        else:
            logger.warning("❌ No data from Phyphox! Is the phone on http://192.168.31.146:8080 ?")
            logger.warning("   Falling back to synthetic data.")

    trigger = generate_simulated_trigger(req.epicenter_lat, req.epicenter_lon,
                                          req.magnitude, req.depth_km)
    trigger["sensor_source"] = sensor_source
    if live_location:
        trigger["phone_location"] = live_location
    results["layers"]["1_trigger"] = trigger
    results["timing"]["1_trigger_ms"] = round((time.time()-t0)*1000, 1)
    await manager.broadcast({"layer": 1, "event": "trigger_detected", "data": trigger})

    # ── Layer 2: Sensor Data ──────────────────────────────────────────
    t0 = time.time()
    sim = EarthquakeSimulator(req.epicenter_lat, req.epicenter_lon, req.magnitude, req.depth_km)

    if sensor_source == "phyphox" and live_readings:
        sensor_readings = live_readings
        device_count = len(set(r.get("device_id", "unknown") for r in live_readings))
    else:
        sensor_readings = sim.generate_sensor_readings(num_devices=8, samples=50)
        device_count = 8

    results["layers"]["2_sensors"] = {
        "device_count": device_count,
        "reading_count": len(sensor_readings),
        "source": sensor_source,
    }
    results["timing"]["2_sensors_ms"] = round((time.time()-t0)*1000, 1)
    await manager.broadcast({"layer": 2, "event": "sensors_collected",
                              "data": {"devices": device_count, "readings": len(sensor_readings),
                                       "source": sensor_source}})

    # ── Layer 3: Signal Processing ────────────────────────────────────
    t0 = time.time()
    signal_result = process_sensor_buffer(sensor_readings)
    results["layers"]["3_signal"] = {
        "anomaly_score": signal_result["anomaly_score"],
        "sta_lta_ratio": signal_result["sta_lta_ratio"],
        "variance": signal_result["variance"],
        "fft": signal_result["fft_features"],
    }
    results["timing"]["3_signal_ms"] = round((time.time()-t0)*1000, 1)
    await manager.broadcast({"layer": 3, "event": "signal_processed",
                              "data": results["layers"]["3_signal"]})

    # ── Layer 4: Verification Engine ──────────────────────────────────
    t0 = time.time()

    # For LIVE mode: no official alert, no crowd data — score is purely from phone sensors
    # For SYNTHETIC mode: we simulate an official IMD alert + crowd/distress context
    if sensor_source == "phyphox":
        verify_input = VerificationInput(
            official_trigger=0.0,   # No official alert — phone IS the sensor
            phone_anomaly=signal_result["phone_anomaly"],
            distress_density=0.0,   # No SOS reports exist yet
            crowd_disruption=0.0,   # No crowd data available
            vibration_penalty=0.1,
        )
    else:
        verify_input = VerificationInput(
            official_trigger=trigger["official_trigger"],  # 1.0 = simulated IMD alert
            phone_anomaly=signal_result["phone_anomaly"],
            distress_density=0.6,   # Simulated SOS density
            crowd_disruption=0.4,   # Simulated crowd anomaly
            vibration_penalty=0.1,
        )

    verification = calculate_verified_score(verify_input)
    # Decision Engine: Map score to operational status
    decision_status = get_decision_status(verification.verified_score)

    results["layers"]["4_verification"] = {
        "verified_score": verification.verified_score,
        "is_verified": verification.is_verified,
        "breakdown": verification.breakdown,
        "recommendation": verification.recommendation,
        "decision": decision_status,
    }
    results["timing"]["4_verify_ms"] = round((time.time()-t0)*1000, 1)
    await manager.broadcast({"layer": 4, "event": "verification_complete",
                              "data": results["layers"]["4_verification"]})

    if not verification.is_verified:
        results["status"] = "not_verified"
        results["total_time_s"] = round(time.time()-start_time, 2)
        # Include phone location so the dashboard map shows where we are
        if live_location:
            results["layers"]["phone_location"] = live_location
        logger.info(f"⚡ Pipeline stopped at Layer 4: score={verification.verified_score:.3f}, "
                    f"status={decision_status['status']} — no earthquake detected")
        # Cache for Command Center (so dashboard updates instead of showing stale data)
        last_simulation_result = results
        return results

    # ── Layer 5: Impact Estimation ────────────────────────────────────
    t0 = time.time()
    impact = compute_impact_zone(req.epicenter_lat, req.epicenter_lon,
                                  req.magnitude, req.depth_km)
    results["layers"]["5_impact"] = {
        "radius_km": impact["impact_radius_km"],
        "summary": impact["summary"],
        "affected_infra": impact["affected_infrastructure"],
        "impact_polygon_geojson": impact["impact_polygon_geojson"],
        "epicenter": impact["epicenter"],
    }
    results["timing"]["5_impact_ms"] = round((time.time()-t0)*1000, 1)
    await manager.broadcast({"layer": 5, "event": "impact_estimated",
                              "data": {"radius_km": impact["impact_radius_km"],
                                       "summary": impact["summary"]}})

    # ── Layer 6: Survivor Intelligence ────────────────────────────────
    t0 = time.time()
    sos_reports = sim.generate_sos_reports(num=25)
    survivor_data = get_survivor_clusters(sos_reports)
    results["layers"]["6_survivors"] = {
        "total_reports": survivor_data["total_reports"],
        "total_clusters": survivor_data["total_clusters"],
        "total_survivors": survivor_data["total_survivors"],
        "clusters": survivor_data["clusters"],
        "heatmap_points": survivor_data["heatmap"]["heatmap_points"],
        "sos_reports": sos_reports,
    }
    results["timing"]["6_survivors_ms"] = round((time.time()-t0)*1000, 1)
    await manager.broadcast({"layer": 6, "event": "survivors_mapped",
                              "data": {"clusters": len(survivor_data["clusters"]),
                                       "survivors": survivor_data["total_survivors"]}})

    # ── Layer 7: Rescue Prioritization ────────────────────────────────
    t0 = time.time()
    scored_zones = score_rescue_zones(
        survivor_data["clusters"],
        affected_infra=impact["affected_infrastructure"],
    )
    results["layers"]["7_priority"] = scored_zones
    results["timing"]["7_priority_ms"] = round((time.time()-t0)*1000, 1)
    await manager.broadcast({"layer": 7, "event": "zones_prioritized",
                              "data": {"zones": len(scored_zones),
                                       "critical": sum(1 for z in scored_zones if z.get("priority_level")=="CRITICAL")}})

    # ── Layer 8: Resource Allocation + Layer 9: Safe Routing ──────────
    t0 = time.time()
    blocked = sim.generate_blocked_roads()
    zone_targets = [{"zone_id": z["cluster_id"], "lat": z["centroid"]["lat"],
                      "lon": z["centroid"]["lon"], "priority_score": z["priority_score"]}
                     for z in scored_zones]
    resource_units = sim.get_resource_units()
    dispatches = compute_all_dispatch_routes(resource_units, zone_targets, blocked)
    results["layers"]["8_9_dispatch_routing"] = {
        "dispatches": dispatches,
        "blocked_roads": blocked,
        "units_deployed": len(dispatches),
    }
    results["timing"]["8_9_dispatch_ms"] = round((time.time()-t0)*1000, 1)
    await manager.broadcast({"layer": 8, "event": "resources_dispatched",
                              "data": {"units": len(dispatches), "blocked_roads": len(blocked)}})

    # ── Layer 10+11: AI Summary + Tactical Brief ──────────────────────
    t0 = time.time()
    pipeline_context = {
        "trigger": trigger, "impact": impact, "clusters": scored_zones,
        "dispatches": dispatches, "sos_reports": sos_reports,
        "phone_anomaly": signal_result["phone_anomaly"],
        "verified_score": verification.verified_score,
        "decision": decision_status,
        "affected_infra": impact.get("affected_infrastructure", []),
    }
    incident_summary = generate_incident_summary(pipeline_context)

    # Generate grounded Tactical Brief from pipeline data
    tactical_brief = _generate_tactical_brief(
        decision_status, impact, scored_zones, dispatches, sos_reports
    )

    try:
        ai_result = await run_cloud_orchestration(trigger, pipeline_context)
    except Exception as e:
        ai_result = {"ai_model": "fallback", "ai_summary": str(e), "mode": "error"}

    # Determine if real AI tactical actions are available
    ai_available = ai_result.get("mode") not in ("error", "edge_fallback") and bool(ai_result.get("ai_summary"))

    results["layers"]["10_11_ai"] = {
        "incident_summary": incident_summary,
        "ai_orchestration": ai_result,
        "tactical_brief": tactical_brief,
        "ai_available": ai_available,
    }
    results["timing"]["10_11_ai_ms"] = round((time.time()-t0)*1000, 1)
    await manager.broadcast({"layer": 11, "event": "pipeline_complete",
                              "data": {"summary": incident_summary[:500],
                                       "tactical_brief": tactical_brief,
                                       "ai_available": ai_available}})

    # ── Final ─────────────────────────────────────────────────────────
    total = round(time.time()-start_time, 2)
    results["status"] = "complete"
    results["total_time_s"] = total
    results["under_30s"] = total < 30.0

    logger.info(f"🏁 Full pipeline completed in {total}s (target: <30s)")

    # Cache for Command Center polling
    last_simulation_result = results

    return results


# ═══════════════════════════════════════════════════════════════════════
#  INDIVIDUAL ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════

@app.post("/api/sos")
async def submit_sos(req: SOSRequest):
    """Layer 10: Citizen SOS report submission."""
    report = req.model_dump()
    report["timestamp"] = datetime.utcnow().isoformat()
    report["id"] = int(time.time() * 1000)
    await manager.broadcast({"layer": 10, "event": "sos_received", "data": report})
    return {"status": "received", "report_id": report["id"]}

@app.post("/api/triage")
async def triage_chat(req: TriageMessage):
    """Layer 10: Citizen offline triage chat via Ollama."""
    response = await chat_with_edge_model(req.message, req.history)
    return {"response": response}

@app.get("/api/infrastructure")
async def get_infrastructure():
    """Return Pune critical infrastructure data."""
    from backend.pipeline.impact_zone import PUNE_INFRASTRUCTURE
    return {"infrastructure": PUNE_INFRASTRUCTURE, "count": len(PUNE_INFRASTRUCTURE)}

@app.get("/api/resources")
async def get_resources():
    """Return Pune resource units."""
    from backend.simulator.earthquake_sim import PUNE_RESOURCE_UNITS
    return {"units": PUNE_RESOURCE_UNITS, "count": len(PUNE_RESOURCE_UNITS)}

@app.get("/api/last-simulation")
async def get_last_simulation():
    """Return the cached result of the last simulation run (for Command Center map)."""
    if not last_simulation_result:
        return {"status": "no_data"}
    return last_simulation_result

@app.get("/api/sensor/location")
async def get_sensor_location():
    """Return the last known GPS location from Phyphox."""
    loc = collector.get_last_location()
    if loc:
        return {"status": "ok", "location": loc}
    return {"status": "no_gps", "location": {"lat": 18.5204, "lon": 73.8567, "source": "default_pune"}}

@app.post("/api/sensor/start")
async def start_sensor_polling():
    """Start Phyphox polling on all registered devices."""
    if not collector.running:
        asyncio.create_task(collector.start_polling_loop(
            callback=lambda r: manager.broadcast({"layer": 2, "event": "sensor_reading", "data": r})
        ))
        return {"status": "started", "devices": collector.device_count}
    return {"status": "already_running", "devices": collector.device_count}

@app.post("/api/sensor/stop")
async def stop_sensor_polling():
    collector.stop()
    return {"status": "stopped"}

@app.get("/api/sensor/test")
async def test_sensor_connection():
    """
    Probe all registered devices and return their status + latest readings.
    """
    results = []
    async with aiohttp.ClientSession() as session:
        for device in collector.get_devices():
            reading = await collector._poll_single(session, device["url"])
            if reading:
                results.append({
                    "ip": device["ip"],
                    "name": device["name"],
                    "status": "connected",
                    "has_gps": bool(reading.get("lat") and reading["lat"] != 0.0),
                    "sensors": {
                        "accelerometer": [reading.get("acc_x"), reading.get("acc_y"), reading.get("acc_z")],
                        "gyroscope": [reading.get("gyr_x"), reading.get("gyr_y"), reading.get("gyr_z")],
                        "linear_acceleration": [reading.get("lin_acc_x"), reading.get("lin_acc_y"), reading.get("lin_acc_z")],
                        "location": {"lat": reading.get("lat"), "lon": reading.get("lon"), "accuracy_m": reading.get("location_accuracy_m")},
                        "pressure": reading.get("pressure"),
                    },
                    "reading": reading,
                })
            else:
                results.append({
                    "ip": device["ip"],
                    "name": device["name"],
                    "status": device.get("status", "unreachable"),
                })

    # For backwards compat: return first device at top level if only one
    if len(results) == 1:
        return {**results[0], "devices": results}
    return {"status": "ok" if any(r["status"] == "connected" for r in results) else "unreachable",
            "devices": results, "total": len(results)}


# ═══════════════════════════════════════════════════════════════════════
#  DEVICE REGISTRY — Multi-phone management
# ═══════════════════════════════════════════════════════════════════════

class DeviceRegistration(BaseModel):
    ip: str
    name: str = None
    port: int = 8080

@app.get("/api/devices")
async def list_devices():
    """List all registered Phyphox devices with status."""
    return {"devices": collector.get_devices(), "count": collector.device_count}

@app.post("/api/devices/register")
async def register_device(req: DeviceRegistration):
    """Register a new Phyphox phone by IP address."""
    device = collector.register_device(req.ip, name=req.name, port=req.port)
    # Immediately probe the device
    async with aiohttp.ClientSession() as session:
        reading = await collector._poll_single(session, device["url"])
        if reading:
            device["status"] = "connected"
            device["has_gps"] = bool(reading.get("lat") and reading["lat"] != 0.0)
        else:
            device["status"] = "unreachable"
    return {"status": "registered", "device": device}

@app.delete("/api/devices/{ip}")
async def unregister_device(ip: str):
    """Remove a device from the registry."""
    success = collector.unregister_device(ip)
    if success:
        return {"status": "removed", "ip": ip}
    raise HTTPException(status_code=404, detail=f"Device {ip} not found")


# ── WebSocket ────────────────────────────────────────────────────────
@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await manager.connect(ws)
    try:
        while True:
            data = await ws.receive_text()
            msg = json.loads(data)
            if msg.get("type") == "ping":
                await ws.send_text(json.dumps({"type": "pong"}))
    except WebSocketDisconnect:
        manager.disconnect(ws)
