"""
AURORA TECH — PostGIS Client
Geo-spatial persistence for incidents, responders, and infrastructure.
"""
import os
import logging
from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime, Text, Boolean
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from geoalchemy2 import Geometry
from datetime import datetime

logger = logging.getLogger("aurora.services.postgis")

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://aurora:aurora@127.0.0.1:5432/aurora_db")

Base = declarative_base()

class Incident(Base):
    __tablename__ = "incidents"
    id = Column(String, primary_key=True)
    timestamp = Column(DateTime, default=datetime.utcnow)
    raw_message = Column(Text)
    triage_level = Column(String)
    priority_score = Column(Float)
    geom = Column(Geometry('POINT', srid=4326))

class Responder(Base):
    __tablename__ = "responders"
    id = Column(String, primary_key=True)
    name = Column(String)
    role = Column(String) # ambulance, fire, rescue
    status = Column(String) # available, dispatched, busy
    geom = Column(Geometry('POINT', srid=4326))

class PostGISClient:
    def __init__(self):
        self.engine = create_engine(DATABASE_URL, pool_pre_ping=True)
        self.SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=self.engine)
        
    def init_db(self):
        """Create tables if they don't exist."""
        try:
            Base.metadata.create_all(bind=self.engine)
            logger.info("✅ PostGIS tables initialized.")
        except Exception as e:
            logger.warning(f"⚠️ PostGIS unavailable; geospatial persistence is disabled: {e}")

    def save_incident(self, incident_id: str, lat: float, lon: float, message: str, triage: str = "medium"):
        session = self.SessionLocal()
        try:
            point = f'POINT({lon} {lat})'
            db_incident = Incident(
                id=incident_id,
                raw_message=message,
                triage_level=triage,
                geom=point
            )
            session.merge(db_incident)
            session.commit()
        except Exception as e:
            logger.warning(f"⚠️ Failed to save incident to PostGIS: {e}")
        finally:
            session.close()

postgis_client = PostGISClient()
