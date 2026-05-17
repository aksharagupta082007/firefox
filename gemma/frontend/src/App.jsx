import { useState, useCallback, useEffect } from "react";
import "./index.css";
import DemoSimulator from "./pages/DemoSimulator";
import ResponderDashboard from "./pages/ResponderDashboard";
import ResponderSOS from "./pages/ResponderSOS";
import CitizenApp from "./pages/CitizenApp";
import LoginPage from "./pages/LoginPage";
import SignUpPage from "./pages/SignUpPage";
import CommandCenter from "./pages/CommandCenter";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import SeismicWave from "./components/SeismicWave";

export default function App() {
  const [user, setUser] = useState(null);
  const [page, setPage] = useState("demo");
  const [isAlert, setIsAlert] = useState(false);
  const [latestResult, setLatestResult] = useState(null);
  const [heroSlidUp, setHeroSlidUp] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 50, y: 50 });

  // Persistence
  useEffect(() => {
    const savedUser = localStorage.getItem("aurora_user");
    if (savedUser) {
      setUser(JSON.parse(savedUser));
    }
  }, []);

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
    const timer = setTimeout(() => setHeroSlidUp(true), 1500);
    return () => clearTimeout(timer);
  }, []);

  const handleLogin = (userData) => {
    setUser(userData);
    if (userData.role === 'admin') setPage("admin");
    else if (userData.role === 'responder') setPage("responder");
    else setPage("citizen");
  };

  const handleLogout = () => {
    localStorage.removeItem("aurora_token");
    localStorage.removeItem("aurora_user");
    setUser(null);
    setPage("login");
  };

  // RBAC Navigation Logic
  const getNavItems = () => {
    const items = [
      { id: "demo", label: "Demo Simulator" },
    ];
    
    if (user) {
      if (user.role === 'admin') items.push({ id: "admin", label: "Command Center" });
      if (user.role === 'responder') {
        items.push({ id: "responder", label: "Deployments" });
        items.push({ id: "responder_sos", label: "Tactical SOS" });
      }
      if (user.role === 'citizen') items.push({ id: "citizen", label: "SOS Portal" });
      items.push({ id: "logout", label: "Logout", action: handleLogout });
    } else {
      items.push({ id: "login", label: "Login" });
      items.push({ id: "signup", label: "Sign Up" });
    }
    return items;
  };

  return (
    <div 
      className={`app-layout ${page === "citizen" ? "citizen-mode" : ""}`}
      style={{ '--mouse-x': `${mousePos.x}%`, '--mouse-y': `${mousePos.y}%` }}
    >
      <div className="spotlight-overlay" />
      
      <Navbar 
        page={page} 
        setPage={(p) => {
          const item = getNavItems().find(i => i.id === p);
          if (item?.action) item.action();
          else setPage(p);
        }} 
        isAlert={isAlert} 
        navItems={getNavItems()} 
      />

      <main className="main-content">
        <section className="hero-section">
          <div className="hero-content">
            <div className="hero-title-group">
              <h1 className="hero-aurora">AURORA</h1>
              <h1 className="hero-tech">TECH</h1>
            </div>
            <p className="hero-desc">
              Building the future of autonomous disaster intelligence. Real-time coordination, AI-native triage, and mission-critical deployment in the palm of your hand.
            </p>
          </div>
          <div className={`hero-wave-container ${heroSlidUp ? "visible" : ""}`}>
            <SeismicWave height={250} magnitude={7.2} intensity={1.2} speed={0.003} />
          </div>
        </section>

        <section id="app-section" className="app-section">
          {page === "demo" && <DemoSimulator onSimulationComplete={(data) => { setLatestResult(data); setPage("admin"); }} />}
          {page === "admin" && user?.role === 'admin' && <CommandCenter />}
          {page === "responder" && user?.role === 'responder' && <ResponderDashboard pipelineResult={latestResult} />}
          {page === "responder_sos" && user?.role === 'responder' && <ResponderSOS />}
          {page === "citizen" && <CitizenApp />}
          {page === "login" && <LoginPage onLogin={handleLogin} setPage={setPage} />}
          {page === "signup" && <SignUpPage setPage={setPage} />}
        </section>
        <Footer />
      </main>
    </div>
  );
}
