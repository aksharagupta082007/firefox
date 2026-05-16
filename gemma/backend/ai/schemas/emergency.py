"""
AURORA TECH — Emergency Schemas
Structured data models for disaster intelligence.
"""
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime

class SOSReport(BaseModel):
    id: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    lat: float
    lon: float
    raw_message: str
    source: str = "citizen_web" # citizen_web, voice, sensor
    media_metadata: Optional[Dict[str, Any]] = None

class TriageIntelligence(BaseModel):
    triage_level: str = Field(..., pattern="^(critical|high|medium|low)$")
    victims_detected: int = 0
    is_trapped: bool = False
    mobility_status: str = "unknown" # none, limited, mobile
    injury_summary: str
    priority_score: float = Field(..., ge=0, le=1.0)
    escalation_required: bool = False

class TacticalAction(BaseModel):
    action_type: str # dispatch, reroute, alert, medical_advice
    target_id: str
    resource_type: str
    priority: int
    justification: str
    requires_approval: bool = True

class OperationalState(BaseModel):
    active_incidents: List[SOSReport] = []
    triage_outputs: Dict[str, TriageIntelligence] = {} # incident_id -> intelligence
    responder_locations: Dict[str, Dict[str, float]] = {}
    blocked_routes: List[Dict[str, Any]] = []
    hospital_capacity: Dict[str, int] = {}
