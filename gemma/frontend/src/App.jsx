import { useState, useCallback, useEffect } from "react";
import "./index.css";
import DemoSimulator from "./pages/DemoSimulator";
import ResponderDashboard from "./pages/ResponderDashboard";
import CitizenApp from "./pages/CitizenApp";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import SeismicWave from "./components/SeismicWave";

const NAV_ITEMS = [
  { id: "demo", label: "Demo Simulator" },
  { id: "responder", label: "Command Center" },
  { id: "citizen", label: "Citizen Mode" }
];

export default function App() {
  const [page, setPage] = useState("demo");
  const [isAlert, setIsAlert] = useState(false);
  const [latestResult, setLatestResult] = useState(null);
  const [heroSlidUp, setHeroSlidUp] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 50, y: 50 });

  useEffect(() => {
    const handleMouseMove = (e) => {
      const x = (e.clientX / window.innerWidth) * 100;
      const y = (e.clientY / window.innerHeight) * 100;
      setMousePos({ x, y });
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  useEffect(() => {
    // Start the hero animation slightly after page load
    const timer = setTimeout(() => setHeroSlidUp(true), 1500);
    return () => clearTimeout(timer);
  }, []);

  const handleSimulationComplete = useCallback((data) => {
    setLatestResult(data);
    setPage("responder");
    const status = data?.layers?.["4_verification"]?.decision?.status;
    setIsAlert(status === "CRITICAL" || status === "EMERGENCY");
    document.getElementById('app-section')?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  return (
    <div 
      className={`app-layout ${page === "citizen" ? "citizen-mode" : ""}`}
      style={{ '--mouse-x': `${mousePos.x}%`, '--mouse-y': `${mousePos.y}%` }}
    >
      {/* The spotlight overlay is rendered here, below main content (z-index wise) */}
      <div className="spotlight-overlay" />
      
      <Navbar 
        page={page} 
        setPage={setPage} 
        isAlert={isAlert} 
        navItems={NAV_ITEMS} 
      />

      <main className="main-content">
        {/* Landing Hero Section */}
        <section className="hero-section">
          <div className="hero-content">
            <div className="hero-layout">
              <div className="hero-aurora-wrapper">
                <h1 className="hero-aurora">AURORA</h1>
              </div>
              <div className="hero-text-content">
                <h1 className="hero-tech">TECH</h1>
                <p className="hero-desc">
                  In the critical window after an earthquake, every second counts. AURORA TECH is an AI-powered global resilience system that transforms a network of ordinary smartphones into a sophisticated seismic grid. By orchestrating an 11-layer autonomous pipeline, we bridge the gap between detection and rescue—delivering tactical dispatch briefs and safe-route planning in under 30 seconds.
                </p>
              </div>
            </div>
          </div>
          
          {/* Seismic Wave Component */}
          <div className={`hero-wave-container ${heroSlidUp ? "visible" : ""}`}>
            <SeismicWave height={250} magnitude={7.2} intensity={1.2} speed={0.003} />
          </div>
        </section>

        {/* Application Components Section */}
        <section id="app-section" className="app-section">
          <div style={{ display: page === "demo" ? "block" : "none" }}>
            <DemoSimulator onSimulationComplete={handleSimulationComplete} />
          </div>
          <div style={{ display: page === "responder" ? "block" : "none" }}>
            <ResponderDashboard
              pipelineResult={latestResult}
              onGoToSimulator={() => setPage("demo")}
            />
          </div>
          <div style={{ display: page === "citizen" ? "block" : "none" }}>
            <button
              className="btn btn-outline"
              style={{ marginBottom: 16 }}
              onClick={() => setPage("demo")}
            >
              ← Back to Dashboard
            </button>
            <CitizenApp />
          </div>
        </section>
        <Footer />
      </main>
    </div>
  );
}
