"""
AURORA TECH — Full Earthquake Simulation
End-to-end demo: 10 realistic SOS messages → Gemma 4 triage → tactical plan → oversight briefing.
Designed for hackathon judges to see the full AI pipeline in action.
"""
from backend.ai.agents.triage_agent import run_triage
from backend.ai.agents.tactical_agent import run_tactical, MOCK_RESOURCES
from backend.ai.agents.oversight_agent import run_oversight
import asyncio, json, uuid
from datetime import datetime

SOS_MESSAGES = [
    {"msg": "I am trapped under concrete rubble, my right leg is crushed, I cannot move at all, please send help now", "lat": 18.4655, "lon": 73.8714, "area": "Katraj"},
    {"msg": "There is a very strong gas smell in my building on the 3rd floor, I am afraid to turn on any lights", "lat": 18.5195, "lon": 73.8553, "area": "Kothrud"},
    {"msg": "My 70 year old mother hit her head during the shaking and is now unconscious, she is breathing but not responding", "lat": 18.5308, "lon": 73.8474, "area": "Aundh"},
    {"msg": "The wall of my building has a huge crack from floor to ceiling, is it safe to stay inside the building", "lat": 18.5524, "lon": 73.9197, "area": "Viman Nagar"},
    {"msg": "Fire has broken out on the second floor of our apartment, it is spreading fast and 6 families are stuck above", "lat": 18.4953, "lon": 73.8628, "area": "Sinhagad Road"},
    {"msg": "My child fell from the second floor during the earthquake, he is crying and says his neck hurts, we are scared to move him", "lat": 18.5089, "lon": 73.8074, "area": "Wakad"},
    {"msg": "The entire staircase of our 8 floor building has collapsed, 12 people are stranded on the upper floors with no way down", "lat": 18.5645, "lon": 73.7769, "area": "Pimpri"},
    {"msg": "I can hear screaming from the collapsed building next door, I can see a hand reaching out from under the debris", "lat": 18.4547, "lon": 73.8711, "area": "Hadapsar"},
    {"msg": "Elderly man having chest pain and difficulty breathing since the earthquake started, he looks very pale", "lat": 18.5234, "lon": 73.8456, "area": "Deccan"},
    {"msg": "Water pipe burst in our area, the road is flooding fast and cars are being swept away", "lat": 18.5167, "lon": 73.8553, "area": "Shivajinagar"},
]


async def run_full_simulation() -> dict:
    print("AURORA SIMULATION STARTING...")
    incidents = []

    for i, sos in enumerate(SOS_MESSAGES):
        print(f"Processing SOS {i+1}/{len(SOS_MESSAGES)}: {sos['area']}")

        triage_result = await run_triage(sos["msg"])

        incident = {
            "id": f"SIM-{i+1:03d}",
            "area": sos["area"],
            "message": sos["msg"],
            "lat": sos["lat"],
            "lon": sos["lon"],
            "triage": triage_result,
            "timestamp": datetime.utcnow().isoformat(),
            "simulated": True,
        }
        incidents.append(incident)

        try:
            from backend.services.redis_client import redis_service
            await redis_service.connect()
            if redis_service.client:
                await redis_service.client.lpush("active_incidents", json.dumps(incident))
        except Exception:
            pass

        await asyncio.sleep(0.3)

    print("Running tactical planning with Gemma...")
    tactical = await run_tactical(incidents, MOCK_RESOURCES)

    print("Running oversight synthesis with Gemma...")
    oversight = await run_oversight({
        "incidents": incidents,
        "tactical": tactical,
        "resources": MOCK_RESOURCES,
        "location": "Pune, Maharashtra, India",
        "earthquake_magnitude": 6.2,
    })

    critical = sum(1 for i in incidents if i["triage"].get("triage_level") == "CRITICAL")
    high = sum(1 for i in incidents if i["triage"].get("triage_level") == "HIGH")

    return {
        "simulation_complete": True,
        "scenario": {
            "location": "Pune, Maharashtra, India",
            "epicenter": {"lat": 18.5204, "lon": 73.8567},
            "magnitude": 6.2,
            "depth_km": 10,
            "seismic_zone": "Zone III",
        },
        "incidents_processed": len(incidents),
        "triage_summary": {
            "CRITICAL": critical,
            "HIGH": high,
            "MODERATE": len(incidents) - critical - high,
        },
        "incidents": incidents,
        "tactical_plan": tactical,
        "command_briefing": oversight,
        "gemma_models_used": ["gemma-4-31b-it"],
        "simulation_timestamp": datetime.utcnow().isoformat(),
    }
