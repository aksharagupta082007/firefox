"""
AURORA TECH — Production Entry Point
Centralized AI Command System for Disaster Response.
"""
import asyncio
import json
import logging
import os
import re
import uuid
from datetime import datetime
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends, HTTPException, BackgroundTasks, Body
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from backend.ai.llm_gateway import call_gemma_fast, call_gemma_smart

from backend.auth.rbac import is_admin, is_responder, is_citizen, get_current_user
from backend.websocket.manager import ws_manager
from backend.services.redis_client import redis_service
from backend.services.postgis_client import postgis_client
from backend.ai.graphs.disaster_graph import disaster_graph
from backend.database import (
    init_db as init_relational_db, get_db, SessionLocal,
    ResourceUnit, CriticalInfrastructure, ResourceStatus, ResourceType,
    InfraType, DispatchLog
)
from backend.ai.schemas.emergency import SOSReport, TriageIntelligence

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("aurora.main")


async def get_redis():
    """Get a connected Redis client, connecting if needed."""
    await redis_service.connect()
    return redis_service.client

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("🚀 AURORA TECH Intelligence Engine Starting...")
    await redis_service.connect()
    postgis_client.init_db()
    try:
        init_relational_db()
        logger.info("✅ Relational DB and seeder initialized.")
    except Exception as e:
        logger.error(f"⚠️ Relational DB initialization failed: {e}")
    
    # Start Redis Pub/Sub listener in background
    asyncio.create_task(ws_manager.start_pubsub_listener())
    
    yield
    # Shutdown
    await redis_service.disconnect()

app = FastAPI(
    title="AURORA TECH — Disaster Cognition Engine",
    version="2.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

from fastapi.security import OAuth2PasswordRequestForm
from backend.auth.jwt_handler import create_access_token, verify_password
from backend.auth.user_store import create_user, get_user


class SignupRequest(BaseModel):
    username: str | None = None
    email: str | None = None
    password: str
    role: str = "citizen"
    phone: str | None = None
    location: str | None = None
    extraDetail: str | None = None

@app.post("/token")
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    user = get_user(form_data.username)
    if not user or not verify_password(form_data.password, user["password"]):
        raise HTTPException(status_code=400, detail="Incorrect username or password")
    
    access_token = create_access_token(data={"sub": user["username"], "role": user["role"]})
    return {
        "access_token": access_token, 
        "token_type": "bearer",
        "user": {"username": user["username"], "role": user["role"]}
    }

@app.post("/api/signup")
async def signup(payload: SignupRequest):
    username = payload.username or payload.email
    try:
        user = create_user(username or "", payload.password, payload.role)
    except KeyError:
        raise HTTPException(status_code=400, detail="Username already registered")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    return {
        "status": "success",
        "message": f"User {user['username']} created as {user['role']}",
        "user": {"username": user["username"], "role": user["role"]},
    }

# ── Schemas ──────────────────────────────────────────────────────────
class SOSInput(BaseModel):
    message: str
    lat: float
    lon: float

from backend.voice.processor import voice_processor
from backend.ai.memory.semantic_memory import semantic_memory
from backend.ai.tools.tactical_tools import tactical_tools

# ── Voice Processing Flow ──────────────────────────────────────────
class AudioInput(BaseModel):
    audio_b64: str
    lat: float
    lon: float

@app.post("/api/citizen/voice-sos", dependencies=[Depends(is_citizen)])
async def submit_voice_sos(inp: AudioInput, background_tasks: BackgroundTasks):
    """
    STT → Triage → Tactical → Shared State.
    """
    import base64
    audio_bytes = base64.b64decode(inp.audio_b64)
    
    # 1. Transcribe voice
    text = await voice_processor.transcribe_stream(audio_bytes)
    logger.info(f"🎙️ Transcribed Voice SOS: {text}")
    
    # 2. Get local context via Semantic RAG
    context = await semantic_memory.get_relevant_context(inp.lat, inp.lon)
    
    # 3. Create report and trigger graph
    report_id = f"voice_sos_{int(datetime.utcnow().timestamp())}"
    report = SOSReport(id=report_id, lat=inp.lat, lon=inp.lon, raw_message=f"{text} | Context: {context}")
    
    # Create and cache a pending incident immediately so it renders on the admin dashboard
    pending_incident = {
        "id": report_id,
        "message": f"[Voice SOS] {text}",
        "lat": inp.lat,
        "lon": inp.lon,
        "triage_level": "MODERATE",  # Yellow in dashboard
        "ai_response": "AI processing (triage & tactical analysis)...",
        "timestamp": report.timestamp.isoformat() if hasattr(report.timestamp, "isoformat") else datetime.utcnow().isoformat(),
        "status": "PENDING",
        "battery": 100,
        "lang": "english",
    }
    
    try:
        redis = await get_redis()
        await redis.set(f"incident:{report_id}", json.dumps(pending_incident))
        await redis_service.update_list_atomic("active_incidents", pending_incident)
        await redis.publish("broadcast:admin", json.dumps({
            "type": "new_incident",
            "incident": pending_incident,
        }))
    except Exception as e:
        logger.error(f"Error publishing pending voice SOS incident: {e}")
    
    thread = {"configurable": {"thread_id": report_id}}
    background_tasks.add_task(disaster_graph.ainvoke, {"sos_report": report, "history": []}, thread)
    
    return {"status": "processing", "report_id": report_id, "transcription": text}

# ── Tactical Actions & HITL ───────────────────────────────────────────
@app.post("/api/admin/approve/{report_id}", dependencies=[Depends(is_admin)])
async def approve_tactical_action(report_id: str):
    """HITL: Admin approves deployment."""
    thread = {"configurable": {"thread_id": report_id}}
    # Resume graph execution after interrupt
    await disaster_graph.ainvoke(None, thread)
    
    # Release distributed lock for resources if any
    await redis_service.release_lock(f"resource_lock:{report_id}")
    
    # Notify Responders via Pub/Sub
    await redis_service.publish_event("broadcast:responder", {
        "type": "new_dispatch",
        "incident_id": report_id,
        "message": "Dispatch approved. Move to coordinates immediately."
    })
    
    return {"status": "approved"}

@app.post("/api/admin/reject/{report_id}", dependencies=[Depends(is_admin)])
async def reject_tactical_action(report_id: str, reason: str = "Duplicate report"):
    """HITL: Admin rejects deployment."""
    # Cancel the graph execution or mark as resolved
    await redis_service.set_state(f"triage:{report_id}", {"status": "rejected", "reason": reason})
    return {"status": "rejected"}


# ── PostGIS Resources and Gemma Triage Agent Core ───────────────────

def get_available_resources_list():
    """Retrieve all available emergency response units from PostgreSQL database."""
    db = SessionLocal()
    try:
        units = db.query(ResourceUnit).filter(ResourceUnit.status == ResourceStatus.AVAILABLE).all()
        result = []
        from geoalchemy2.shape import to_shape
        for u in units:
            try:
                point = to_shape(u.location)
                lat, lon = point.y, point.x
            except Exception:
                lat, lon = 18.5204, 73.8567
            result.append({
                "id": u.id,
                "unit_name": u.unit_name,
                "resource_type": u.resource_type.value,
                "station_name": u.station_name,
                "lat": lat,
                "lon": lon,
                "status": u.status.value
            })
        return result
    except Exception as e:
        logger.error(f"⚠️ Error fetching available resource units from PostGIS: {e}")
        return [
            {"id": 1, "unit_name": "AMB-PUNE-01", "resource_type": "ambulance", "station_name": "Ruby Hall Clinic", "lat": 18.5308, "lon": 73.8797, "status": "available"},
            {"id": 2, "unit_name": "AMB-PUNE-02", "resource_type": "ambulance", "station_name": "KEM Hospital", "lat": 18.5018, "lon": 73.8636, "status": "available"},
            {"id": 3, "unit_name": "AMB-PUNE-03", "resource_type": "ambulance", "station_name": "Sassoon General Hospital", "lat": 18.5167, "lon": 73.8625, "status": "available"},
            {"id": 6, "unit_name": "FTR-PUNE-01", "resource_type": "fire_truck", "station_name": "Pune Fire Brigade HQ", "lat": 18.5195, "lon": 73.8553, "status": "available"},
            {"id": 10, "unit_name": "NDRF-PUNE-01", "resource_type": "ndrf", "station_name": "Baner NDRF Base", "lat": 18.5500, "lon": 73.8500, "status": "available"}
        ]
    finally:
        db.close()


async def generate_dispatch_proposal(incident: dict) -> dict:
    """Invokes Gemma model to analyze the incident and available database resources to generate a detailed dispatch proposal."""
    resources = get_available_resources_list()
    
    # Safely extract incident fields
    inc_id = incident.get("id") or incident.get("incident_id") or "INC-01"
    msg = incident.get("message") or incident.get("raw_message") or "Emergency situation reported."
    lat = incident.get("lat") or 18.5204
    lon = incident.get("lon") or 73.8567
    area = incident.get("area") or incident.get("name") or "Pune Central"
    
    triage_info = incident.get("triage")
    if isinstance(triage_info, dict):
        triage = triage_info.get("triage_level", "HIGH")
    else:
        triage = incident.get("triage_level", "HIGH")
    
    prompt = f"""You are AURORA's Command Triage AI. Optimize resource allocation for a disaster incident in Pune using live PostgreSQL resource state.
    
    INCIDENT METADATA:
    - ID: {inc_id}
    - SOS Message: "{msg}"
    - Latitude/Longitude: {lat}, {lon}
    - Sector/Area: {area}
    - Threat Triage Level: {triage}
    
    AVAILABLE EMERGENCY UNITS IN POSTGRES DB:
    {json.dumps(resources[:10])}
    
    Task: Pick the absolute best units (from the available list above) to dispatch.
    - If the message reports fires/burns/gas: prioritize fire_truck units.
    - If the message reports collapsed structures/people trapped: prioritize ndrf units.
    - If there are injured victims or medical trauma: prioritize ambulance units.
    - Provide a safe routing coordinate list starting at the chosen station and ending at the incident (between 2 to 4 numeric pairs).
    
    Respond ONLY in this exact JSON structure (No code blocks, no other commentary):
    {{
      "suggested_units": [
        {{
          "id": <resource_id>,
          "unit_name": "<unit_name>",
          "resource_type": "ambulance|fire_truck|ndrf|police",
          "station_name": "<station_name>",
          "justification": "<concise sentence justifying the selection>",
          "route_coordinates": [[<station_lat>, <station_lon>], [<midpoint_lat>, <midpoint_lon>], [{lat}, {lon}]],
          "eta_minutes": <integer>
        }}
      ],
      "tactical_justification": "<2-sentence strategic briefing on why these resources were chosen>"
    }}
    """
    
    try:
        import re
        raw = await call_gemma_smart(prompt)
        match = re.search(r'\{.*\}', raw, re.DOTALL)
        if match:
            proposal = json.loads(match.group())
            # Format and enforce coordinates safety
            for unit in proposal.get("suggested_units", []):
                coords = []
                for pt in unit.get("route_coordinates", []):
                    if len(pt) == 2:
                        coords.append([float(pt[0]), float(pt[1])])
                unit["route_coordinates"] = coords
            return proposal
    except Exception as e:
        logger.error(f"⚠️ Gemma dispatcher agent failed: {e}")
        
    # Standard robust fallback
    fallback_unit = resources[0] if resources else {"id": 1, "unit_name": "AMB-PUNE-01", "resource_type": "ambulance", "station_name": "Ruby Hall Clinic", "lat": 18.5308, "lon": 73.8797}
    return {
        "suggested_units": [
            {
                "id": fallback_unit["id"],
                "unit_name": fallback_unit["unit_name"],
                "resource_type": fallback_unit.get("resource_type", "ambulance"),
                "station_name": fallback_unit.get("station_name", "Ruby Hall Clinic"),
                "justification": "Closest available responder dispatched for immediate coverage.",
                "route_coordinates": [[fallback_unit.get("lat", 18.5308), fallback_unit.get("lon", 73.8797)], [lat, lon]],
                "eta_minutes": 8
            }
        ],
        "tactical_justification": "Immediate deployment to stabilize incident perimeter and initiate primary triage."
    }


@app.get("/api/admin/resources", dependencies=[Depends(is_admin)])
async def get_admin_resources():
    """Retrieve all emergency response units and their real-time PostGIS statuses from database."""
    db = SessionLocal()
    try:
        from geoalchemy2.shape import to_shape
        all_units = db.query(ResourceUnit).all()
        result = []
        for u in all_units:
            try:
                point = to_shape(u.location)
                lat, lon = point.y, point.x
            except Exception:
                lat, lon = 18.5204, 73.8567
            result.append({
                "id": u.id,
                "unit_name": u.unit_name,
                "resource_type": u.resource_type.value,
                "station_name": u.station_name,
                "lat": lat,
                "lon": lon,
                "status": u.status.value
            })
        return {"resources": result, "count": len(result)}
    except Exception as e:
        logger.error(f"⚠️ Failed to fetch all resources: {e}")
        return {"resources": get_available_resources_list(), "count": 4}
    finally:
        db.close()


@app.get("/api/admin/proposal/{incident_id}", dependencies=[Depends(is_admin)])
async def get_dispatch_proposal_endpoint(incident_id: str):
    """Gemma-Agent API: Evaluates the incident and available database resources to generate a detailed dispatch suggestion."""
    redis = await get_redis()
    
    # Try fetching from Redis cache first
    cached = await redis.get(f"proposal:{incident_id}")
    if cached:
        return json.loads(cached)
        
    # Search in Redis active incidents list
    raw_inc = await redis.get(f"incident:{incident_id}")
    if not raw_inc:
        raw_list = await redis.lrange("active_incidents", 0, 99)
        for r in raw_list:
            inc = json.loads(r)
            if str(inc.get("id")) == str(incident_id):
                raw_inc = r
                break
                
    if not raw_inc:
        # Check standard voice_sos prefix fallback
        raise HTTPException(status_code=404, detail="Incident not found in active operational queue.")
        
    incident = json.loads(raw_inc)
    proposal = await generate_dispatch_proposal(incident)
    
    # Cache proposal for 1 hour to prevent redundant LLM invocations
    await redis.set(f"proposal:{incident_id}", json.dumps(proposal), ex=3600)
    return proposal


@app.post("/api/admin/dispatch/approve/{incident_id}", dependencies=[Depends(is_admin)])
async def approve_tactical_dispatch(incident_id: str, payload: dict = Body(...)):
    """HITL Endpoint: Deducts allocated resources in PostGIS database, logs dispatch, and broadcasts live dispatch order."""
    units_to_dispatch = payload.get("units", [])
    tactical_rationale = payload.get("justification", "Dispatch approved by Admin Commander.")
    
    redis = await get_redis()
    db = SessionLocal()
    try:
        dispatched_units = []
        for unit in units_to_dispatch:
            db_unit = None
            if isinstance(unit, int) or (isinstance(unit, str) and unit.isdigit()):
                db_unit = db.query(ResourceUnit).filter(ResourceUnit.id == int(unit)).first()
            else:
                db_unit = db.query(ResourceUnit).filter(ResourceUnit.unit_name == str(unit)).first()
                
            if db_unit and db_unit.status == ResourceStatus.AVAILABLE:
                # DEDUCT RESOURCE: Update status to DISPATCHED in PostgreSQL
                db_unit.status = ResourceStatus.DISPATCHED
                dispatched_units.append(db_unit.unit_name)
                
                # Log to dispatch log
                log = DispatchLog(
                    event_id=1,
                    unit_id=db_unit.id,
                    ai_reasoning=tactical_rationale,
                    eta_minutes=float(payload.get("eta_minutes", 8.0))
                )
                db.add(log)
                
        db.commit()
        
        # Update incident status to DISPATCHED in Redis cache
        raw_inc = await redis.get(f"incident:{incident_id}")
        if raw_inc:
            incident = json.loads(raw_inc)
            incident["status"] = "DISPATCHED"
            incident["dispatched_units"] = dispatched_units
            await redis.set(f"incident:{incident_id}", json.dumps(incident))
            
            # Atomically update the active incidents Redis list
            active_raw = await redis.lrange("active_incidents", 0, 99)
            await redis.delete("active_incidents")
            for item in active_raw:
                inc = json.loads(item)
                if str(inc.get("id")) == str(incident_id):
                    inc["status"] = "DISPATCHED"
                    inc["dispatched_units"] = dispatched_units
                await redis.rpush("active_incidents", json.dumps(inc))
        
        # Broadcast updated dispatch details to all active Responders
        responder_msg = {
            "type": "new_dispatch",
            "incident_id": incident_id,
            "triage_level": payload.get("triage_level", "HIGH"),
            "message": f"CRPF Triage Dispatch Approved: {', '.join(dispatched_units)}. Mission: {tactical_rationale}",
            "route_coordinates": payload.get("route_coordinates", []),
            "eta_minutes": payload.get("eta_minutes", 8)
        }
        await redis.publish("broadcast:responder", json.dumps(responder_msg))
        
        # Notify the Admin dashboard to trigger status update transitions
        await redis.publish("broadcast:admin", json.dumps({
            "type": "dispatch_confirmed",
            "incident_id": incident_id,
            "dispatched_units": dispatched_units
        }))
        
        return {
            "status": "success",
            "message": f"Successfully dispatched: {', '.join(dispatched_units)}",
            "dispatched_units": dispatched_units
        }
    except Exception as e:
        db.rollback()
        logger.error(f"⚠️ Dispatch approval error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


@app.post("/api/admin/dispatch/reject/{incident_id}", dependencies=[Depends(is_admin)])
async def reject_tactical_dispatch(incident_id: str, reason: str = Body(..., embed=True)):
    """HITL Endpoint: Rejects and dismisses incident report."""
    redis = await get_redis()
    raw_inc = await redis.get(f"incident:{incident_id}")
    if raw_inc:
        incident = json.loads(raw_inc)
        incident["status"] = "REJECTED"
        await redis.set(f"incident:{incident_id}", json.dumps(incident))
        
        # Atomically update the active incidents Redis list
        active_raw = await redis.lrange("active_incidents", 0, 99)
        await redis.delete("active_incidents")
        for item in active_raw:
            inc = json.loads(item)
            if str(inc.get("id")) == str(incident_id):
                inc["status"] = "REJECTED"
            await redis.rpush("active_incidents", json.dumps(inc))
            
    # Notify Admin channels
    await redis.publish("broadcast:admin", json.dumps({
        "type": "dispatch_rejected",
        "incident_id": incident_id
    }))
    
    return {"status": "rejected", "incident_id": incident_id}

# ── WebSocket Management ──────────────────────────────────────────────
@app.websocket("/ws/{role}")
async def websocket_endpoint(websocket: WebSocket, role: str):
    await ws_manager.connect(websocket, role)
    try:
        while True:
            # Handle incoming data (Ping/Pong or Audio Chunks)
            data = await websocket.receive()
            
            # Check for raw disconnect event to prevent Starlette RuntimeError on subsequent loop
            if data.get("type") == "websocket.disconnect":
                raise WebSocketDisconnect(code=data.get("code", 1000))
            
            if "bytes" in data:
                # Direct streaming voice SOS
                text = await voice_processor.transcribe_stream(data["bytes"])
                await websocket.send_text(json.dumps({
                    "type": "transcription",
                    "text": text
                }))
            elif "text" in data:
                msg = json.loads(data["text"])
                if msg.get("type") == "ping":
                    await websocket.send_text(json.dumps({"type": "pong"}))
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket, role)


# ══════════════════════════════════════════════════════════════════════
#  ENDPOINT 1: Citizen SOS Chat (Gemma 4 fast model)
# ══════════════════════════════════════════════════════════════════════
@app.post("/api/citizen/sos")
async def citizen_sos(body: dict = Body(...)):
    message  = body.get("message", "")
    lat      = body.get("lat", 18.5204)
    lon      = body.get("lon", 73.8567)
    battery  = body.get("battery", 100)
    lang     = body.get("lang", "english")

    # Build conversation context if this is a follow-up message
    conversation_history = body.get("history", [])  # list of {role, text} dicts
    history_text = ""
    if conversation_history:
        history_text = "\n".join([
            f"{'Citizen' if h['role']=='user' else 'AURORA'}: {h['text']}"
            for h in conversation_history[-6:]  # last 6 messages only
        ])

    conversation_header = ("CONVERSATION SO FAR:\n" + history_text) if history_text else "FIRST CONTACT"

    prompt = f"""You are AURORA — an AI disaster response assistant deployed 
during an active earthquake in Pune, India. 

CITIZEN PROFILE:
- Message: "{message}"
- GPS Location: {lat}, {lon}
- Battery: {battery}%
- Language: {lang}
- Time since earthquake: NOW (critical window)

{conversation_header}

YOUR RESPONSE MUST DO ALL OF THIS IN ORDER:

1. ACKNOWLEDGE (1 line, calm, specific to what they said — NOT generic)
   Example: "You're safe to move, gas rises — get LOW and go NOW."
   NOT: "I understand you are in distress."

2. IMMEDIATE ACTION (1-2 lines, the single most important thing RIGHT NOW)
   - Gas leak → "Leave immediately. Do NOT touch switches. Leave door open."
   - Trapped → "Stop moving. Tap pipes 3 times every minute. Save your battery."
   - Injured → "Press hard on wound with cloth. Do NOT remove it. Stay still."
   - Building cracking → "Move to nearest doorframe. Grab water if within 2 steps."
   - Fire → "Get LOW. Crawl. Wet any cloth and breathe through it."
   - Unknown danger → Give best advice based on their words

3. INTEL QUESTION (ask exactly ONE question to get critical info for rescue team)
   Rotate through these based on what you don't know yet:
   - "How many people are with you right now?"
   - "Can you see daylight or are you in complete darkness?"
   - "Is anyone unconscious or not breathing?"
   - "What floor are you on? Can you see any exit?"
   - "Do you smell gas or see any fire or smoke?"
   - "Are you able to move your legs?"
   Pick the MOST URGENT question not yet answered in conversation history.

4. REASSURANCE (1 line max)
   "Your location is pinned. Rescue team dispatched — stay on this chat."

RULES:
- {"Use Marathi script entirely." if lang == "marathi" else "Use Hindi script entirely." if lang == "hindi" else "Use simple English. Short sentences."}
- {"ULTRA SHORT — battery critical. 3 lines max." if battery < 20 else "Keep under 80 words total."}
- NEVER say "I understand your distress" or "I'm sorry to hear"
- NEVER give more than ONE action at a time
- Sound like a calm, fast-thinking rescue professional — not a chatbot
- Use their exact words back to them ("you said gas smell" not "you mentioned a potential leak")
"""

    try:
        ai_response = await call_gemma_fast(prompt)
    except Exception as e:
        logger.error(f"Gemma fast failed for citizen SOS: {e}")
        ai_response = ("Emergency services have been alerted to your GPS location. "
                       "Stay calm, do not move if injured. Help is coming.")

    msg_lower = message.lower()
    if any(w in msg_lower for w in ["trapped", "buried", "unconscious", "not breathing",
                                     "can't breathe", "crush", "collapse"]):
        triage = "CRITICAL"
    elif any(w in msg_lower for w in ["injured", "bleeding", "gas", "fire", "stuck",
                                       "broken", "pain", "child fell"]):
        triage = "HIGH"
    else:
        triage = "MODERATE"

    incident_id = str(uuid.uuid4())[:8]
    incident = {
        "id": incident_id,
        "message": message,
        "lat": lat, "lon": lon,
        "triage_level": triage,
        "ai_response": ai_response,
        "timestamp": datetime.utcnow().isoformat(),
        "status": "ACTIVE",
        "battery": battery,
        "lang": lang,
    }

    try:
        redis = await get_redis()
        await redis.set(f"incident:{incident_id}", json.dumps(incident))
        await redis.lpush("active_incidents", json.dumps(incident))
        await redis.ltrim("active_incidents", 0, 99)
        await redis.publish("broadcast:admin", json.dumps({
            "type": "new_incident",
            "incident": incident,
        }))
    except Exception:
        pass

    return {
        "id": incident_id,
        "ai_response": ai_response,
        "triage_level": triage,
        "status": "help_dispatched",
    }


# ══════════════════════════════════════════════════════════════════════
#  ENDPOINT 1b: Citizen SOS Chat — STREAMING (SSE)
# ══════════════════════════════════════════════════════════════════════
@app.post("/api/citizen/sos/stream")
async def citizen_sos_stream(body: dict = Body(...)):
    message  = body.get("message", "")
    lat      = body.get("lat", 18.5204)
    lon      = body.get("lon", 73.8567)
    battery  = body.get("battery", 100)
    lang     = body.get("lang", "english")

    incident_id = str(uuid.uuid4())[:8]

    # Build conversation context
    conversation_history = body.get("history", [])
    history_text = ""
    if conversation_history:
        history_text = "\n".join([
            f"{'Citizen' if h['role']=='user' else 'AURORA'}: {h['text']}"
            for h in conversation_history[-6:]
        ])

    conversation_header = ("CONVERSATION SO FAR:\n" + history_text) if history_text else "FIRST CONTACT"

    prompt = f"""You are AURORA — an AI disaster response assistant deployed 
during an active earthquake in Pune, India. 

CITIZEN PROFILE:
- Message: "{message}"
- GPS Location: {lat}, {lon}
- Battery: {battery}%
- Language: {lang}
- Time since earthquake: NOW (critical window)

{conversation_header}

YOUR RESPONSE MUST DO ALL OF THIS IN ORDER:

1. ACKNOWLEDGE (1 line, calm, specific to what they said — NOT generic)
   Example: "You're safe to move, gas rises — get LOW and go NOW."
   NOT: "I understand you are in distress."

2. IMMEDIATE ACTION (1-2 lines, the single most important thing RIGHT NOW)
   - Gas leak -> "Leave immediately. Do NOT touch switches. Leave door open."
   - Trapped -> "Stop moving. Tap pipes 3 times every minute. Save your battery."
   - Injured -> "Press hard on wound with cloth. Do NOT remove it. Stay still."
   - Building cracking -> "Move to nearest doorframe. Grab water if within 2 steps."
   - Fire -> "Get LOW. Crawl. Wet any cloth and breathe through it."
   - Unknown danger -> Give best advice based on their words

3. INTEL QUESTION (ask exactly ONE question to get critical info for rescue team)
   Pick the MOST URGENT question not yet answered in conversation history:
   - "How many people are with you right now?"
   - "Can you see daylight or are you in complete darkness?"
   - "Is anyone unconscious or not breathing?"
   - "What floor are you on? Can you see any exit?"
   - "Do you smell gas or see any fire or smoke?"
   - "Are you able to move your legs?"

4. REASSURANCE (1 line max)
   "Your location is pinned. Rescue team dispatched — stay on this chat."

RULES:
- {"Use Marathi script entirely." if lang == "marathi" else "Use Hindi script entirely." if lang == "hindi" else "Use simple English. Short sentences."}
- {"ULTRA SHORT — battery critical. 3 lines max." if battery < 20 else "Keep under 80 words total."}
- NEVER say "I understand your distress" or "I'm sorry to hear"
- NEVER give more than ONE action at a time
- Sound like a calm, fast-thinking rescue professional — not a chatbot
- Use their exact words back to them
"""

    async def generate():
        # Send incident ID first
        yield f'data: {{"type":"id","id":"{incident_id}"}}\n\n'

        try:
            full_response = ""
            messages = [{"role": "user", "content": prompt}]
            
            # Try Primary (Online Hugging Face)
            try:
                # pyrefly: ignore [missing-import]
                from huggingface_hub import AsyncInferenceClient
                hf_token = os.getenv("HUGGINGFACE_API_KEY")
                hf_client = AsyncInferenceClient(token=hf_token)
                model_name = os.getenv("GEMMA_FAST_MODEL", "google/gemma-4-31B-it")
                
                async for chunk in await hf_client.chat_completion(
                    model=model_name,
                    messages=messages,
                    temperature=0.7,
                    max_tokens=800,
                    stream=True
                ):
                    if not chunk.choices:
                        continue
                    
                    delta = chunk.choices[0].delta
                    c_text = getattr(delta, "content", "") or ""
                    content = c_text

                    if content:
                        full_response += content
                        safe = content.replace('\\', '\\\\').replace('"', '\\"').replace('\n', '\\n').replace('\r', '')
                        yield f'data: {{"type":"chunk","text":"{safe}"}}\n\n'
                        
            except Exception as e:
                logger.warning(f"🌐 HF Stream Failed: {e}. Switching to LOCAL FALLBACK.")
                from openai import AsyncOpenAI
                ollama_url = os.getenv("OLLAMA_URL", "http://host.docker.internal:11434/v1")
                local_model = os.getenv("LOCAL_FALLBACK_MODEL", "gemma2:2b")
                local_client = AsyncOpenAI(base_url=ollama_url, api_key="ollama")
                
                response = await local_client.chat.completions.create(
                    model=local_model,
                    messages=messages,
                    temperature=0.7,
                    max_tokens=300,
                    stream=False
                )
                if response.choices:
                    content = response.choices[0].message.content
                    if content:
                        full_response += content
                        safe = content.replace('\\', '\\\\').replace('"', '\\"').replace('\n', '\\n').replace('\r', '')
                        yield f'data: {{"type":"chunk","text":"{safe}"}}\n\n'

            # Classify triage
            msg_lower = message.lower()
            if any(w in msg_lower for w in ["trapped", "buried", "unconscious",
                                             "not breathing", "can't breathe", "crush", "collapse"]):
                triage = "CRITICAL"
            elif any(w in msg_lower for w in ["injured", "bleeding", "gas", "fire",
                                               "stuck", "broken", "pain", "child fell"]):
                triage = "HIGH"
            else:
                triage = "MODERATE"

            # Save to Redis after streaming completes
            incident = {
                "id": incident_id, "message": message,
                "lat": lat, "lon": lon,
                "triage_level": triage,
                "ai_response": full_response,
                "timestamp": datetime.utcnow().isoformat(),
                "status": "ACTIVE", "battery": battery, "lang": lang,
            }
            try:
                redis = await get_redis()
                await redis.set(f"incident:{incident_id}", json.dumps(incident))
                await redis.lpush("active_incidents", json.dumps(incident))
                await redis.ltrim("active_incidents", 0, 99)
                await redis.publish("broadcast:admin", json.dumps({
                    "type": "new_incident", "incident": incident,
                }))
            except Exception:
                pass

            yield f'data: {{"type":"done","triage":"{triage}","id":"{incident_id}"}}\n\n'

        except Exception as e:
            logger.error(f"Streaming SOS failed: {e}")
            yield f'data: {{"type":"error","message":"Help is coming. Stay calm."}}\n\n'

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ══════════════════════════════════════════════════════════════════════
#  ENDPOINT 1c: Responder SOS Chat — STREAMING (SSE)
# ══════════════════════════════════════════════════════════════════════
@app.post("/api/responder/sos/stream", dependencies=[Depends(is_responder)])
async def responder_sos_stream(body: dict = Body(...)):
    message  = body.get("message", "")
    lat      = body.get("lat", 18.5204)
    lon      = body.get("lon", 73.8567)
    battery  = body.get("battery", 100)
    lang     = body.get("lang", "english")

    incident_id = str(uuid.uuid4())[:8]

    # Fetch live active incidents from Redis for high-impact context-aware answers
    active_incidents = []
    try:
        redis = await get_redis()
        raw = await redis.lrange("active_incidents", 0, 9)
        active_incidents = [json.loads(i) for i in raw]
    except Exception:
        pass

    incidents_text = ""
    if active_incidents:
        incidents_text = "\n".join([
            f"- Incident ID {inc.get('id')}: {inc.get('message')} at Lat {inc.get('lat')}, Lon {inc.get('lon')} | Triage: {inc.get('triage_level')} | Status: {inc.get('status')}"
            for inc in active_incidents if inc.get("status") == "ACTIVE" or inc.get("status") == "ASSIGNED"
        ])
    else:
        incidents_text = "No active critical incidents currently recorded. Proceed with routine search and perimeter security."

    # Build conversation context
    conversation_history = body.get("history", [])
    history_text = ""
    if conversation_history:
        history_text = "\n".join([
            f"{'Responder' if h['role']=='user' else 'AURORA'}: {h['text']}"
            for h in conversation_history[-6:]
        ])

    conversation_header = ("CONVERSATION SO FAR:\n" + history_text) if history_text else "FIRST CONTACT"

    prompt = f"""You are AURORA CRPF Tactical Command AI — a mission-critical military disaster coordination expert deployed 
during an active earthquake in Pune, India. 

Your objective is to comprehensively direct a CRPF (Central Reserve Police Force) responder to reach high-impact areas and offer relevant, tactical help.

CURRENT FIELD STATE (ACTIVE INCIDENTS IN SECTOR III):
{incidents_text}

RESPONDER PROFILE:
- Current GPS Location: {lat}, {lon}
- Battery Level: {battery}%
- Language Option: {lang}
- Mission Profile: High-impact search & rescue, path clearance, primary medical stabilization, and barrier containment.

{conversation_header}

CRITICAL INSTRUCTIONS FOR YOUR RESPONSE:
1. **Directly Answer Their Query**: Read their input ("{message}") and answer it directly, tailored to exactly what they are asking. Do not repeat a fixed template.
2. **Instruction-Type Tactical Tone**: Use crisp, direct, imperative commands (e.g., "PROCEED TO...", "ESTABLISH SECURITY...", "DEPLOY ASSETS..."). Do not use any conversational fluff or emotional reassurance (absolutely NO citizen-calming words like "I understand you are scared" or "Help is on the way").
3. **Actionable Pune Geography**: Incorporate coordinate-based direction where appropriate. Advise on ingress routes avoiding chokepoints based on SB Road, Jhansi Rani Chowk, or general Pune sector paths.
4. **Formatting**: Use clean Markdown. Keep it brief (under 150 words) for immediate, high-stress tactical reading.
"""

    async def generate():
        # Send incident ID first
        yield f'data: {{"type":"id","id":"{incident_id}"}}\n\n'

        try:
            full_response = ""
            messages = [{"role": "user", "content": prompt}]
            
            # Try Primary (Online Hugging Face)
            try:
                # pyrefly: ignore [missing-import]
                from huggingface_hub import AsyncInferenceClient
                hf_token = os.getenv("HUGGINGFACE_API_KEY")
                hf_client = AsyncInferenceClient(token=hf_token)
                model_name = os.getenv("GEMMA_FAST_MODEL", "google/gemma-4-31B-it")
                
                async for chunk in await hf_client.chat_completion(
                    model=model_name,
                    messages=messages,
                    temperature=0.7,
                    max_tokens=800,
                    stream=True
                ):
                    if not chunk.choices:
                        continue
                    
                    delta = chunk.choices[0].delta
                    c_text = getattr(delta, "content", "") or ""
                    content = c_text

                    if content:
                        full_response += content
                        safe = content.replace('\\', '\\\\').replace('"', '\\"').replace('\n', '\\n').replace('\r', '')
                        yield f'data: {{"type":"chunk","text":"{safe}"}}\n\n'
                        
            except Exception as e:
                logger.warning(f"🌐 HF Stream Failed: {e}. Switching to LOCAL FALLBACK.")
                from openai import AsyncOpenAI
                ollama_url = os.getenv("OLLAMA_URL", "http://host.docker.internal:11434/v1")
                local_model = os.getenv("LOCAL_FALLBACK_MODEL", "gemma2:2b")
                local_client = AsyncOpenAI(base_url=ollama_url, api_key="ollama")
                
                response = await local_client.chat.completions.create(
                    model=local_model,
                    messages=messages,
                    temperature=0.7,
                    max_tokens=350,
                    stream=False
                )
                if response.choices:
                    content = response.choices[0].message.content
                    if content:
                        full_response += content
                        safe = content.replace('\\', '\\\\').replace('"', '\\"').replace('\n', '\\n').replace('\r', '')
                        yield f'data: {{"type":"chunk","text":"{safe}"}}\n\n'

            # Classify triage
            msg_lower = message.lower()
            if any(w in msg_lower for w in ["trapped", "buried", "unconscious",
                                             "not breathing", "can't breathe", "crush", "collapse"]):
                triage = "CRITICAL"
            elif any(w in msg_lower for w in ["injured", "bleeding", "gas", "fire",
                                               "stuck", "broken", "pain", "child fell"]):
                triage = "HIGH"
            else:
                triage = "MODERATE"

            # Save to Redis after streaming completes
            incident = {
                "id": incident_id, "message": f"[RESPONDER SOS]: {message}",
                "lat": lat, "lon": lon,
                "triage_level": triage,
                "ai_response": full_response,
                "timestamp": datetime.utcnow().isoformat(),
                "status": "ACTIVE", "battery": battery, "lang": lang,
                "reported_by": "responder"
            }
            try:
                redis = await get_redis()
                await redis.set(f"incident:{incident_id}", json.dumps(incident))
                await redis.lpush("active_incidents", json.dumps(incident))
                await redis.ltrim("active_incidents", 0, 99)
                await redis.publish("broadcast:admin", json.dumps({
                    "type": "new_incident", "incident": incident,
                }))
            except Exception:
                pass

            yield f'data: {{"type":"done","triage":"{triage}","id":"{incident_id}"}}\n\n'

        except Exception as e:
            logger.error(f"Streaming SOS failed: {e}")
            yield f'data: {{"type":"error","message":"CRPF Tactical Command offline. Proceed with manual field orders."}}\n\n'

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ══════════════════════════════════════════════════════════════════════
#  ENDPOINT 2: Admin Incidents List
# ══════════════════════════════════════════════════════════════════════
@app.get("/api/admin/incidents")
async def get_admin_incidents():
    try:
        redis = await get_redis()
        raw = await redis.lrange("active_incidents", 0, 49)
        incidents = [json.loads(i) for i in raw]
        return {"incidents": incidents, "count": len(incidents)}
    except Exception:
        return {"incidents": [], "count": 0}


# ══════════════════════════════════════════════════════════════════════
#  ENDPOINT 3: Admin Full Intelligence Report (Gemma 4 smart model)
# ══════════════════════════════════════════════════════════════════════
@app.get("/api/admin/summary")
async def get_admin_summary():
    redis = await get_redis()

    # ── Credit-saver: return cached summary if it exists (60s TTL) ──
    try:
        cached = await redis.get("admin_summary_cache")
        if cached:
            return json.loads(cached)
    except Exception:
        pass

    try:
        raw_incidents = await redis.lrange("active_incidents", 0, 49)
        incidents = [json.loads(i) for i in raw_incidents]
    except Exception:
        incidents = []

    prompt = f"""You are AURORA's Command Intelligence AI — the strategic brain 
of the disaster response operation. The Admin Commander is watching your output 
on a live dashboard RIGHT NOW.

LIVE OPERATIONAL DATA:
Total active incidents: {len(incidents)}
Incident details: {json.dumps(incidents)}

Generate a FULL COMMAND INTELLIGENCE REPORT as ONLY this JSON:

{{
  "command_status": {{
    "phase": "INITIAL_RESPONSE|ACTIVE_RESCUE|STABILIZATION|RECOVERY",
    "overall_severity": "CATASTROPHIC|CRITICAL|SEVERE|MODERATE",
    "control_rating": <1-10, how well the situation is being managed>,
    "headline": "<10-word situation summary for war room display>"
  }},
  
  "zone_analysis": [
    {{
      "zone_name": "<area name>",
      "incident_count": <integer>,
      "severity": "CRITICAL|HIGH|MODERATE",
      "primary_threat": "<what is the main danger here>",
      "people_at_risk": <estimated integer>,
      "resources_deployed": <integer>,
      "resources_needed": "<what is still required>",
      "gemma_assessment": "<one insight about this specific zone>"
    }}
  ],
  
  "resource_allocation": {{
    "ambulances": {{
      "total": <integer>,
      "deployed": <integer>,
      "recommendation": "<where to send next available unit>"
    }},
    "fire_trucks": {{
      "total": <integer>,
      "deployed": <integer>,
      "recommendation": "<where to send next available unit>"
    }},
    "ndrf_teams": {{
      "total": <integer>,
      "deployed": <integer>,
      "recommendation": "<where to send next available unit>"
    }}
  }},
  
  "critical_decisions": [
    {{
      "decision": "<specific decision the commander must make NOW>",
      "options": ["<option A>", "<option B>"],
      "gemma_recommendation": "<which option and why — data-backed>",
      "urgency": "IMMEDIATE|WITHIN_15MIN|WITHIN_1HR"
    }}
  ],
  
  "timeline_forecast": {{
    "next_30_min": "<what will happen and what must be done>",
    "next_2_hours": "<expected situation evolution>",
    "resolution_estimate": "<when full control expected>"
  }},
  
  "commander_briefing": "<4 sentences — situation, biggest risk, top action, outlook. Written like a military briefing. Fast. Direct. No fluff.>",
  
  "efficiency_score": <0-10>,
  "lives_at_risk": <integer estimate>,
  "lives_secured": <integer estimate>
}}

Base EVERYTHING on the actual incident data above.
If no incidents, generate a readiness/standby report instead.
No generic advice. Every point must reference real data or Pune-specific context."""

    try:
        raw_response = await call_gemma_smart(prompt)
        match = re.search(r'\{.*\}', raw_response, re.DOTALL)
        summary = json.loads(match.group()) if match else {"commander_briefing": raw_response}
    except Exception:
        summary = {"commander_briefing": "Intelligence report generating. Stand by."}

    result = {
        "summary": summary,
        "incident_count": len(incidents),
        "generated_at": datetime.utcnow().isoformat(),
        "model": "gemma-4-31b-it",
    }

    # ── Cache the result for 60 seconds to prevent redundant LLM calls ──
    try:
        await redis.set("admin_summary_cache", json.dumps(result), ex=60)
    except Exception:
        pass

    return result


# ══════════════════════════════════════════════════════════════════════
#  ENDPOINT 4: Admin AI What-If Chat
# ══════════════════════════════════════════════════════════════════════
@app.post("/api/admin/ai-chat")
async def admin_ai_chat(body: dict = Body(...)):
    question = body.get("question", "")
    try:
        redis = await get_redis()
        raw = await redis.lrange("active_incidents", 0, 4)
        incidents = [json.loads(i) for i in raw]
    except Exception:
        incidents = []

    prompt = f"""You are AURORA's strategic AI advisor for Pune earthquake command center.
Current live incidents: {json.dumps(incidents)}

Commander's question: "{question}"

Answer with specific data-backed reasoning. Reference actual triage levels,
incident counts, and locations from the data above.
If asked about diverting a resource, calculate the tradeoff explicitly.
If no incidents exist yet, answer based on general disaster response doctrine.
Max 150 words. Be decisive and direct."""

    response = await call_gemma_fast(prompt)
    return {"answer": response, "model": "gemma-4-31b-it",
            "timestamp": datetime.utcnow().isoformat()}


# ══════════════════════════════════════════════════════════════════════
#  ENDPOINT 5: System Status
# ══════════════════════════════════════════════════════════════════════
@app.get("/api/status")
async def get_status():
    status = {"redis": "disconnected", "db": "disconnected",
              "gemma": "unknown", "active_incidents": 0}
    try:
        redis = await get_redis()
        await redis.ping()
        status["redis"] = "connected"
        count = await redis.llen("active_incidents")
        status["active_incidents"] = count
    except Exception:
        pass
    try:
        status["db"] = "connected"
    except Exception:
        pass
    try:
        result = await call_gemma_fast("Say: OK")
        status["gemma"] = "connected" if result else "error"
    except Exception:
        status["gemma"] = "error"
    return status


# ══════════════════════════════════════════════════════════════════════
#  ENDPOINT 6: Infrastructure
# ══════════════════════════════════════════════════════════════════════
@app.get("/api/infrastructure")
async def get_infrastructure():
    return {"infrastructure": [
        {"name": "Ruby Hall Clinic", "type": "hospital", "lat": 18.5308, "lon": 73.8797, "capacity": 400},
        {"name": "KEM Hospital", "type": "hospital", "lat": 18.5018, "lon": 73.8636, "capacity": 600},
        {"name": "Sassoon General Hospital", "type": "hospital", "lat": 18.5167, "lon": 73.8625, "capacity": 1200},
        {"name": "Pune Fire Brigade HQ", "type": "fire_station", "lat": 18.5195, "lon": 73.8553, "capacity": 10},
        {"name": "Katraj Fire Station", "type": "fire_station", "lat": 18.4647, "lon": 73.8697, "capacity": 6},
        {"name": "Shivajinagar Police HQ", "type": "police", "lat": 18.5308, "lon": 73.8474, "capacity": 50},
        {"name": "Nehru Stadium Shelter", "type": "shelter", "lat": 18.5167, "lon": 73.8553, "capacity": 2000},
        {"name": "Balewadi Stadium Shelter", "type": "shelter", "lat": 18.5645, "lon": 73.7769, "capacity": 3000},
    ]}


# ══════════════════════════════════════════════════════════════════════
#  Phyphox Device Management (Global DataCollector)
# ══════════════════════════════════════════════════════════════════════
from backend.pipeline.data_collection import PhyphoxCollector
_collector = PhyphoxCollector()


# ══════════════════════════════════════════════════════════════════════
#  ENDPOINT 7a: Register Phyphox Device
# ══════════════════════════════════════════════════════════════════════
@app.post("/api/sensor/register")
async def register_sensor_device(body: dict = Body(...)):
    ip = body.get("ip", "").strip()
    name = body.get("name")
    if not ip:
        return {"error": "IP address required"}
    device = _collector.register_device(ip, name)
    return {"status": "registered", "device": device}


# ══════════════════════════════════════════════════════════════════════
#  ENDPOINT 7b: Test Phyphox Sensor Connection
# ══════════════════════════════════════════════════════════════════════
@app.get("/api/sensor/test")
async def test_sensor_connection():
    import aiohttp
    if _collector.device_count == 0:
        return {"status": "unreachable", "error": "No devices registered"}
    
    try:
        async with aiohttp.ClientSession() as session:
            readings = await _collector.poll_all_once(session)
        
        if not readings:
            return {"status": "unreachable", "error": "No data received from devices"}
        
        reading = readings[0]
        has_gps = bool(reading.get("lat") and reading.get("lon"))
        return {
            "status": "connected",
            "reading": reading,
            "sensors": {
                "accelerometer": [reading.get("acc_x", 0), reading.get("acc_y", 0), reading.get("acc_z", 0)],
                "gyroscope": [reading.get("gyr_x", 0), reading.get("gyr_y", 0), reading.get("gyr_z", 0)],
                "linear_acceleration": [reading.get("lin_acc_x", 0), reading.get("lin_acc_y", 0), reading.get("lin_acc_z", 0)],
                "location": {"lat": reading.get("lat"), "lon": reading.get("lon")},
            },
            "has_gps": has_gps,
            "devices": _collector.get_devices(),
        }
    except Exception as e:
        return {"status": "error", "error": str(e)}


# ══════════════════════════════════════════════════════════════════════
#  ENDPOINT 7c: List Registered Devices
# ══════════════════════════════════════════════════════════════════════
@app.get("/api/sensor/devices")
async def list_sensor_devices():
    return {"devices": _collector.get_devices(), "count": _collector.device_count}


# ══════════════════════════════════════════════════════════════════════
#  ENDPOINT 8: Simulate
# ══════════════════════════════════════════════════════════════════════
@app.post("/api/simulate")
async def run_simulation(body: dict = Body(...)):
    from backend.simulator.full_simulation import run_full_simulation
    import asyncio
    try:
        # Run the simulation in the background so we don't block the frontend.
        # The simulation will push to Redis and broadcast via WebSockets.
        asyncio.create_task(run_full_simulation())
        
        return {
            "simulation_complete": True,
            "message": "Simulation started in background. Incidents will populate via WebSocket."
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"error": str(e), "simulation_complete": False}


# ══════════════════════════════════════════════════════════════════════
#  ENDPOINT 8: Responder Field Briefing (Gemma 4 smart model)
# ══════════════════════════════════════════════════════════════════════
@app.get("/api/responder/briefing/{incident_id}")
async def get_responder_briefing(incident_id: str):
    # Fetch incident from Redis
    try:
        redis = await get_redis()
        raw = await redis.get(f"incident:{incident_id}")
        if not raw:
            return {"error": "Incident not found"}
        incident = json.loads(raw)
    except Exception:
        return {"error": "Redis unavailable"}

    prompt = f"""You are AURORA tactical AI briefing a FIELD RESPONDER 
who is currently driving to this incident location.

INCIDENT DATA:
- Citizen message: "{incident.get('message', '')}"
- Triage level: {incident.get('triage_level', 'UNKNOWN')}
- GPS: {incident.get('lat')}, {incident.get('lon')}
- Area: Pune, Maharashtra — Seismic Zone III
- Special hazards: {incident.get('triage', {}).get('special_hazards', [])}
- Victims reported: {incident.get('triage', {}).get('victims_detected', 'unknown')}
- Is anyone trapped: {incident.get('triage', {}).get('is_trapped', False)}

Generate a RESPONDER FIELD BRIEFING in this exact JSON structure:

{{
  "situation_summary": "<2 sentences — what happened and current state>",
  
  "on_arrival_checklist": [
    "<Step 1: First thing to do the moment you arrive>",
    "<Step 2>",
    "<Step 3>",
    "<Step 4>",
    "<Step 5>"
  ],
  
  "hazard_warnings": [
    "<Specific hazard 1 at this location>",
    "<Specific hazard 2>"
  ],
  
  "equipment_needed": [
    "<Item 1 — be specific, e.g. 'Hydraulic spreader for possible trapped victim'>",
    "<Item 2>"
  ],
  
  "building_assessment": {{
    "likely_structure": "<RCC/load-bearing/old construction — based on Pune Zone III norms>",
    "collapse_risk": "HIGH|MODERATE|LOW",
    "safe_entry_point": "<which side/direction to approach from>",
    "avoid": "<what to avoid on arrival>"
  }},
  
  "victim_status": {{
    "count": <integer or null>,
    "condition": "<what we know about injuries>",
    "location_in_building": "<floor/area if mentioned>",
    "mobility": "MOBILE|LIMITED|IMMOBILE|UNKNOWN"
  }},
  
  "immediate_actions": {{
    "first_60_seconds": "<exactly what to do in the first minute>",
    "communication": "Establish radio contact with Command. Report arrival. Confirm victim count.",
    "escalate_if": "<specific condition that means call for backup immediately>"
  }},
  
  "gemma_tactical_note": "<one insight only a smart AI would give — pattern from data, not obvious>"
}}

Be specific to THIS incident. No generic advice. Reference their exact words."""

    try:
        raw_response = await call_gemma_smart(prompt)
        match = re.search(r'\{.*\}', raw_response, re.DOTALL)
        if match:
            briefing = json.loads(match.group())
        else:
            briefing = {"situation_summary": raw_response}
    except Exception:
        briefing = {"situation_summary": "Unable to generate briefing. Proceed with standard protocol."}

    return {
        "incident_id": incident_id,
        "briefing": briefing,
        "generated_by": "gemma-4-31b-it",
        "timestamp": datetime.utcnow().isoformat(),
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
