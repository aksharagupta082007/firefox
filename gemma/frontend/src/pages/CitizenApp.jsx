import { useState, useRef, useEffect } from "react";
import { api } from "../api";

export default function CitizenApp() {
  const [messages, setMessages] = useState([
    { role: "ai", content: "AURORA Emergency Triage — I'm here to help. Are you safe? Describe your situation and I'll guide you." }
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [sosForm, setSosForm] = useState({ severity: 3, people: 1, medical: false, trapped: false, message: "" });
  const [sosSent, setSosSent] = useState(false);
  const chatEnd = useRef(null);

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || sending) return;
    const userMsg = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setSending(true);
    try {
      const history = messages.map((m) => ({ role: m.role === "ai" ? "assistant" : "user", content: m.content }));
      const data = await api.triageChat(userMsg, history);
      setMessages((prev) => [...prev, { role: "ai", content: data.response }]);
    } catch {
      setMessages((prev) => [...prev, { role: "ai", content: "[WARNING] AI offline. Steps: 1) DROP, COVER, HOLD ON  2) Move to open ground  3) Call 112" }]);
    } finally {
      setSending(false);
    }
  };

  const submitSOS = async () => {
    try {
      await api.submitSOS({
        lat: 18.5204 + (Math.random() - 0.5) * 0.02,
        lon: 73.8567 + (Math.random() - 0.5) * 0.02,
        severity: sosForm.severity,
        message: sosForm.message || `SOS from citizen - Severity ${sosForm.severity}`,
        people_count: sosForm.people,
        needs_medical: sosForm.medical,
        is_trapped: sosForm.trapped
      });
      setSosSent(true);
      setTimeout(() => setSosSent(false), 5e3);
    } catch (err) {
      console.error("SOS submit failed", err);
    }
  };

  return (
    <div style={{ maxWidth: 600, margin: "0 auto" }}>
      <h2 style={{ marginBottom: 8 }}>Citizen Disaster Mode</h2>
      <p className="text-muted" style={{ marginBottom: 24, fontSize: "0.85rem" }}>
        SOS reporting &amp; offline AI triage powered by Gemma 4 (Ollama)
      </p>

      {/* SOS Quick Report */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header">
          <span className="card-title">Quick SOS Report</span>
          {sosSent && <span className="card-badge badge-low">✓ Sent!</span>}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
          <div className="sim-field">
            <label>Severity (1–5)</label>
            <input
              type="number"
              min={1}
              max={5}
              value={sosForm.severity}
              onChange={(e) => setSosForm((p) => ({ ...p, severity: +e.target.value }))}
            />
          </div>
          <div className="sim-field">
            <label>People Count</label>
            <input
              type="number"
              min={1}
              value={sosForm.people}
              onChange={(e) => setSosForm((p) => ({ ...p, people: +e.target.value }))}
            />
          </div>
        </div>
        <div style={{ display: "flex", gap: 16, marginBottom: 12 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: "0.85rem" }}>
            <input
              type="checkbox"
              checked={sosForm.medical}
              onChange={(e) => setSosForm((p) => ({ ...p, medical: e.target.checked }))}
            />
            Needs Medical
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: "0.85rem" }}>
            <input
              type="checkbox"
              checked={sosForm.trapped}
              onChange={(e) => setSosForm((p) => ({ ...p, trapped: e.target.checked }))}
            />
            Trapped
          </label>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            className="chat-input"
            placeholder="Describe your situation..."
            value={sosForm.message}
            onChange={(e) => setSosForm((p) => ({ ...p, message: e.target.value }))}
          />
          <button className="btn btn-danger" onClick={submitSOS}>Send SOS</button>
        </div>
      </div>

      {/* Triage Chat */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">AI Triage Chat</span>
          <span className="card-badge badge-low">Gemma 4 Edge</span>
        </div>
        <div className="chat-container">
          <div className="chat-messages">
            {messages.map((msg, i) => (
              <div key={i} className={`chat-bubble ${msg.role === "user" ? "user" : "ai"}`}>
                {msg.content}
              </div>
            ))}
            {sending && (
              <div className="chat-bubble ai" style={{ opacity: 0.6 }}>
                Analyzing your situation...
              </div>
            )}
            <div ref={chatEnd} />
          </div>
          <div className="chat-input-bar">
            <input
              className="chat-input"
              placeholder="Describe your situation..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
              disabled={sending}
            />
            <button className="btn btn-primary" onClick={sendMessage} disabled={sending || !input.trim()}>
              Send
            </button>
          </div>
        </div>
      </div>

      {/* Emergency Info */}
      <div className="card" style={{ marginTop: 24 }}>
        <div className="card-header">
          <span className="card-title">Nearest Pune Shelters</span>
        </div>
        <div style={{ fontSize: "0.85rem", lineHeight: 2 }}>
          <div><strong>Sambhaji Park</strong>, Deccan — Open Ground (~2000 capacity)</div>
          <div><strong>Pune Race Course</strong>, Camp — Open Ground (~5000 capacity)</div>
          <div><strong>Magarpatta City Grounds</strong>, Hadapsar (~3000 capacity)</div>
          <div><strong>SPPU Campus</strong>, Aundh — Large Open Area</div>
          <div style={{ marginTop: 12, color: "var(--severity-critical)", fontWeight: 600 }}>
            Emergency: Dial 112 | NDRF: 011-24363260
          </div>
        </div>
      </div>
    </div>
  );
}
