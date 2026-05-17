# AURORA TECH — Infrastructure Setup Guide

To run the AURORA TECH platform, you must have Redis and PostgreSQL (with PostGIS) installed and running.

## 1. Redis (Operational Memory)
The system uses Redis for real-time state synchronization and WebSocket Pub/Sub.

### Installation (Windows)
1. **Memurai (Recommended)**: Download from [memurai.com](https://www.memurai.com/get-memurai). It is a native Windows port of Redis.
2. **Docker**: `docker run -d --name aurora-redis -p 6379:6379 redis`

### Verification
Run `redis-cli ping` in your terminal. You should receive `PONG`.

---

## 2. PostgreSQL + PostGIS (Geo-spatial Database)
The system uses PostGIS to calculate responder distances and store incident coordinates.

### Installation
1. Download PostgreSQL from [postgresql.org](https://www.postgresql.org/download/windows/).
2. During installation, ensure you select **Application Stack Builder**.
3. Open Stack Builder, select your Postgres installation, and under **Spatial Extensions**, install **PostGIS**.

### Database Configuration
Open `psql` or pgAdmin and execute:
```sql
-- 1. Create the database
CREATE DATABASE aurora;

-- 2. Connect to the database
\c aurora;

-- 3. Enable the PostGIS extension
CREATE EXTENSION postgis;
```

---

## 3. Environment Configuration
If your local setup differs from the defaults, create a `.env` file in `backend/`:

```env
DATABASE_URL=postgresql://aurora:aurora@localhost:5433/aurora_db
REDIS_URL=redis://localhost:6379

# Primary Online LLM (Hugging Face)
HUGGINGFACE_API_KEY=your_hugging_face_token
GEMMA_FAST_MODEL=google/gemma-4-31B-it
GEMMA_SMART_MODEL=google/gemma-4-31B-it

# Offline Edge Fallback (Local Ollama)
OLLAMA_URL=http://localhost:11434/v1
LOCAL_FALLBACK_MODEL=gemma2:2b

# Security
JWT_SECRET_KEY=generate_a_random_string_here
```

---

## 4. Launch Sequence
1. **Start Redis & Postgres services**.
2. **Backend**: 
   ```powershell
   cd backend
   pip install -r requirements.txt
   uvicorn main:app --reload
   ```
3. **Frontend**:
   ```powershell
   cd frontend
   npm install
   npm run dev
   ```
