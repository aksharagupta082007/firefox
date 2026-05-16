"""
AURORA TECH — WebSocket Pub/Sub Manager
Handles real-time communication across multiple instances using Redis.
"""
import json
import logging
import asyncio
from typing import List, Dict, Any
from fastapi import WebSocket, WebSocketDisconnect
from backend.services.redis_client import redis_service

logger = logging.getLogger("aurora.websocket")

class WebSocketManager:
    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = {
            "admin": [],
            "responder": [],
            "citizen": []
        }
        self.pubsub_task = None

    async def connect(self, websocket: WebSocket, role: str):
        await websocket.accept()
        if role not in self.active_connections:
            role = "citizen" # Default
        self.active_connections[role].append(websocket)
        logger.info(f"✅ {role.upper()} connected. Total: {len(self.active_connections[role])}")

    def disconnect(self, websocket: WebSocket, role: str):
        if role in self.active_connections and websocket in self.active_connections[role]:
            self.active_connections[role].remove(websocket)
            logger.info(f"❌ {role.upper()} disconnected.")

    async def broadcast_to_role(self, role: str, message: dict):
        """Send message to all connections of a specific role."""
        if role not in self.active_connections:
            return
        
        data = json.dumps(message, default=str)
        for connection in self.active_connections[role][:]:
            try:
                await connection.send_text(data)
            except Exception:
                self.active_connections[role].remove(connection)

    async def start_pubsub_listener(self):
        """Listener that waits for messages from Redis and broadcasts them."""
        pubsub = None
        try:
            pubsub = redis_service.client.pubsub()
            await pubsub.subscribe("broadcast:admin", "broadcast:responder", "broadcast:citizen")
        except Exception as e:
            logger.warning(f"⚠️ Redis Pub/Sub disabled: {e}")
            if pubsub:
                try:
                    await pubsub.close()
                except Exception:
                    pass
            return

        logger.info("📡 WebSocket Pub/Sub listener started.")
        
        try:
            while True:
                message = await pubsub.get_message(ignore_subscribe_messages=True)
                if message:
                    channel = message['channel']
                    role = channel.split(":")[1]
                    data = json.loads(message['data'])
                    await self.broadcast_to_role(role, data)
                await asyncio.sleep(0.01) # Non-blocking sleep
        except asyncio.CancelledError:
            logger.info("Redis Pub/Sub listener stopped.")
            raise
        except Exception as e:
            logger.error(f"❌ PubSub Listener Error: {e}")
        finally:
            try:
                await pubsub.unsubscribe()
            except Exception:
                pass
            await pubsub.close()

ws_manager = WebSocketManager()
