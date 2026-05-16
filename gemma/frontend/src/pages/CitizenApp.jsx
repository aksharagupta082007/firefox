import { useState, useRef, useEffect } from "react";
import { api } from "../api";

export default function CitizenApp() {
  const [messages, setMessages] = useState([
    { role: "ai", content: "AURORA Emergency Triage — I'm here to help. Are you safe? You can type your situation or press the Microphone to send a voice SOS." }
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const [sosSent, setSosSent] = useState(false);
  const mediaRecorder = useRef(null);
  const audioChunks = useRef([]);
  const chatEnd = useRef(null);

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async (text = null) => {
    const userMsg = text || input.trim();
    if (!userMsg || sending) return;
    
    if (!text) setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setSending(true);

    try {
      // Get current location (Mocking Pune for demo)
      const lat = 18.5204 + (Math.random() - 0.5) * 0.01;
      const lon = 73.8567 + (Math.random() - 0.5) * 0.01;

      const data = await api.submitSOS({ message: userMsg, lat, lon });
      
      setMessages((prev) => [...prev, { 
        role: "ai", 
        content: `SOS Received (ID: ${data.report_id}). AI is currently extracting triage intelligence. Please stay where you are if safe.` 
      }]);
      setSosSent(true);
      setTimeout(() => setSosSent(false), 5000);
    } catch {
      setMessages((prev) => [...prev, { role: "ai", content: "[CRITICAL] Connection lost. Move to safety and call 112." }]);
    } finally {
      setSending(false);
    }
  };

  const startRecording = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder.current = new MediaRecorder(stream);
    audioChunks.current = [];

    mediaRecorder.current.ondataavailable = (e) => audioChunks.current.push(e.data);
    mediaRecorder.current.onstop = async () => {
      const audioBlob = new Blob(audioChunks.current, { type: 'audio/wav' });
      const reader = new FileReader();
      reader.readAsDataURL(audioBlob);
      reader.onloadend = async () => {
        const base64Audio = reader.result.split(',')[1];
        setSending(true);
        try {
          const res = await api.submitVoiceSOS(base64Audio, 18.5204, 73.8567);
          setMessages(prev => [...prev, 
            { role: "user", content: "🎤 [Voice SOS Sent]" },
            { role: "ai", content: `Transcribed: "${res.transcription}". Triage in progress.` }
          ]);
        } catch (e) {
          console.error(e);
        } finally {
          setSending(false);
        }
      };
    };

    mediaRecorder.current.start();
    setRecording(true);
  };

  const stopRecording = () => {
    mediaRecorder.current.stop();
    setRecording(false);
  };

  return (
    <div className="citizen-app glass-card" style={{ maxWidth: 800, margin: "0 auto" }}>
      <header className="citizen-header">
        <h2 className="gradient-text">Citizen SOS Portal</h2>
        <div className={`status-pulse ${sosSent ? 'active' : ''}`}></div>
      </header>

      <div className="citizen-grid">
        <div className="chat-section">
          <div className="chat-messages">
            {messages.map((msg, i) => (
              <div key={i} className={`chat-bubble ${msg.role === "user" ? "user" : "ai"}`}>
                {msg.content}
              </div>
            ))}
            {sending && <div className="chat-bubble ai pulse">AI Reasoning...</div>}
            <div ref={chatEnd} />
          </div>

          <div className="chat-input-bar">
            <button 
              className={`voice-btn ${recording ? 'recording' : ''}`} 
              onMouseDown={startRecording} 
              onMouseUp={stopRecording}
              onTouchStart={startRecording}
              onTouchEnd={stopRecording}
            >
              🎤
            </button>
            <input
              className="chat-input"
              placeholder="Type your emergency here..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            />
            <button className="btn btn-danger" onClick={() => sendMessage()} disabled={sending}>
              SEND SOS
            </button>
          </div>
        </div>

        <aside className="citizen-info">
          <div className="info-box">
            <h3>Immediate Actions</h3>
            <ul>
              <li>Drop, Cover, and Hold On.</li>
              <li>Stay away from glass and heavy furniture.</li>
              <li>Move to open ground if inside a weak structure.</li>
            </ul>
          </div>
          <div className="info-box alert">
            <h3>Emergency Numbers</h3>
            <p>Police/Emergency: 112</p>
            <p>Fire: 101</p>
            <p>Ambulance: 102</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
