"""
AURORA TECH — Disaster Orchestration Graph
Uses LangGraph to coordinate agents and manage state.
"""
from typing import TypedDict, List, Dict, Any, Annotated
import operator
from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver
from backend.ai.agents.triage_agent import run_triage
from backend.ai.agents.tactical_agent import run_tactical
from backend.ai.agents.oversight_agent import run_oversight
from backend.ai.schemas.emergency import SOSReport
from backend.services.redis_client import redis_service
import logging

logger = logging.getLogger("aurora.ai.graphs.disaster")

class GraphState(TypedDict):
    sos_report: SOSReport
    triage_results: Dict[str, Any]
    tactical_recommendations: Dict[str, Any]
    oversight_summary: Dict[str, Any]
    history: Annotated[List[str], operator.add]
    next_step: str

async def triage_node(state: GraphState):
    """Extracts intelligence from the raw SOS report."""
    report = state["sos_report"]
    intelligence = await run_triage(report.raw_message)
    
    return {
        "triage_results": intelligence,
        "next_step": "tactical"
    }

async def tactical_node(state: GraphState):
    """Generates deployment recommendations based on shared state."""
    # Build incidents list from current triage
    incidents = [state["triage_results"]]
    
    recommendations = await run_tactical(incidents)
    
    return {
        "tactical_recommendations": recommendations,
        "next_step": "update_state"
    }

async def oversight_node(state: GraphState):
    """Synthesizes the global operational state for command center."""
    full_state = {
        "triage": state["triage_results"],
        "tactical": state["tactical_recommendations"],
    }
    
    summary = await run_oversight(full_state)
    
    # Update global state in Redis
    await redis_service.set_state("global_summary", summary)
    
    return {
        "oversight_summary": summary,
        "next_step": "end"
    }

async def update_state_node(state: GraphState):
    """Updates the shared operational memory in Redis."""
    intelligence = state["triage_results"]
    report = state["sos_report"]
    
    # Construct a complete incident dict compatible with the dashboard UI
    incident = {
        "id": report.id,
        "message": report.raw_message,
        "lat": report.lat,
        "lon": report.lon,
        "triage_level": intelligence.get("triage_level", "HIGH"),
        "ai_response": state.get("tactical_recommendations", {}).get("gemma_insight", "Help dispatched."),
        "timestamp": report.timestamp.isoformat() if hasattr(report.timestamp, "isoformat") else str(report.timestamp),
        "status": "ACTIVE",
        "battery": 100,
        "lang": "english",
        "triage": intelligence,
        "tactical": state.get("tactical_recommendations", {})
    }
    
    # Update Redis atomically (deduplicating the pending record)
    await redis_service.update_list_atomic("active_incidents", incident)
    await redis_service.set_state(f"triage:{report.id}", intelligence)
    
    # Broadcast event for real-time UI
    await redis_service.publish_event("broadcast:admin", {
        "type": "new_incident",
        "incident": incident
    })
    
    return {
        "next_step": "oversight"
    }

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
