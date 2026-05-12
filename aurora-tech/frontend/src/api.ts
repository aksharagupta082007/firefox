const API_BASE = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:8000`;
const WS_BASE = import.meta.env.VITE_WS_URL || `ws://${window.location.hostname}:8000`;

export const api = {
  async simulate(params: { magnitude: number; epicenter_lat: number; epicenter_lon: number; depth_km: number; use_real_sensor: boolean }) {
    const res = await fetch(`${API_BASE}/api/simulate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    return res.json();
  },
  async submitSOS(data: { lat: number; lon: number; severity: number; message: string; people_count: number; needs_medical: boolean; is_trapped: boolean }) {
    const res = await fetch(`${API_BASE}/api/sos`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  },
  async triageChat(message: string, history: Array<{ role: string; content: string }> = []) {
    const res = await fetch(`${API_BASE}/api/triage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, history }),
    });
    return res.json();
  },
  async getInfrastructure() {
    const res = await fetch(`${API_BASE}/api/infrastructure`);
    return res.json();
  },
  async getResources() {
    const res = await fetch(`${API_BASE}/api/resources`);
    return res.json();
  },
  async getStatus() {
    const res = await fetch(`${API_BASE}/api/status`);
    return res.json();
  },
  async testSensor() {
    const res = await fetch(`${API_BASE}/api/sensor/test`);
    return res.json();
  },
  async getSensorLocation() {
    const res = await fetch(`${API_BASE}/api/sensor/location`);
    return res.json();
  },
  async getLastSimulation() {
    const res = await fetch(`${API_BASE}/api/last-simulation`);
    return res.json();
  },
  async getDevices() {
    const res = await fetch(`${API_BASE}/api/devices`);
    return res.json();
  },
  async registerDevice(ip: string, name?: string, port = 8080) {
    const res = await fetch(`${API_BASE}/api/devices/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ip, name, port }),
    });
    return res.json();
  },
  async removeDevice(ip: string) {
    const res = await fetch(`${API_BASE}/api/devices/${ip}`, { method: 'DELETE' });
    return res.json();
  },
};

export function createWebSocket(onMessage: (data: any) => void): WebSocket {
  const ws = new WebSocket(`${WS_BASE}/ws`);
  ws.onmessage = (event) => {
    try { onMessage(JSON.parse(event.data)); } catch (e) { console.error('WS parse error', e); }
  };
  ws.onopen = () => console.log('WebSocket connected');
  ws.onclose = () => {
    console.log('WebSocket disconnected, reconnecting in 3s...');
    setTimeout(() => createWebSocket(onMessage), 3000);
  };
  return ws;
}
