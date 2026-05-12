"""
Earthquake Simulator — Synthetic Anomaly Generator for Demo
Proves Detection → Dispatch < 30 seconds.
"""
import random, math, time, logging
from datetime import datetime
from typing import List, Dict, Any

logger = logging.getLogger(__name__)

PUNE_NEIGHBORHOODS = [
    {"name": "Shivajinagar", "lat": 18.5314, "lon": 73.8446},
    {"name": "Kothrud", "lat": 18.5074, "lon": 73.8077},
    {"name": "Hinjewadi", "lat": 18.5912, "lon": 73.7389},
    {"name": "Koregaon Park", "lat": 18.5283, "lon": 73.8741},
    {"name": "Deccan", "lat": 18.5171, "lon": 73.8413},
    {"name": "Swargate", "lat": 18.5018, "lon": 73.8636},
    {"name": "Viman Nagar", "lat": 18.5642, "lon": 73.9174},
    {"name": "Hadapsar", "lat": 18.5130, "lon": 73.9270},
    {"name": "Aundh", "lat": 18.5565, "lon": 73.8250},
    {"name": "Baner", "lat": 18.5600, "lon": 73.7700},
    {"name": "Pune Station", "lat": 18.5204, "lon": 73.8567},
    {"name": "Camp", "lat": 18.5225, "lon": 73.8596},
    {"name": "Yerwada", "lat": 18.5400, "lon": 73.8900},
    {"name": "Katraj", "lat": 18.4830, "lon": 73.8550},
    {"name": "Erandwane", "lat": 18.4972, "lon": 73.8166},
]

PUNE_RESOURCE_UNITS = [
    {"id": 1, "unit_name": "AMB-01 Sahyadri", "type": "ambulance", "lat": 18.5158, "lon": 73.8410},
    {"id": 2, "unit_name": "AMB-02 Ruby Hall", "type": "ambulance", "lat": 18.5308, "lon": 73.8810},
    {"id": 3, "unit_name": "AMB-03 Sassoon", "type": "ambulance", "lat": 18.5239, "lon": 73.8700},
    {"id": 4, "unit_name": "AMB-04 Deenanath", "type": "ambulance", "lat": 18.4972, "lon": 73.8166},
    {"id": 5, "unit_name": "FIRE-01 Shivajinagar", "type": "fire_truck", "lat": 18.5314, "lon": 73.8446},
    {"id": 6, "unit_name": "FIRE-02 Swargate", "type": "fire_truck", "lat": 18.5018, "lon": 73.8636},
    {"id": 7, "unit_name": "FIRE-03 Kothrud", "type": "fire_truck", "lat": 18.5074, "lon": 73.8077},
    {"id": 8, "unit_name": "POL-01 Shivajinagar", "type": "police", "lat": 18.5320, "lon": 73.8470},
    {"id": 9, "unit_name": "POL-02 Deccan", "type": "police", "lat": 18.5170, "lon": 73.8390},
    {"id": 10, "unit_name": "NDRF-01 Pune", "type": "ndrf", "lat": 18.5500, "lon": 73.8500},
]

SOS_MESSAGES = {
    5: ["Building collapsed, people trapped!", "Severe damage, need rescue NOW!"],
    4: ["Wall fell, people injured. Send ambulance.", "Gas leak after quake."],
    3: ["Cracks in walls. Some injuries.", "Road blocked by debris."],
    2: ["Light shaking, no injuries. Is it safe?"],
    1: ["Slight vibration. No damage."],
}

def _haversine(lat1, lon1, lat2, lon2):
    R = 6371.0
    dlat, dlon = math.radians(lat2-lat1), math.radians(lon2-lon1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1))*math.cos(math.radians(lat2))*math.sin(dlon/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))


class EarthquakeSimulator:
    def __init__(self, epicenter_lat=18.5204, epicenter_lon=73.8567, magnitude=5.2, depth_km=10.0):
        self.epicenter_lat = epicenter_lat
        self.epicenter_lon = epicenter_lon
        self.magnitude = magnitude
        self.depth_km = depth_km
        self._rng = random.Random()  # Dynamic simulation on every run

    def generate_trigger(self) -> Dict[str, Any]:
        return {"source": "simulation", "magnitude": self.magnitude,
                "lat": self.epicenter_lat, "lon": self.epicenter_lon,
                "depth_km": self.depth_km, "timestamp": datetime.utcnow().isoformat(),
                "place": "Pune, Maharashtra (Zone III)", "official_trigger": 1.0}

    def generate_sensor_readings(self, num_devices=8, samples=50) -> List[Dict]:
        readings = []
        for d in range(num_devices):
            hood = self._rng.choice(PUNE_NEIGHBORHOODS)
            dlat = hood["lat"] + self._rng.uniform(-0.005, 0.005)
            dlon = hood["lon"] + self._rng.uniform(-0.005, 0.005)
            dist = _haversine(self.epicenter_lat, self.epicenter_lon, dlat, dlon)
            # Amplitude scales with magnitude and decays with distance
            base_amp = self.magnitude * max(0.2, 1.0/(1+dist*0.15)) * 0.8
            freq = self._rng.uniform(1.5, 5.0)  # seismic band 1.5-5Hz
            did = f"dev_{d:03d}_{hood['name'].replace(' ','_')}"
            for s in range(samples):
                t = s * 0.1
                # P-wave onset (sharp) then S-wave (sustained, higher amplitude)
                p_wave = base_amp * 0.4 * math.exp(-0.3 * max(0, t-0.5)) * math.sin(2*math.pi*freq*1.5*t)
                s_wave = base_amp * math.exp(-0.02*t) * math.sin(2*math.pi*freq*t)
                # Combine: P-wave arrives first, S-wave dominates after ~1s
                onset = min(1.0, t / 1.0)  # ramp up over first second
                sig = p_wave * (1 - onset) + s_wave * onset
                n = self._rng.gauss(0, 0.2)
                readings.append({"device_id": did, "timestamp": time.time()+s*0.1,
                    "acc_x": round(sig*self._rng.uniform(0.7,1.0)+n, 4),
                    "acc_y": round(sig*self._rng.uniform(0.7,1.0)+n, 4),
                    "acc_z": round(9.81+sig*0.3+n*0.3, 4),
                    "lin_acc_x": round(sig*self._rng.uniform(0.7,1.0)+n, 4),
                    "lin_acc_y": round(sig*self._rng.uniform(0.7,1.0)+n, 4),
                    "lin_acc_z": round(sig*0.3+n*0.3, 4),
                    "gyr_x": round(sig*0.15+n*0.1, 4), "gyr_y": round(sig*0.15+n*0.1, 4),
                    "gyr_z": round(n*0.05, 4), "pressure": round(1013.25+self._rng.gauss(0,0.5), 2),
                    "lat": dlat, "lon": dlon})
        return readings

    def generate_sos_reports(self, num=25) -> List[Dict]:
        reports = []
        for i in range(num):
            spread = self._rng.gauss(0, 0.02) * (5.0/self.magnitude)
            lat = round(self.epicenter_lat + spread, 6)
            lon = round(self.epicenter_lon + spread, 6)
            dist = _haversine(self.epicenter_lat, self.epicenter_lon, lat, lon)
            sev = max(1, min(5, int(5 - dist*0.8 + self._rng.randint(-1,1))))
            reports.append({"id": i+1, "lat": lat, "lon": lon, "severity": sev,
                "people_count": self._rng.randint(1,8),
                "needs_medical": self._rng.random() < (0.4 if sev>=4 else 0.15),
                "is_trapped": self._rng.random() < (0.3 if sev>=4 else 0.05),
                "message": self._rng.choice(SOS_MESSAGES.get(sev, SOS_MESSAGES[3])),
                "timestamp": datetime.utcnow().isoformat()})
        return reports

    def generate_blocked_roads(self, n=3) -> List[tuple]:
        candidates = [(1,2),(2,3),(1,9),(9,4),(8,12),(2,17)]
        return self._rng.sample(candidates, min(n, len(candidates)))

    def get_resource_units(self): return PUNE_RESOURCE_UNITS


def run_full_simulation(magnitude=5.2, lat=18.5204, lon=73.8567) -> Dict[str, Any]:
    sim = EarthquakeSimulator(lat, lon, magnitude)
    return {"trigger": sim.generate_trigger(), "sensor_readings": sim.generate_sensor_readings(),
            "sos_reports": sim.generate_sos_reports(), "blocked_roads": sim.generate_blocked_roads(),
            "resource_units": sim.get_resource_units(),
            "params": {"magnitude": magnitude, "epicenter": {"lat": lat, "lon": lon},
                       "timestamp": datetime.utcnow().isoformat()}}
