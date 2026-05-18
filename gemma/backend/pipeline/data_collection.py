"""
Layer 2: Hyperlocal Data Collection (Phyphox Polling)
Real-time polling of phone sensor data from Phyphox remote endpoint.
Polls every 100ms, parses JSON, maps to sensor_readings table.

Sensors collected:
  - Accelerometer (accX, accY, accZ)
  - Gyroscope (gyrX, gyrY, gyrZ)
  - Linear Acceleration (linAccX, linAccY, linAccZ)
  - Location (locLat, locLon, locAlt, locAccuracy)
  - Pressure (p)

Multi-device support:
  - Devices are registered/unregistered dynamically via REST API.
  - Each device is a Phyphox phone on the same WiFi network.
  - The collector polls ALL registered devices concurrently.
"""

import asyncio
import logging
import time
from typing import Optional, Dict, Any, List
from urllib.parse import urlsplit
import aiohttp

logger = logging.getLogger(__name__)

# Default Phyphox query string — all sensor channels
PHYPHOX_QUERY = (
    "accX&accY&accZ&"
    "gyrX&gyrY&gyrZ&"
    "linAccX&linAccY&linAccZ&"
    "locLat&locLon&locAlt&locAccuracy&locTime&"
    "p"
)
POLL_INTERVAL_S = 0.1  # 100ms


def normalize_device_address(address: str, port: int = 8080) -> Dict[str, Any]:
    """Accept an IP, IP:port, or full Phyphox URL and normalize it."""
    raw = (address or "").strip()
    if not raw:
        raise ValueError("Phyphox device IP or URL is required")

    parsed = urlsplit(raw if "://" in raw else f"//{raw}")
    host = parsed.hostname
    if not host:
        raise ValueError("Invalid Phyphox device address")

    resolved_port = parsed.port or port
    return {
        "ip": host,
        "port": resolved_port,
        "url": f"http://{host}:{resolved_port}/get?{PHYPHOX_QUERY}",
    }


def build_endpoint_url(ip: str, port: int = 8080) -> str:
    """Build Phyphox polling URL from a device address."""
    return normalize_device_address(ip, port)["url"]


class PhyphoxCollector:
    """
    Manages polling one or more Phyphox phone endpoints.
    Each phone acts as a distributed seismic sensor node.
    Supports dynamic device registration.
    """

    def __init__(self, initial_devices: Optional[List[str]] = None):
        """
        Args:
            initial_devices: List of IP addresses (e.g., ["192.168.31.146"])
        """
        self._devices: Dict[str, Dict[str, Any]] = {}  # ip -> {url, name, status, last_seen}
        self.running = False
        self._buffer: List[Dict[str, Any]] = []  # ring buffer for recent readings
        self._max_buffer = 500  # keep last 500 readings for FFT window
        self._last_location: Optional[Dict[str, float]] = None  # cache latest GPS fix

        # Register initial devices
        if initial_devices:
            for ip in initial_devices:
                self.register_device(ip)

    @property
    def endpoints(self) -> List[str]:
        """Return list of active endpoint URLs."""
        return [d["url"] for d in self._devices.values()]

    @property
    def device_count(self) -> int:
        return len(self._devices)

    def register_device(self, ip: str, name: str = None, port: int = 8080) -> Dict[str, Any]:
        """
        Register a new Phyphox device by IP address.
        Returns device info dict.
        """
        endpoint = normalize_device_address(ip, port)
        ip = endpoint["ip"]
        port = endpoint["port"]
        url = endpoint["url"]
        device_info = {
            "ip": ip,
            "port": port,
            "url": url,
            "name": name or f"Phone-{ip.split('.')[-1]}",
            "status": "registered",
            "last_seen": None,
            "last_reading": None,
            "has_gps": False,
            "registered_at": time.time(),
        }
        self._devices[ip] = device_info
        logger.info(f"📱 Device registered: {device_info['name']} at {ip}:{port}")
        return device_info

    def unregister_device(self, ip: str) -> bool:
        """Remove a device from the registry."""
        if ip in self._devices:
            name = self._devices[ip]["name"]
            del self._devices[ip]
            logger.info(f"📴 Device unregistered: {name} ({ip})")
            return True
        return False

    def get_devices(self) -> List[Dict[str, Any]]:
        """Return list of all registered devices with their status."""
        return list(self._devices.values())

    def _parse_phyphox_json(self, data: Dict, device_id: str) -> Optional[Dict[str, Any]]:
        """
        Parses Phyphox remote-access JSON into a flat sensor reading dict.
        Phyphox returns: { "buffer": { "accX": { "buffer": [val], "size": 1 }, ... } }
        """
        try:
            buf = data.get("buffer", data)
            def _val(key, default=0.0):
                entry = buf.get(key, {})
                if isinstance(entry, dict):
                    arr = entry.get("buffer", [])
                    if arr:
                        v = arr[-1]
                        return float(v) if v is not None else default
                    return default
                if entry is not None:
                    try:
                        return float(entry)
                    except (ValueError, TypeError):
                        return default
                return default

            # Parse location — Phyphox GPS can be slow, so it may be 0/null
            loc_lat = _val("locLat", default=None)
            loc_lon = _val("locLon", default=None)
            loc_alt = _val("locAlt", default=0.0)
            loc_accuracy = _val("locAccuracy", default=999.0)

            # Update cached location if we got a valid GPS fix
            has_gps = bool(loc_lat and loc_lon and loc_lat != 0.0 and loc_lon != 0.0)
            if has_gps:
                self._last_location = {
                    "lat": loc_lat,
                    "lon": loc_lon,
                    "alt": loc_alt,
                    "accuracy_m": loc_accuracy,
                }

            # Update device status
            if device_id in self._devices:
                self._devices[device_id]["status"] = "online"
                self._devices[device_id]["last_seen"] = time.time()
                self._devices[device_id]["has_gps"] = has_gps

            reading = {
                "device_id": device_id,
                "timestamp": time.time(),
                # Accelerometer (with gravity)
                "acc_x": _val("accX"),
                "acc_y": _val("accY"),
                "acc_z": _val("accZ"),
                # Gyroscope
                "gyr_x": _val("gyrX"),
                "gyr_y": _val("gyrY"),
                "gyr_z": _val("gyrZ"),
                # Linear acceleration (without gravity — better for quake detection)
                "lin_acc_x": _val("linAccX"),
                "lin_acc_y": _val("linAccY"),
                "lin_acc_z": _val("linAccZ"),
                # Location from phone GPS
                "lat": loc_lat if has_gps else (self._last_location["lat"] if self._last_location else None),
                "lon": loc_lon if has_gps else (self._last_location["lon"] if self._last_location else None),
                "altitude": loc_alt,
                "location_accuracy_m": loc_accuracy,
                # Barometric pressure
                "pressure": _val("p"),
            }
            return reading
        except Exception as e:
            logger.error(f"Parse error for device {device_id}: {e}")
            return None

    async def _poll_single(self, session: aiohttp.ClientSession, url: str) -> Optional[Dict[str, Any]]:
        """Fetch from a single Phyphox endpoint."""
        # Extract IP from URL for device_id
        try:
            device_id = urlsplit(url).hostname or "unknown"
        except Exception:
            device_id = "unknown"

        try:
            async with session.get(url, timeout=aiohttp.ClientTimeout(total=1.0)) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    return self._parse_phyphox_json(data, device_id)
                else:
                    logger.warning(f"Sensor Offline: HTTP {resp.status} from {url}")
                    if device_id in self._devices:
                        self._devices[device_id]["status"] = "error"
                    return None
        except asyncio.TimeoutError:
            logger.error(f"Timeout connecting to Phyphox device at {url}")
            if device_id in self._devices:
                self._devices[device_id]["status"] = "timeout"
            return None
        except aiohttp.ClientError as e:
            logger.error(f"ClientError connecting to Phyphox device at {url}: {e}")
            if device_id in self._devices:
                self._devices[device_id]["status"] = "offline"
            return None
        except Exception as e:
            logger.error(f"Unexpected error polling Phyphox device at {url}: {e}")
            if device_id in self._devices:
                self._devices[device_id]["status"] = "error"
            return None

    async def poll_all_once(self, session: aiohttp.ClientSession) -> List[Dict[str, Any]]:
        """Poll all registered endpoints concurrently, return list of readings."""
        if not self.endpoints:
            return []

        tasks = [self._poll_single(session, url) for url in self.endpoints]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        readings = [r for r in results if isinstance(r, dict)]

        # Add to ring buffer
        self._buffer.extend(readings)
        if len(self._buffer) > self._max_buffer:
            self._buffer = self._buffer[-self._max_buffer:]

        return readings

    async def burst_fetch(self, polls: int = 50, interval: float = 0.1) -> List[Dict[str, Any]]:
        """
        Do a burst-fetch: poll all devices `polls` times at `interval` seconds.
        Used by the simulate endpoint for live mode.
        Returns all collected readings.
        """
        all_readings = []
        async with aiohttp.ClientSession() as session:
            for _ in range(polls):
                readings = await self.poll_all_once(session)
                all_readings.extend(readings)
                await asyncio.sleep(interval)
        return all_readings

    def get_buffer(self) -> List[Dict[str, Any]]:
        """Return the current sensor reading buffer (for FFT window)."""
        return list(self._buffer)

    def get_last_location(self) -> Optional[Dict[str, float]]:
        """Return the most recent GPS fix from any device."""
        return self._last_location

    def clear_buffer(self):
        self._buffer.clear()

    async def start_polling_loop(self, callback=None):
        """
        Main polling loop. Runs until self.running is set to False.
        Optional callback(readings) is called on each poll cycle.
        """
        self.running = True
        logger.info(f"Starting Phyphox polling on {self.device_count} device(s)")
        async with aiohttp.ClientSession() as session:
            while self.running:
                readings = await self.poll_all_once(session)
                if callback and readings:
                    await callback(readings)
                await asyncio.sleep(POLL_INTERVAL_S)

    def stop(self):
        self.running = False
        logger.info("Phyphox polling stopped.")
