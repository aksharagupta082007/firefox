import { useState, useRef, useEffect } from "react";

const API_BASE = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:8000`;

export default function CitizenApp() {
  const token = localStorage.getItem("aurora_token");

  const [messages, setMessages] = useState([
    { role: "ai", content: "AURORA Emergency Triage — I'm here to help. Tell me your situation or press the microphone.", lang: "english" }
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [streamedText, setStreamedText] = useState("");
  const [recording, setRecording] = useState(false);
  const [voiceError, setVoiceError] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [transcribingVoice, setTranscribingVoice] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(true);
  const recognitionRef = useRef(null);
  const finalTranscriptRef = useRef("");
  const mediaRecorder = useRef(null);
  const audioChunks = useRef([]);
  const mediaStream = useRef(null);
  const chatEnd = useRef(null);

  // Chat history for multi-turn context
  const [chatHistory, setChatHistory] = useState([]);

  // Feature 1: Battery
  const [batteryLevel, setBatteryLevel] = useState(100);
  useEffect(() => {
    if ('getBattery' in navigator) {
      navigator.getBattery().then(battery => {
        setBatteryLevel(Math.round(battery.level * 100));
        battery.onlevelchange = () => setBatteryLevel(Math.round(battery.level * 100));
      });
    }
  }, []);

  // Feature 2: Language
  const [lang, setLang] = useState("english");
  const speechLang = {
    english: "en-IN",
    hindi: "hi-IN",
    marathi: "mr-IN",
  }[lang] || "en-IN";

  const speakResponse = (text, language) => {
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = language === "marathi" ? "mr-IN" : language === "hindi" ? "hi-IN" : "en-IN";
    utter.rate = 0.85;
    utter.volume = 1.0;
    window.speechSynthesis.speak(utter);
  };

  // Feature 3: Beacon
  const [beaconActive, setBeaconActive] = useState(false);
  const [beaconCtx, setBeaconCtx] = useState(null);
  const [beaconOsc, setBeaconOsc] = useState(null);

  const startBeacon = () => {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.value = 2750; osc.type = 'sine'; gain.gain.value = 1.0; osc.start();
    let on = true;
    const interval = setInterval(() => { gain.gain.value = on ? 1.0 : 0.0; on = !on; }, 600);
    setBeaconCtx({ ctx, interval }); setBeaconOsc(osc); setBeaconActive(true);
  };
  const stopBeacon = () => {
    if (beaconCtx) { clearInterval(beaconCtx.interval); beaconCtx.ctx.close(); }
    if (beaconOsc) { try { beaconOsc.stop(); } catch (e) {} }
    setBeaconActive(false); setBeaconCtx(null); setBeaconOsc(null);
  };

  // Feature 4: Offline
  const [networkError, setNetworkError] = useState(false);
  const [lastTriageLevel, setLastTriageLevel] = useState(null);
  const [userLat, setUserLat] = useState(18.5204);
  const [userLon, setUserLon] = useState(73.8567);

  const sendEmergencySMS = () => {
    const payload = `AURORA|${userLat},${userLon}|${lastTriageLevel || 'UNK'}|NEED_HELP`;
    window.location.href = `sms:112?body=${encodeURIComponent(payload)}`;
  };

  // Auto-scroll
  useEffect(() => {
    chatEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamedText]);

  useEffect(() => {
    setSpeechSupported(Boolean(navigator.mediaDevices?.getUserMedia && window.MediaRecorder));

    return () => {
      recognitionRef.current?.abort();
      recognitionRef.current = null;
      mediaStream.current?.getTracks().forEach(track => track.stop());
    };
  }, []);

  // ── Streaming SOS ──
  const sendMessage = async (text = null) => {
    const userMsg = text || input.trim();
    if (!userMsg || sending) return;
    if (!text) setInput("");

    setMessages(prev => [...prev, { role: "user", content: userMsg }]);
    setSending(true);
    setStreamedText("");
    setNetworkError(false);

    const lat = 18.5204 + (Math.random() - 0.5) * 0.01;
    const lon = 73.8567 + (Math.random() - 0.5) * 0.01;
    setUserLat(lat); setUserLon(lon);

    try {
      const response = await fetch(`${API_BASE}/api/citizen/sos/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          message: userMsg, lat, lon,
          battery: batteryLevel, lang,
          history: chatHistory,
        }),
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";
      let incidentId = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        const lines = text.split('\n');

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6));

            if (data.type === 'id') {
              incidentId = data.id;
            } else if (data.type === 'chunk') {
              accumulated += data.text.replace(/\\n/g, '\n');
              setStreamedText(accumulated);
            } else if (data.type === 'done') {
              setLastTriageLevel(data.triage);
              // Finalize: move streamed text to messages
              setMessages(prev => [...prev, {
                role: "ai", content: accumulated, lang, incidentId: data.id,
              }]);
              setStreamedText("");
              setChatHistory(prev => [
                ...prev,
                { role: 'user', text: userMsg },
                { role: 'aurora', text: accumulated },
              ]);
              speakResponse(accumulated, lang);
              setSending(false);
            } else if (data.type === 'error') {
              setMessages(prev => [...prev, {
                role: "ai", content: data.message, lang,
              }]);
              setStreamedText("");
              setSending(false);
            }
          } catch (e) { /* skip malformed SSE lines */ }
        }
      }

      // Safety: if stream ended without 'done' event
      if (sending) {
        if (accumulated) {
          setMessages(prev => [...prev, { role: "ai", content: accumulated, lang }]);
          setStreamedText("");
        }
        setSending(false);
      }
    } catch (err) {
      setNetworkError(true);
      setMessages(prev => [...prev, {
        role: "ai", content: "Network error. Use the Emergency SMS button below.",
      }]);
      setStreamedText("");
      setSending(false);
    }
  };

  const transcribeRecordedAudio = async (audioBlob) => {
    setTranscribingVoice(true);
    setVoiceError("");

    try {
      const base64Audio = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(audioBlob);
      });

      const response = await fetch(`${API_BASE}/api/citizen/transcribe`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "Authorization": `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          audio_b64: base64Audio,
          lat: userLat,
          lon: userLon,
        }),
      });

      if (!response.ok) throw new Error("Transcription failed");

      const data = await response.json();
      const transcript = data.transcription?.trim();
      if (!transcript) throw new Error("Empty transcription");

      setInput("");
      sendMessage(transcript);
    } catch (e) {
      setVoiceError("Voice transcription is unavailable. Please type your SOS.");
    } finally {
      setTranscribingVoice(false);
      mediaRecorder.current = null;
      audioChunks.current = [];
      mediaStream.current?.getTracks().forEach(track => track.stop());
      mediaStream.current = null;
    }
  };

  const startMediaRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setSpeechSupported(false);
      setVoiceError("Voice input is not available in this browser. Type your SOS instead.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const options = MediaRecorder.isTypeSupported("audio/webm") ? { mimeType: "audio/webm" } : undefined;
      const recorder = new MediaRecorder(stream, options);
      mediaStream.current = stream;
      mediaRecorder.current = recorder;
      audioChunks.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunks.current.push(event.data);
      };

      recorder.onstop = () => {
        setRecording(false);
        const audioBlob = new Blob(audioChunks.current, { type: recorder.mimeType || "audio/webm" });
        transcribeRecordedAudio(audioBlob);
      };

      recorder.start();
      setRecording(true);
      setVoiceError("");
    } catch (e) {
      setRecording(false);
      setVoiceError("Microphone permission was blocked. Allow microphone access or type your SOS.");
    }
  };

  // Voice-to-text
  const startRecording = () => {
    if (sending || recording) return;
    startMediaRecording();
  };

  const stopRecording = () => {
    if (recognitionRef.current && recording) {
      recognitionRef.current.stop();
      return;
    }

    if (mediaRecorder.current && mediaRecorder.current.state === "recording") {
      mediaRecorder.current.stop();
    }
  };

  return (
    <div className="citizen-app glass-card" style={{ maxWidth: 800, margin: "0 auto" }}>
      <header className="citizen-header">
        <h2 className="gradient-text">Citizen SOS Portal</h2>
      </header>

      {/* Battery Warning */}
      {batteryLevel < 20 && (
        <div style={{ background: '#7f1d1d', color: '#fca5a5', padding: '8px 16px', borderRadius: '8px', marginBottom: '12px', fontSize: '13px' }}>
          ⚡ LOW BATTERY MODE — Gemma giving ultra-short survival instructions
        </div>
      )}

      {/* Language Toggle */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
        {["english", "hindi", "marathi"].map(l => (
          <button key={l} onClick={() => setLang(l)} style={{
            padding: '4px 12px', borderRadius: '20px', fontSize: '12px', cursor: 'pointer',
            background: lang === l ? '#7c3aed' : '#374151', color: 'white', border: 'none',
          }}>
            {l === "english" ? "EN" : l === "hindi" ? "हिंदी" : "मराठी"}
          </button>
        ))}
      </div>

      <div className="citizen-grid">
        <div className="chat-section">
          <div className="chat-messages">
            {messages.map((msg, i) => (
              <div key={i} className={`chat-bubble ${msg.role === "user" ? "user" : "ai"}`}>
                {msg.content}
                {msg.role === "ai" && msg.content.length > 10 && (
                  <button onClick={() => speakResponse(msg.content, msg.lang || lang)}
                    style={{ marginLeft: '8px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', verticalAlign: 'middle' }}
                    title="Replay audio">🔊</button>
                )}
              </div>
            ))}

            {/* Streaming bubble — shows text appearing in real-time */}
            {streamedText && (
              <div className="chat-bubble ai" style={{ borderLeft: '3px solid #7c3aed' }}>
                {streamedText}
                <span style={{
                  display: 'inline-block', width: '2px', height: '16px',
                  background: '#7c3aed', marginLeft: '2px', verticalAlign: 'text-bottom',
                  animation: 'blink 0.8s infinite',
                }} />
              </div>
            )}

            {/* Waiting indicator before first chunk */}
            {sending && !streamedText && (
              <div className="chat-bubble ai" style={{ color: '#9ca3af' }}>
                <span style={{ animation: 'pulse 1.5s infinite' }}>AURORA connecting...</span>
              </div>
            )}

            <div ref={chatEnd} />
          </div>

          <div className="chat-input-bar">
            <button
              type="button"
              className={`voice-btn ${recording ? 'recording' : ''}`}
              onPointerDown={startRecording}
              onPointerUp={stopRecording}
              onPointerCancel={stopRecording}
              onPointerLeave={stopRecording}
              disabled={sending || transcribingVoice || !speechSupported}
              title={speechSupported ? "Hold to speak" : "Speech recognition unavailable"}
              aria-label={recording ? "Listening to emergency message" : "Hold to speak emergency message"}
            >{recording ? "■" : "🎤"}</button>
            <input className="chat-input" placeholder={recording ? "Listening..." : "Type your emergency here..."}
              value={input} onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            />
            <button className="btn btn-danger" onClick={() => sendMessage()} disabled={sending}>
              {sending ? "..." : "SEND SOS"}
            </button>
          </div>

          {(recording || transcribingVoice || interimTranscript || voiceError) && (
            <div className={`voice-status ${voiceError ? "error" : ""}`}>
              {voiceError || (transcribingVoice ? "Transcribing voice..." : interimTranscript ? `Hearing: ${interimTranscript}` : "Listening. Release to send.")}
            </div>
          )}

          {/* Offline SMS */}
          {networkError && (
            <div style={{ background: '#78350f', borderRadius: '10px', padding: '12px', marginTop: '12px' }}>
              <p style={{ color: '#fde68a', fontSize: '13px', marginBottom: '8px' }}>
                ⚠️ No internet connection detected.
              </p>
              <button onClick={sendEmergencySMS} style={{
                width: '100%', padding: '12px', background: '#d97706', color: 'white',
                border: 'none', borderRadius: '8px', fontSize: '15px', fontWeight: 'bold', cursor: 'pointer',
              }}>
                📱 Send Emergency SMS (Works Offline)
              </button>
            </div>
          )}
        </div>

        <aside className="citizen-info">
          {/* Beacon */}
          <div className="info-box" style={{ marginBottom: '12px' }}>
            <h3>Rescue Beacon</h3>
            <button onClick={beaconActive ? stopBeacon : startBeacon} style={{
              width: '100%', padding: '14px',
              background: beaconActive ? '#dc2626' : '#1d4ed8',
              color: 'white', border: 'none', borderRadius: '10px',
              fontSize: '16px', fontWeight: 'bold', cursor: 'pointer',
              animation: beaconActive ? 'pulse 1s infinite' : 'none',
            }}>
              {beaconActive ? '🔴 BEACON ACTIVE — Tap to Stop' : '🔔 Activate Rescue Beacon (Audio Signal)'}
            </button>
            {beaconActive && (
              <p style={{ color: '#fca5a5', textAlign: 'center', fontSize: '13px', marginTop: '6px' }}>
                High-frequency signal active. Rescue teams can detect you.
              </p>
            )}
          </div>

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

      {/* Blink cursor animation */}
      <style>{`
        @keyframes blink {
          0%, 50% { opacity: 1; }
          51%, 100% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}
