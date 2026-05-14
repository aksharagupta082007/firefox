"""
AURORA TECH — Production Entry Point
Centralized AI Command System for Disaster Response.
"""
import asyncio
import logging
import os
from datetime import datetime
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from backend.auth.rbac import is_admin, is_responder, is_citizen, get_current_user
from backend.websocket.manager import ws_manager
from backend.services.redis_client import redis_service
from backend.services.postgis_client import postgis_client
from backend.ai.graphs.disaster_graph import disaster_graph
from backend.ai.schemas.emergency import SOSReport, TriageIntelligence

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("aurora.main")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("🚀 AURORA TECH Intelligence Engine Starting...")
    await redis_service.connect()
    postgis_client.init_db()
    
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
from backend.auth.jwt_handler import create_access_token, verify_password, get_password_hash

# Mock User DB (In production, this would be PostgreSQL)
USERS_DB = {
    "admin": {"username": "admin", "password": get_password_hash("aurora2026"), "role": "admin"},
    "responder_01": {"username": "responder_01", "password": get_password_hash("rescue_now"), "role": "responder"},
    "citizen_demo": {"username": "citizen_demo", "password": get_password_hash("safety_first"), "role": "citizen"},
}

@app.post("/token")
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    user = USERS_DB.get(form_data.username)
    if not user or not verify_password(form_data.password, user["password"]):
        raise HTTPException(status_code=400, detail="Incorrect username or password")
    
    access_token = create_access_token(data={"sub": user["username"], "role": user["role"]})
    return {
        "access_token": access_token, 
        "token_type": "bearer",
        "user": {"username": user["username"], "role": user["role"]}
    }

@app.post("/api/signup")
async def signup(username: str, password: str, role: str = "citizen"):
    if username in USERS_DB:
        raise HTTPException(status_code=400, detail="Username already registered")
    
    USERS_DB[username] = {
        "username": username,
        "password": get_password_hash(password),
        "role": role
    }
    return {"status": "success", "message": f"User {username} created as {role}"}

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

# ── WebSocket Management ──────────────────────────────────────────────
@app.websocket("/ws/{role}")
async def websocket_endpoint(websocket: WebSocket, role: str):
    await ws_manager.connect(websocket, role)
    try:
        while True:
            # Handle incoming data (Ping/Pong or Audio Chunks)
            data = await websocket.receive()
            
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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
