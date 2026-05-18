import { useState, useRef, useEffect } from "react";

const API_BASE = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:8000`;

export default function ResponderSOS() {
  const token = localStorage.getItem("aurora_token");

  const renderFormattedContent = (text) => {
    if (!text) return null;
    const lines = text.split("\n");
    return lines.map((line, lineIdx) => {
      const parts = line.split("**");
      const formattedLine = parts.map((part, partIdx) => {
        if (partIdx % 2 === 1) {
          return <strong key={partIdx} style={{ color: '#ea580c', fontWeight: 'bold' }}>{part}</strong>;
        }
        return part;
      });

      return (
        <div key={lineIdx} style={{ minHeight: '1.2em' }}>
          {formattedLine}
        </div>
      );
    });
  };

  const [messages, setMessages] = useState([
    { role: "ai", content: "AURORA CRPF Tactical Command Online. System ready for sector reporting and triage queries." }
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [streamedText, setStreamedText] = useState("");
  const [recording, setRecording] = useState(false);
  const mediaRecorder = useRef(null);
  const audioChunks = useRef([]);
  const chatEnd = useRef(null);

  // Chat history for multi-turn context
  const [chatHistory, setChatHistory] = useState([]);

  // Feature 1: Tactical Stats & Battery
  const [batteryLevel, setBatteryLevel] = useState(100);
  useEffect(() => {
    if ('getBattery' in navigator) {
      navigator.getBattery().then(battery => {
        setBatteryLevel(Math.round(battery.level * 100));
        battery.onlevelchange = () => setBatteryLevel(Math.round(battery.level * 100));
      });
    }
  }, []);

  // Feature 2: Tactical Radio (TTS)
  const [radioMuted, setRadioMuted] = useState(false);
  const speakResponse = (text) => {
    if (radioMuted) return;
    window.speechSynthesis.cancel();
    // Strip markdown bold markers and clean up text for speech
    const cleanText = text.replace(/\*\*|#/g, "");
    const utter = new SpeechSynthesisUtterance(cleanText);
    utter.lang = "en-IN";
    utter.rate = 1.0; // Crisper, faster military briefing pace
    utter.volume = 1.0;
    window.speechSynthesis.speak(utter);
  };

  // Feature 3: Tactical Strobe/Beacon (High-frequency visual beacon for rescue rendezvous)
  const [strobeActive, setStrobeActive] = useState(false);
  const [strobeColor, setStrobeColor] = useState("#ea580c");
  useEffect(() => {
    let interval;
    if (strobeActive) {
      interval = setInterval(() => {
        setStrobeColor(prev => prev === "#ea580c" ? "#111827" : "#ea580c");
      }, 250);
    } else {
      setStrobeColor("#111827");
    }
    return () => clearInterval(interval);
  }, [strobeActive]);

  // Feature 4: GPS and Offline Messaging
  const [networkError, setNetworkError] = useState(false);
  const [lastTriageLevel, setLastTriageLevel] = useState(null);
  const [userLat, setUserLat] = useState(18.5204);
  const [userLon, setUserLon] = useState(73.8567);

  // CRPF resources assignment (per requirements - total resources configured by model first)
  const [resources, setResources] = useState({
    ndrf: { total: 15, deployed: 4 },
    tenders: { total: 8, deployed: 2 },
    ambulances: { total: 24, deployed: 6 },
    crpf_teams: { total: 10, deployed: 3 }
  });

  const sendEmergencySMS = () => {
    const payload = `CRPF_TACTICAL|${userLat.toFixed(4)},${userLon.toFixed(4)}|${lastTriageLevel || 'UNK'}|CRITICAL_SECTOR_SUPPORT`;
    window.location.href = `sms:112?body=${encodeURIComponent(payload)}`;
  };

  // Auto-scroll
  useEffect(() => {
    chatEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamedText]);

  // ── Streaming Tactical SOS ──
  const sendMessage = async (text = null) => {
    const userMsg = text || input.trim();
    if (!userMsg || sending) return;
    if (!text) setInput("");

    setMessages(prev => [...prev, { role: "user", content: userMsg }]);
    setSending(true);
    setStreamedText("");
    setNetworkError(false);

    // Dynamic slightly shifted coordinates to simulate current field report location
    const lat = 18.5204 + (Math.random() - 0.5) * 0.01;
    const lon = 73.8567 + (Math.random() - 0.5) * 0.01;
    setUserLat(lat); setUserLon(lon);

    try {
      const response = await fetch(`${API_BASE}/api/responder/sos/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          message: userMsg, lat, lon,
          battery: batteryLevel, lang: "english",
          history: chatHistory,
        }),
      });

      if (response.status === 403 || response.status === 401) {
        setMessages(prev => [...prev, {
          role: "ai", content: "ACCESS DENIED: Insufficient credentials. CRPF tactical system requires active Responder/Admin authentication."
        }]);
        setSending(false);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunkText = decoder.decode(value, { stream: true });
        const lines = chunkText.split('\n');

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6));

            if (data.type === 'chunk') {
              accumulated += data.text.replace(/\\n/g, '\n');
              setStreamedText(accumulated);
            } else if (data.type === 'done') {
              setLastTriageLevel(data.triage);
              
              // Increment deployed resource randomly to simulate active dispatch based on triage result
              if (data.triage === 'CRITICAL' || data.triage === 'HIGH') {
                setResources(prev => ({
                  ...prev,
                  ndrf: { ...prev.ndrf, deployed: Math.min(prev.ndrf.total, prev.ndrf.deployed + 1) },
                  ambulances: { ...prev.ambulances, deployed: Math.min(prev.ambulances.total, prev.ambulances.deployed + 1) }
                }));
              }

              // Finalize: move streamed text to messages
              setMessages(prev => [...prev, {
                role: "ai", content: accumulated, incidentId: data.id,
              }]);
              setStreamedText("");
              setChatHistory(prev => [
                ...prev,
                { role: 'user', text: userMsg },
                { role: 'aurora', text: accumulated },
              ]);
              speakResponse(accumulated);
              setSending(false);
            } else if (data.type === 'error') {
              setMessages(prev => [...prev, {
                role: "ai", content: data.message
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
          setMessages(prev => [...prev, { role: "ai", content: accumulated }]);
          setStreamedText("");
        }
        setSending(false);
      }
    } catch (err) {
      setNetworkError(true);
      setMessages(prev => [...prev, {
        role: "ai", content: "Connection severed. Deploy secondary offline satellite systems or execute satellite SMS dispatch.",
      }]);
      setStreamedText("");
      setSending(false);
    }
  };

  // ── Voice Recording ──
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder.current = new MediaRecorder(stream);
      audioChunks.current = [];
      mediaRecorder.current.ondataavailable = (e) => audioChunks.current.push(e.data);
      mediaRecorder.current.onstop = () => {
        const audioBlob = new Blob(audioChunks.current, { type: 'audio/wav' });
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = () => {
          const base64Audio = reader.result.split(',')[1];
          sendMessage(`[Radio Audio Report Summary base64 hash]: ${base64Audio.substring(0, 50)}...`);
        };
      };
      mediaRecorder.current.start();
      setRecording(true);
    } catch (e) { console.error("Radio access denied:", e); }
  };
  
  const stopRecording = () => {
    if (mediaRecorder.current) { mediaRecorder.current.stop(); setRecording(false); }
  };

  const getTriageColor = (level) => {
    if (level === 'CRITICAL') return '#e85002';
    if (level === 'HIGH') return '#ea580c';
    if (level === 'MODERATE') return '#ca8a04';
    return '#16a34a';
  };

  return (
    <div className="citizen-app glass-card tactical-portal" style={{ maxWidth: '100%', margin: "0 auto", border: '1px solid rgba(255, 255, 255, 0.06)' }}>
      <header className="citizen-header" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h2 className="gradient-text dashboard-title" style={{ margin: 0 }}>
            CRPF Tactical SOS Portal
          </h2>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button 
            onClick={() => setRadioMuted(!radioMuted)}
            style={{
              padding: '6px 14px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer',
              background: radioMuted ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.08)',
              color: radioMuted ? '#646464' : '#f1f5f9',
              border: '1px solid rgba(255,255,255,0.1)',
              fontFamily: 'Inter, sans-serif'
            }}
          >
            {radioMuted ? 'Radio Muted' : 'Radio Live'}
          </button>
          <div style={{
            background: 'rgba(255, 255, 255, 0.04)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            padding: '6px 14px', borderRadius: '6px', fontSize: '12px', fontFamily: 'Inter, sans-serif', color: '#a7a7a7'
          }}>
            Battery: {batteryLevel}%
          </div>
        </div>
      </header>

      {/* Low Battery Strobe Mode Alert */}
      {batteryLevel < 20 && (
        <div style={{ background: '#7f1d1d', color: '#fca5a5', padding: '10px 16px', borderRadius: '8px', marginBottom: '16px', fontSize: '13px', border: '1px solid #b91c1c' }}>
          CRPF SQUAD LOW BATTERY MODE — Minimizing transceiver energy output. Using compressed tactical parameters.
        </div>
      )}

      {/* ══ Chat — Full Width ══ */}
      <div style={{ background: 'rgba(0,0,0,0.15)', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', marginBottom: '28px' }}>
        
        <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <h3 style={{ margin: 0, fontSize: '13px', color: '#a7a7a7', fontFamily: 'Inter, sans-serif', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px' }}>CRPF Tactical Comms</h3>
        </div>
        <div className="chat-section" style={{ padding: '16px', display: 'flex', flexDirection: 'column', height: '480px' }}>
          <div className="chat-messages" style={{ flex: 1, overflowY: 'auto', paddingRight: '4px' }}>
            {messages.map((msg, i) => (
              <div key={i} className={`chat-bubble ${msg.role === "user" ? "user" : "ai"}`} style={{
                background: msg.role === 'user' ? 'rgba(234, 88, 12, 0.2)' : 'rgba(255, 255, 255, 0.02)',
                border: msg.role === 'user' ? '1px solid rgba(234, 88, 12, 0.4)' : '1px solid rgba(255,255,255,0.05)',
                color: msg.role === 'user' ? '#ff9b50' : '#f1f5f9',
                borderRadius: '10px',
                padding: '12px 16px',
                marginBottom: '14px',
                fontSize: '13.5px',
                lineHeight: '1.6',
                fontFamily: 'Inter, sans-serif',
                whiteSpace: 'pre-wrap'
              }}>
                {renderFormattedContent(msg.content)}
                {msg.role === "ai" && msg.content.length > 20 && (
                  <button onClick={() => speakResponse(msg.content)}
                    style={{ marginLeft: '12px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', padding: '3px 8px', cursor: 'pointer', fontSize: '11px', color: '#a7a7a7', verticalAlign: 'middle', fontFamily: 'Inter, sans-serif' }}
                    title="Replay Radio Dispatch">🔊 Broadcast</button>
                )}
              </div>
            ))}

            {/* Real-time SSE Stream */}
            {streamedText && (
              <div className="chat-bubble ai" style={{
                background: 'rgba(255, 255, 255, 0.02)',
                borderLeft: '4px solid #ea580c',
                borderTop: '1px solid rgba(255,255,255,0.05)',
                borderRight: '1px solid rgba(255,255,255,0.05)',
                borderBottom: '1px solid rgba(255,255,255,0.05)',
                color: '#f1f5f9',
                padding: '12px 16px',
                borderRadius: '10px',
                fontSize: '13.5px',
                lineHeight: '1.6',
                whiteSpace: 'pre-wrap'
              }}>
                {renderFormattedContent(streamedText)}
                <span style={{
                  display: 'inline-block', width: '3px', height: '16px',
                  background: '#ea580c', marginLeft: '3px', verticalAlign: 'text-bottom',
                  animation: 'blink 0.8s infinite',
                }} />
              </div>
            )}

            {/* Waiting indicator */}
            {sending && !streamedText && (
              <div className="chat-bubble ai" style={{ color: '#a78bfa', background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.02)', padding: '12px 16px', borderRadius: '10px' }}>
                <span style={{ animation: 'pulse 1.5s infinite', fontFamily: 'Inter, sans-serif', color: '#a7a7a7', fontSize: '12px' }}>📡 Calculating tactical blueprint...</span>
              </div>
            )}

            <div ref={chatEnd} />
          </div>

          <div className="chat-input-bar" style={{ marginTop: '12px', borderTop: '1px solid rgba(255, 255, 255, 0.05)', paddingTop: '12px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'nowrap' }}>
            <button
              className={`voice-btn ${recording ? 'recording' : ''}`}
              onMouseDown={startRecording} onMouseUp={stopRecording}
              onTouchStart={startRecording} onTouchEnd={stopRecording}
              style={{
                background: recording ? '#dc2626' : 'rgba(234, 88, 12, 0.1)',
                border: `1px solid ${recording ? '#dc2626' : 'rgba(234, 88, 12, 0.4)'}`,
                color: recording ? 'white' : '#ea580c',
                cursor: 'pointer',
                flexShrink: 0,
                width: '42px',
                height: '42px',
                borderRadius: '50%',
                fontSize: '18px',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              title="Hold to report over radio"
            >
              🎤
            </button>
            <input className="chat-input" placeholder="Report or request tactical route..."
              value={input} onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
              style={{ flex: 1, minWidth: 0, background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '8px', color: '#f1f5f9', padding: '11px 14px', outline: 'none', transition: 'border-color 0.2s', fontSize: '14px' }}
            />
            <button className="btn" onClick={() => sendMessage()} disabled={sending} style={{
              flexShrink: 0,
              background: 'rgba(255,255,255,0.08)',
              color: '#f1f5f9',
              padding: '11px 18px',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: '600',
              fontFamily: 'Inter, sans-serif',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}>
              {sending ? '...' : 'Send'}
            </button>
          </div>

          {/* Offline Fallback */}
          {networkError && (
            <div style={{ background: 'rgba(127, 29, 29, 0.2)', border: '1px solid rgba(185, 28, 28, 0.3)', borderRadius: '10px', padding: '12px', marginTop: '12px' }}>
              <p style={{ color: '#fca5a5', fontSize: '12px', marginBottom: '8px', fontFamily: 'Inter, sans-serif' }}>
                Network outage — primary link severed. Access satellite dispatch.
              </p>
              <button onClick={sendEmergencySMS} style={{
                width: '100%', padding: '12px', background: 'rgba(255,255,255,0.07)', color: '#f1f5f9',
                border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', fontFamily: 'Inter, sans-serif'
              }}>
                Generate Satellite SMS (Offline)
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ══ 2-Column Widgets ══ */}
      <div className="dash-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          {/* Threat Zone Status Widget */}
          <div className="info-box" style={{ background: 'rgba(10, 15, 29, 0.5)', border: '1px solid rgba(255,255,255,0.03)', borderRadius: '12px', padding: '16px' }}>
            <h3 style={{ fontSize: '13px', color: '#a7a7a7', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px', fontFamily: 'Inter, sans-serif', fontWeight: 600 }}>
               Current Sector Risk Status
            </h3>
            <div style={{
              background: lastTriageLevel ? getTriageColor(lastTriageLevel) : '#1f2937',
              borderRadius: '8px', padding: '16px', textAlign: 'center', transition: 'background 0.5s',
              boxShadow: lastTriageLevel ? `0 0 20px ${getTriageColor(lastTriageLevel)}44` : 'none'
            }}>
              <span style={{ color: 'white', fontWeight: '700', fontSize: '20px', letterSpacing: '1px', fontFamily: 'Inter, sans-serif' }}>
                {lastTriageLevel ? `${lastTriageLevel} ZONE` : 'SECTOR PENDING'}
              </span>
            </div>
            <p style={{ color: '#94a3b8', fontSize: '12px', marginTop: '10px', lineHeight: '1.5' }}>
              Sector boundaries classified dynamically based on structural damage thresholds, path obstruction parameters, and gas leak levels.
            </p>
          </div>

          {/* CRPF Resource Pool Dashboard */}
          <div className="info-box" style={{ background: 'rgba(10, 15, 29, 0.5)', border: '1px solid rgba(255,255,255,0.03)', borderRadius: '12px', padding: '16px' }}>
            <h3 style={{ fontSize: '13px', color: '#a7a7a7', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px', fontFamily: 'Inter, sans-serif', fontWeight: 600 }}>
               Operational Resources Pool
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              
              {[
                { key: 'ndrf', label: 'NDRF Extraction Teams', color: '#38bdf8' },
                { key: 'tenders', label: 'Heavy Rescue Tenders', color: '#fb7185' },
                { key: 'ambulances', label: 'ALS Ambulances (Medical)', color: '#4ade80' },
                { key: 'crpf_teams', label: 'CRPF QRT Squads', color: '#fbbf24' }
              ].map(res => {
                const item = resources[res.key];
                const pct = (item.deployed / item.total) * 100;
                return (
                  <div key={res.key} style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.04)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '6px', fontFamily: 'Inter, sans-serif' }}>
                      <span style={{ color: '#cbd5e1' }}>{res.label}</span>
                      <span style={{ color: res.color, fontWeight: 'bold' }}>{item.total - item.deployed} / {item.total} Free</span>
                    </div>
                    {/* Progress Bar */}
                    <div style={{ width: '100%', height: '6px', background: '#334155', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: res.color, borderRadius: '3px', transition: 'width 0.5s' }} />
                    </div>
                  </div>
                );
              })}

            </div>
          </div>

          {/* Tactical Visual Rendezvous Strobe */}
          <div className="info-box" style={{ background: 'rgba(10, 15, 29, 0.5)', border: '1px solid rgba(255,255,255,0.03)', borderRadius: '12px', padding: '16px' }}>
            <h3 style={{ fontSize: '13px', color: '#a7a7a7', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px', fontFamily: 'Inter, sans-serif', fontWeight: 600 }}>
               Rendezvous Tactical Strobe
            </h3>
            <button 
              onClick={() => setStrobeActive(!strobeActive)}
              style={{
                width: '100%', padding: '14px',
                background: strobeActive ? strobeColor : 'rgba(234, 88, 12, 0.1)',
                border: strobeActive ? 'none' : '1px solid rgba(234, 88, 12, 0.4)',
                color: strobeActive ? 'white' : '#ea580c',
                fontWeight: 'bold', fontSize: '13px', borderRadius: '8px', cursor: 'pointer',
                fontFamily: 'JetBrains Mono',
                transition: 'background 0.2s',
                boxShadow: strobeActive ? '0 0 15px #ea580c88' : 'none'
              }}
            >
              {strobeActive ? '  STROBE ACTIVE — TAP TO TERMINATE' : 'ACTIVATE HIGH-FREQUENCY rendezvous STROBE'}
            </button>
            <p style={{ color: '#94a3b8', fontSize: '12px', marginTop: '6px', lineHeight: '1.4', textAlign: 'center' }}>
              Emits high-intensity strobe pulses to facilitate airborne visual targeting by CRPF rescue helicopters and night vision teams.
            </p>
          </div>

          {/* Pune Sector III Ingress Checklist */}
          <div className="info-box" style={{ background: 'rgba(10, 15, 29, 0.5)', border: '1px solid rgba(255,255,255,0.03)', borderRadius: '12px', padding: '16px' }}>
            <h3 style={{ fontSize: '13px', color: '#a7a7a7', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px', fontFamily: 'Inter, sans-serif', fontWeight: 600 }}>
               Ingress Protocols Checklist
            </h3>
            <ul style={{ color: '#cbd5e1', fontSize: '12.5px', paddingLeft: '20px', lineHeight: '1.8' }}>
              <li>Configure radio frequency to 142.85 MHz primary.</li>
              <li>Affix high-visibility CRPF safety markers onto entry points.</li>
              <li>Establish structural shoring locks before debris clearing.</li>
              <li>Designate casualty assembly post 100 meters upwind.</li>
              <li>Carry mechanical jaws and secondary oxygen canisters.</li>
            </ul>
          </div>
        </div>

        {/* Right column: Strobe + Ingress */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* Tactical Visual Rendezvous Strobe */}
          <div className="info-box" style={{ background: 'rgba(10, 15, 29, 0.5)', border: '1px solid rgba(255,255,255,0.03)', borderRadius: '12px', padding: '16px' }}>
            <h3 style={{ fontSize: '13px', color: '#a7a7a7', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px', fontFamily: 'Inter, sans-serif', fontWeight: 600 }}>
               Rendezvous Strobe
            </h3>
            <button 
              onClick={() => setStrobeActive(!strobeActive)}
              style={{
                width: '100%', padding: '14px',
                background: strobeActive ? strobeColor : 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: strobeActive ? 'white' : '#f1f5f9',
                fontWeight: '600', fontSize: '13px', borderRadius: '8px', cursor: 'pointer',
                fontFamily: 'Inter, sans-serif',
                transition: 'background 0.2s',
              }}
            >
              {strobeActive ? 'Strobe Active — Tap to Stop' : 'Activate Rendezvous Strobe'}
            </button>
            <p style={{ color: '#646464', fontSize: '12px', marginTop: '8px', lineHeight: '1.5', textAlign: 'center' }}>
              Emits high-intensity strobe pulses for airborne targeting by CRPF helicopters.
            </p>
          </div>

          {/* Pune Sector III Ingress Checklist */}
          <div className="info-box" style={{ background: 'rgba(10, 15, 29, 0.5)', border: '1px solid rgba(255,255,255,0.03)', borderRadius: '12px', padding: '16px' }}>
            <h3 style={{ fontSize: '13px', color: '#a7a7a7', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px', fontFamily: 'Inter, sans-serif', fontWeight: 600 }}>
               Ingress Protocols Checklist
            </h3>
            <ul style={{ color: '#d1d5db', fontSize: '13px', paddingLeft: '20px', lineHeight: '2' }}>
              <li>Configure radio frequency to 142.85 MHz primary.</li>
              <li>Affix high-visibility CRPF safety markers onto entry points.</li>
              <li>Establish structural shoring locks before debris clearing.</li>
              <li>Designate casualty assembly post 100 meters upwind.</li>
              <li>Carry mechanical jaws and secondary oxygen canisters.</li>
            </ul>
          </div>
      </div>
      </div>

      {/* Blink cursor animation */}
      <style>{`
        @keyframes blink {
          0%, 50% { opacity: 1; }
          51%, 100% { opacity: 0; }
        }
        .tactical-portal .chat-bubble.user {
          border-bottom-right-radius: 2px !important;
          border-bottom-left-radius: 10px !important;
        }
        .tactical-portal .chat-bubble.ai {
          border-bottom-left-radius: 2px !important;
          border-bottom-right-radius: 10px !important;
        }
      `}</style>
    </div>
  );
}
