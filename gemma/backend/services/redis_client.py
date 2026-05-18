"""
AURORA TECH — Redis Service
Handles concurrency-safe operational memory and Pub/Sub.
"""
import redis.asyncio as redis
import json
import os
import logging
from typing import Any, Optional, Dict

logger = logging.getLogger("aurora.services.redis")

class RedisClient:
    def __init__(self):
        self.redis_url = os.getenv("REDIS_URL", "redis://127.0.0.1:6379/0")
        self.client: Optional[redis.Redis] = None

    async def connect(self):
        if not self.client:
            client: redis.Redis = redis.Redis.from_url(self.redis_url, decode_responses=True)
            try:
                client.ping()
                self.client = client
                logger.info(f"✅ Connected to Redis at {self.redis_url}")
            except Exception as e:
                await client.aclose()
                self.client = None
                logger.warning(f"⚠️  Redis unavailable at {self.redis_url} — running without persistence. ({e})")

    async def disconnect(self):
        if self.client:
            await self.client.close()
            logger.info("Redis connection closed.")

    async def set_state(self, key: str, value: Any, expire: int = 3600):
        """Atomic state update with expiration."""
        await self.connect()
        data = json.dumps(value)
        await self.client.set(key, data, ex=expire)

    async def get_state(self, key: str) -> Optional[Any]:
        await self.connect()
        data = await self.client.get(key)
        return json.loads(data) if data else None

    async def update_list_atomic(self, key: str, item: Dict[str, Any], max_length: int = 100):
        """
        Concurrency-safe list update using Redis pipeline.
        Deduplicates items based on 'id' if present, then LPUSH and LTRIM.
        Used for SOS queues and event logs.
        """
        await self.connect()
        item_id = item.get("id")
        
        if item_id:
            try:
                raw_list = await self.client.lrange(key, 0, -1)
                pipe = self.client.pipeline(transaction=True)
                for raw_item in raw_list:
                    try:
                        parsed = json.loads(raw_item)
                        if parsed.get("id") == item_id:
                            pipe.lrem(key, 0, raw_item)
                    except Exception:
                        pass
                pipe.lpush(key, json.dumps(item))
                pipe.ltrim(key, 0, max_length - 1)
                await pipe.execute()
                return
            except Exception as e:
                logger.error(f"Error in deduplicating list update: {e}")

        async with self.client.pipeline(transaction=True) as pipe:
            pipe.lpush(key, json.dumps(item))
            pipe.ltrim(key, 0, max_length - 1)
            await pipe.execute()

    async def acquire_lock(self, lock_name: str, timeout: int = 10) -> bool:
        """Simple distributed lock using SET NX."""
        await self.connect()
        return await self.client.set(f"lock:{lock_name}", "locked", ex=timeout, nx=True)

    async def release_lock(self, lock_name: str):
        await self.connect()
        await self.client.delete(f"lock:{lock_name}")

    async def publish_event(self, channel: str, message: Dict[str, Any]):
        """Publish events for WebSocket broadcasting."""
        await self.connect()
        await self.client.publish(channel, json.dumps(message))

redis_service = RedisClient()
