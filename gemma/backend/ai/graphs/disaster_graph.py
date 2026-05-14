"""
AURORA TECH — Disaster Orchestration Graph
Uses LangGraph to coordinate agents and manage state.
"""
from typing import TypedDict, Annotated, List, Union, Dict, Any
from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver # Basic in-memory checkpointing for demonstration
from backend.ai.agents.triage_agent import triage_agent
from backend.ai.agents.tactical_agent import tactical_agent
from backend.ai.agents.oversight_agent import oversight_agent
from backend.ai.schemas.emergency import SOSReport, TriageIntelligence, TacticalAction
from backend.services.redis_client import redis_service
import logging

logger = logging.getLogger("aurora.ai.graphs.disaster")

class GraphState(TypedDict):
    sos_report: SOSReport
    triage_results: TriageIntelligence
    tactical_recommendations: List[TacticalAction]
    oversight_summary: Dict[str, Any]
    history: List[str]
    next_step: str

async def triage_node(state: GraphState):
    """Extracts intelligence from the raw SOS report."""
    report = state["sos_report"]
    intelligence = await triage_agent.process(report.raw_message)
    
    return {
        **state,
        "triage_results": intelligence,
        "next_step": "tactical"
    }

async def tactical_node(state: GraphState):
    """Generates deployment recommendations based on shared state."""
    # Fetch global state from Redis for reasoning context
    global_state = await redis_service.get_state("operational_state") or {}
    
    # Add current triage results to context
    global_state["current_triage"] = state["triage_results"].model_dump()
    
    recommendations = await tactical_agent.reason(global_state)
    
    return {
        **state,
        "tactical_recommendations": recommendations,
        "next_step": "oversight"
    }

async def oversight_node(state: GraphState):
    """Synthesizes the global operational state for command center."""
    global_state = await redis_service.get_state("operational_state") or {}
    
    summary = await oversight_agent.synthesize(global_state)
    
    # Update global state in Redis
    await redis_service.set_state("global_summary", summary)
    
    return {
        **state,
        "oversight_summary": summary,
        "next_step": "end"
    }

async def update_state_node(state: GraphState):
    """Updates the shared operational memory in Redis."""
    intelligence = state["triage_results"]
    report = state["sos_report"]
    
    # Update Redis atomically
    await redis_service.update_list_atomic("active_incidents", report.model_dump())
    await redis_service.set_state(f"triage:{report.id}", intelligence.model_dump())
    
    # Broadcast event for real-time UI
    await redis_service.publish_event("broadcast:admin", {
        "type": "new_incident",
        "incident_id": report.id,
        "severity": intelligence.triage_level,
        "lat": report.lat,
        "lon": report.lon
    })
    
    return {**state, "next_step": "end"}

# Build the graph
workflow = StateGraph(GraphState)

# Add nodes
workflow.add_node("triage", triage_node)
workflow.add_node("tactical", tactical_node)
workflow.add_node("oversight", oversight_node)
workflow.add_node("update_state", update_state_node)

# Add edges
workflow.set_entry_point("triage")
workflow.add_edge("triage", "tactical")
workflow.add_edge("tactical", "update_state")
workflow.add_edge("update_state", "oversight")
workflow.add_edge("oversight", END)

# Compile with interrupt support (HITL)
# We interrupt BEFORE update_state if the tactical agent proposes a high-priority dispatch
checkpointer = MemorySaver()
disaster_graph = workflow.compile(
    checkpointer=checkpointer,
    interrupt_before=["update_state"] # Mandatory human approval checkpoint
)
