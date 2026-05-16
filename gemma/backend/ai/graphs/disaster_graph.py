"""
AURORA TECH — Disaster Orchestration Graph
Uses LangGraph to coordinate agents and manage state.
"""
from typing import TypedDict, List, Dict, Any
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
    history: List[str]
    next_step: str

async def triage_node(state: GraphState):
    """Extracts intelligence from the raw SOS report."""
    report = state["sos_report"]
    intelligence = await run_triage(report.raw_message)
    
    return {
        **state,
        "triage_results": intelligence,
        "next_step": "tactical"
    }

async def tactical_node(state: GraphState):
    """Generates deployment recommendations based on shared state."""
    # Build incidents list from current triage
    incidents = [state["triage_results"]]
    
    recommendations = await run_tactical(incidents)
    
    return {
        **state,
        "tactical_recommendations": recommendations,
        "next_step": "oversight"
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
    await redis_service.set_state(f"triage:{report.id}", intelligence)
    
    # Broadcast event for real-time UI
    await redis_service.publish_event("broadcast:admin", {
        "type": "new_incident",
        "incident_id": report.id,
        "severity": intelligence.get("triage_level", "HIGH"),
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
