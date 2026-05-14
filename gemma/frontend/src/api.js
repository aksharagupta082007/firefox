const API_BASE = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:8000`;
const WS_BASE = import.meta.env.VITE_WS_URL || `ws://${window.location.hostname}:8000`;

// Helper to get auth headers
const getHeaders = () => {
  const token = localStorage.getItem("aurora_token");
  return {
    "Content-Type": "application/json",
    ...(token ? { "Authorization": `Bearer ${token}` } : {})
  };
};

export const api = {
  // Auth
  async login(username, password) {
    // In a real app, this would be a POST to /token
    // For now, we mock the role based on the username for demonstration
    // but the backend will return a real JWT
    const res = await fetch(`${API_BASE}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ username, password })
    });
    const data = await res.json();
    if (data.access_token) {
      localStorage.setItem("aurora_token", data.access_token);
      localStorage.setItem("aurora_user", JSON.stringify(data.user));
    }
    return data;
  },

  // Citizen
  async submitSOS(data) {
    const res = await fetch(`${API_BASE}/api/citizen/sos`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(data)
    });
    return res.json();
  },

  async submitVoiceSOS(audioBase64, lat, lon) {
    const res = await fetch(`${API_BASE}/api/citizen/voice-sos`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ audio_b64: audioBase64, lat, lon })
    });
    return res.json();
  },

  // Admin
  async getActiveIncidents() {
    const res = await fetch(`${API_BASE}/api/admin/incidents`, {
      headers: getHeaders()
    });
    return res.json();
  },

  async approveAction(reportId) {
    const res = await fetch(`${API_BASE}/api/admin/approve/${reportId}`, {
      method: "POST",
      headers: getHeaders()
    });
    return res.json();
  },

  async getOversightSummary() {
    const res = await fetch(`${API_BASE}/api/admin/summary`, {
      headers: getHeaders()
    });
    return res.json();
  },

  // Legacy/System
  async getStatus() {
    const res = await fetch(`${API_BASE}/api/status`);
    return res.json();
  },
  
  async getInfrastructure() {
    const res = await fetch(`${API_BASE}/api/infrastructure`);
    return res.json();
  }
};

export function createWebSocket(role, onMessage) {
  // Pass role to backend to subscribe to correct channel
  const ws = new WebSocket(`${WS_BASE}/ws/${role}`);
  
  ws.onmessage = (event) => {
    try {
      onMessage(JSON.parse(event.data));
    } catch (e) {
      console.error("WS parse error", e);
    }
  };

  ws.onopen = () => console.log(`WebSocket connected as ${role}`);
  ws.onclose = () => {
    console.log("WebSocket disconnected, reconnecting in 3s...");
    setTimeout(() => createWebSocket(role, onMessage), 3000);
  };

  return ws;
}
