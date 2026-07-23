<div align="center">

<img src="https://img.shields.io/badge/AURORA_TECH-v1.0-FF2D2D?style=for-the-badge&labelColor=0A0A0A" alt="FireFox"/>

```
 █████╗ ██╗   ██╗██████╗  ██████╗ ██████╗  █████╗     ████████╗███████╗ ██████╗██╗  ██╗
██╔══██╗██║   ██║██╔══██╗██╔═══██╗██╔══██╗██╔══██╗    ╚══██╔══╝██╔════╝██╔════╝██║  ██║
███████║██║   ██║██████╔╝██║   ██║██████╔╝███████║       ██║   █████╗  ██║     ███████║
██╔══██║██║   ██║██╔══██╗██║   ██║██╔══██╗██╔══██║       ██║   ██╔══╝  ██║     ██╔══██║
██║  ██║╚██████╔╝██║  ██║╚██████╔╝██║  ██║██║  ██║       ██║   ███████╗╚██████╗██║  ██║
╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝       ╚═╝   ╚══════╝ ╚═════╝╚═╝  ╚═╝
```

### 🌐 AI-Powered Earthquake Prediction & Autonomous Response System
### *From Seismic Trigger to Rescue Dispatch — in Under 30 Seconds*

<br/>

[![Python](https://img.shields.io/badge/Python-3.11-3776AB?style=flat-square&logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-009688?style=flat-square&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://typescriptlang.org)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16+PostGIS-4169E1?style=flat-square&logo=postgresql&logoColor=white)](https://postgis.net)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?style=flat-square&logo=docker&logoColor=white)](https://docker.com)
[![Gemma](https://img.shields.io/badge/Gemma_4-Google_AI-4285F4?style=flat-square&logo=google&logoColor=white)](https://ai.google.dev)
[![Ollama](https://img.shields.io/badge/Ollama-Edge_AI-FF6B35?style=flat-square)](https://ollama.com)
[![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)

<br/>

> **🏆 Hackathon Entry** · Gemma 4 
> **📍 Zone:** Global Resilience · **Track:** AI Agents — AI for Disaster Management  
> **🎯 Domain:** Seismic Zone III · Pune, Maharashtra, India  
> **Team:** Aurora Tech 

<br/>

---

</div>

## 🎯 What Is Aurora Tech?

**Aurora Tech** is a full-stack, real-time earthquake prediction and autonomous rescue-dispatch platform. It treats every smartphone in a city as a distributed seismometer — using the **Phyphox** app to harvest raw accelerometer, gyroscope, and barometric data — and fuses that signal with official seismic alerts to make hyper-local disaster decisions.

When an earthquake is detected, **Google Gemma 4** orchestrates an 11-layer AI pipeline that:

1. Verifies the event against a multi-factor scoring formula
2. Estimates impact radius and affected critical infrastructure
3. Clusters survivors using DBSCAN + KDE heatmaps
4. Prioritizes rescue zones based on population vulnerability
5. Computes safe routes avoiding blocked and risky roads
6. **Autonomously dispatches** ambulances, fire trucks, police, and NDRF teams

All of this happens in **under 30 seconds** from first detection to dispatch.

The system works **completely offline** — with Gemma 4 edge mode via Ollama providing local AI triage, first-aid protocols, and shelter directions even when the internet is unavailable.

---

## 🏗️ System Architecture

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                        AURORA TECH — 11-LAYER PIPELINE                       │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────────────────────┐  │
│  │ LAYER 1  │──▶│ LAYER 2  │──▶│ LAYER 3  │──▶│       LAYER 4            │  │
│  │ Trigger  │   │  Sensor  │   │  Signal  │   │   Verification Engine    │  │
│  │Detection │   │Collection│   │Processing│   │  Score ≥ 0.55 → verified │  │
│  │(USGS/IMD)│   │(Phyphox) │   │(FFT/STA/ │   │  (Multi-factor formula)  │  │
│  │  or SIM  │   │  or SIM  │   │   LTA)   │   └─────────────┬────────────┘  │
│  └──────────┘   └──────────┘   └──────────┘                 │               │
│                                                              ▼               │
│                                                   ┌──────────────────────┐  │
│          ┌───────────────────────────────────────▶│  LAYERS 5 + 6 + 7    │  │
│          │                                        │  Impact · Survivor   │  │
│          │                                        │  Intelligence · Prio │  │
│          │                                        └──────────┬───────────┘  │
│          │                                                   ▼              │
│          │                                        ┌──────────────────────┐  │
│          │                                        │    LAYERS 8 + 9      │  │
│          │                                        │  Resource Allocation │  │
│          │                                        │  + Safe Route Plan   │  │
│          │                                        └──────────┬───────────┘  │
│          │                                                   ▼              │
│          │                                        ┌──────────────────────┐  │
│          │                                        │   LAYERS 10 + 11     │  │
│          │                                        │  Gemma 4 (Cloud) or  │  │
│          │                                        │  Ollama Edge · Brief │  │
│          │                                        └──────────┬───────────┘  │
│          │                                                   ▼              │
│          │                                        ┌──────────────────────┐  │
│          └───────────────────────────────────────▶│  DISPATCH DEPLOYED   │  │
│                                                   │  Ambulance · Fire    │  │
│                                                   │  Police · NDRF       │  │
│                                                   └──────────────────────┘  │
│                                                                              │
│              TARGET: < 30 seconds  Detection → Dispatch                      │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Layer-by-Layer Breakdown

| Layer | Name | What It Does |
|-------|------|-------------|
| **1** | Trigger Detection | Polls USGS live feed (Pune bbox) or generates synthetic seismic trigger |
| **2** | Sensor Collection | Polls Phyphox phones at 100ms intervals — accel, gyro, GPS, pressure |
| **3** | Signal Processing | FFT + STA/LTA + rolling variance → anomaly score (0–1) |
| **4** | Verification Engine | Multi-factor scoring formula; threshold ≥ 0.55 = verified earthquake |
| **5** | Impact Estimation | Geodesic buffer (Shapely/pyproj) × 20+ Pune infrastructure points |
| **6** | Survivor Intelligence | DBSCAN clustering (500m radius) + KDE heatmap generation |
| **7** | Rescue Prioritization | Multi-factor zone scoring; hospitals/schools auto-escalate to CRITICAL |
| **8** | Resource Allocation | Greedy matching: nearest unit → highest priority zone |
| **9** | Safe Routing | NetworkX graph (18 nodes, 30+ edges); blocked roads = ∞ cost |
| **10** | AI Orchestration | Gemma 4 Cloud (function calling) or Ollama Edge (local fallback) |
| **11** | Tactical Brief | Priority-ranked action plan + incident summary → broadcast via WebSocket |

---

## ⚙️ Verification Formula

The seismic verification engine uses a weighted multi-factor scoring formula:

```
Verified_Score = (0.40 × Official_Trigger)
               + (0.25 × Phone_Anomaly)
               + (0.20 × Distress_Density)
               + (0.15 × Crowd_Disruption)
               − (0.15 × Vibration_Zone_Penalty)

Threshold ≥ 0.55 → Verified Earthquake
Decision: NORMAL → WATCH → CRITICAL → EMERGENCY
```

### Impact Radius Scaling

| Severity Score | Radius |
|---|---|
| 0.4 | 300 m |
| 0.6 | 800 m |
| 0.8+ | 2,000 m+ |

### Rescue Zone Priority Formula

```
Priority = (0.35 × Severity)
          + (0.30 × Anomaly_Density)
          + (0.20 × Distress_Density)
          + (0.15 × Access_Difficulty)

Force-Multiplier: Any zone containing a hospital, school, or
                  old-age home → auto-labeled CRITICAL
```

---

## 🤖 Gemma 4 AI Agent

Aurora Tech uses a **tiered AI agent** strategy:

| Tier | Model | Use Case | Latency |
|------|-------|----------|---------|
| **Tier 1** | Deterministic templates | Score < 0.55, simple events | < 1 ms |
| **Tier 2** | Ollama · Gemma 3:4b (Edge) | Normal ops, offline mode | < 1 s |
| **Tier 3** | Google Gemma 4 27B (Cloud) | Complex multi-zone events | ~2 s |

**Cloud Agent** (Gemma 4) uses function calling to autonomously:
- `get_survivor_clusters()` — retrieve DBSCAN cluster data
- `score_rescue_zones()` — rank zones by priority
- `dispatch_resources()` — assign and deploy rescue units

**Edge Agent** (Ollama, offline-capable):
- Citizen triage chat — first-aid protocols, shelter directions
- Works entirely without internet connectivity
- Speech-to-text via Gemma 4's multimodal capabilities

---

## 🧰 Technology Stack

| Category | Technology |
|----------|-----------|
| **Backend Framework** | FastAPI (Python 3.11) |
| **ASGI Server** | Uvicorn |
| **Database** | PostgreSQL 16 + PostGIS 3.4 |
| **ORM** | SQLAlchemy + GeoAlchemy2 |
| **AI — Cloud** | Google GenAI SDK · Gemma 4 27B |
| **AI — Edge / Offline** | Ollama · Gemma 3:4b (local) |
| **Signal Processing** | NumPy · SciPy |
| **ML / Clustering** | scikit-learn (DBSCAN) |
| **Graph Routing** | NetworkX · OSMnx |
| **Spatial Geometry** | Shapely · pyproj |
| **Pub/Sub** | Redis 7 |
| **Frontend** | React 19 + TypeScript |
| **Build Tool** | Vite 8 |
| **Maps** | Leaflet + react-leaflet |
| **Containerization** | Docker · Docker Compose |
| **GPU Support** | NVIDIA CUDA (via Ollama) |

---

## 🚀 Quick Start

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) & Docker Compose
- [Git](https://git-scm.com/)
- (Optional) NVIDIA GPU + CUDA for accelerated edge inference

### 1. Clone the repository

```bash
git clone https://github.com/aksharagupta082007/firefox.git
cd firefox/gemma
```

### 2. Configure environment

```bash
cp .env.example .env
# Add your Google AI API key (for Gemma 4 Cloud mode):
# GOOGLE_API_KEY=your_key_here
# Leave blank to run in fully offline/edge mode
```

### 3. Launch all services

```bash
docker compose up
```

This starts 5 services simultaneously:
- **`db`** — PostgreSQL 16 + PostGIS 3.4 (port 5432)
- **`redis`** — Redis 7 pub/sub + cache (port 6379)
- **`ollama`** — Local Gemma 3:4b inference (port 11434)
- **`backend`** — FastAPI server (port 8000)
- **`frontend`** — Vite dev / nginx (port 5173)

### 4. Open the application

```
http://localhost:5173
```

### 5. Trigger a demo simulation

1. Navigate to **Demo Simulator** tab
2. Click **"Trigger Earthquake"**
3. Watch the 11-layer pipeline execute with live progress tracking
4. Dashboard auto-switches to **Command Center** showing:
   - Severity banner + real-time status
   - Interactive Leaflet map with heatmap, clusters, and live routes
   - AI-generated tactical brief (Gemma 4)
   - Infrastructure status panel
   - Dispatch assignment table
   - Live event feed via WebSocket

### 6. Test Citizen Mode

- Navigate to the **Citizen App** tab
- Press the pulsing SOS button
- Select status: Safe / Injured / Trapped
- Chat with the AI triage assistant (powered by Ollama, works offline)

---

## 📡 API Reference

### Core Endpoints

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `POST` | `/api/simulate` | Trigger full 11-layer pipeline | Responder+ |
| `POST` | `/api/sensors/phyphox` | Ingest Phyphox sensor window | Device |
| `POST` | `/api/sos` | Submit citizen SOS report | Citizen+ |
| `POST` | `/api/triage` | AI triage chat message | Citizen+ |
| `GET` | `/api/status` | Current system status | Public |
| `GET` | `/api/last-simulation` | Last pipeline results | Viewer+ |
| `GET` | `/api/infrastructure` | Pune critical infrastructure | Public |
| `GET` | `/api/resources` | Available rescue units | Viewer+ |
| `WS` | `/ws` | Real-time pipeline broadcast | All |

### Phyphox Sensor Payload

```json
POST /api/sensors/phyphox
{
  "device_id": "phone_001",
  "timestamp": [1234567890.0, ...],
  "acc_x": [0.12, ...],
  "acc_y": [-0.08, ...],
  "acc_z": [9.81, ...],
  "gyro_x": [0.001, ...],
  "gyro_y": [0.002, ...],
  "gyro_z": [-0.001, ...],
  "pressure": [1013.25, ...],
  "latitude": 18.5204,
  "longitude": 73.8567
}
```

### WebSocket Event Stream

```json
{ "layer": 1, "status": "complete", "data": { "trigger": "magnitude_5.2" } }
{ "layer": 4, "status": "verified", "score": 0.73, "level": "CRITICAL" }
{ "layer": 10, "status": "brief_ready", "tactical_brief": "..." }
```

---

## 🌐 Three-App Frontend

| App | Audience | Key Features |
|-----|----------|-------------|
| **Demo Simulator** | Developers / Judges | Full pipeline trigger, layer-by-layer visual progress |
| **Command Center** | Emergency Responders | Live map, heatmap toggle, dispatch table, tactical brief |
| **Citizen App** | General Public | SOS button, status selector, offline AI triage chat |

---

## 📊 Key System Metrics

| Metric | Value |
|--------|-------|
| **Pipeline target** | < 30 seconds (detection → dispatch) |
| **Sensor polling interval** | 100 ms per device |
| **Verification threshold** | 0.55 / 1.00 |
| **DBSCAN cluster radius** | 500 m, min 3 reports |
| **Pune infrastructure nodes** | 20+ pre-seeded |
| **Road network** | 18 nodes, 30+ edges |
| **Pre-seeded rescue units** | 10 (4 ambulances, 3 fire trucks, 2 police, 1 NDRF) |
| **Edge AI model size** | ~150 MB (Gemma 3:4b Q4_K_M) |

---

## 🔒 RBAC Permission Matrix

| Endpoint | Admin | Responder | Citizen | Viewer |
|----------|:-----:|:---------:|:-------:|:------:|
| `/api/simulate` | ✅ | ✅ | ❌ | ❌ |
| `/api/sos` | ✅ | ✅ | ✅ | ❌ |
| `/api/triage` | ✅ | ✅ | ✅ | ❌ |
| `/api/infrastructure` (GET) | ✅ | ✅ | ✅ | ✅ |
| `/api/infrastructure` (POST/PUT) | ✅ | ❌ | ❌ | ❌ |
| `/api/agent/*` | ✅ | ✅ | ❌ | ❌ |
| `/api/users/*` | ✅ | ❌ | ❌ | ❌ |
| `/ws/voice` | ✅ | ✅ | ✅ | ❌ |

---

## 🛣️ Roadmap

- [x] 11-layer seismic pipeline
- [x] Phyphox real-device sensor integration
- [x] Gemma 4 Cloud autonomous dispatch
- [x] Ollama edge/offline mode + citizen triage
- [x] Gemma 4 Speech-to-Text agentic assistant
- [x] React dashboard with live WebSocket feed
- [ ] Voice Agent (VAD + Whisper STT + Piper TTS)
- [ ] JWT + RBAC auth system
- [ ] Optimized Agent (semantic cache, tiered LLM routing)
- [ ] Flood pipeline extension
- [ ] Hindi/Marathi STT support for Pune context
- [ ] Multi-city deployment (Mumbai, Delhi, Chennai)

---

## 👥 Team Aurora Tech

| Name | Role |
|------|------|
| **Akshara Gupta** | Team Lead · AI Pipeline Architecture |
| **Namita Aragade** | Agentic Orchestration - Gemma 4 Integration |
| **Devarshi Desale** | Frontend · React Dashboard · Citizen App |
| **Shivam Khamkar** | AI Agent · Gemma 4 Integration · Ollama |
| **Swara Deshpande** | Agentic Orchestration Speech-To-Text |

> Built for **Gemma 4 Hackathon**   
> Zone: **Global Resilience**

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

---

<div align="center">

**Aurora Tech** — *Because every second counts.*

*Powered by Gemma 4 · Built for Pune · Designed for the world*

<br/>

[![GitHub](https://img.shields.io/badge/GitHub-aksharagupta082007%2Ffirefox-181717?style=flat-square&logo=github)](https://github.com/aksharagupta082007/firefox)

</div>
