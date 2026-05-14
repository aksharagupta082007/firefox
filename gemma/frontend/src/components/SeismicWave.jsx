import { useEffect, useRef, useCallback } from "react";

// ─── Math core ────────────────────────────────────────────────────────────────

function periodicEnv(t, period = 1.4, attack = 0.12, decay = 0.3) {
  const phase = ((t % period) + period) % period;
  if (phase < attack) return phase / attack;
  return Math.exp(-((phase - attack) / decay));
}

function seismicWave(t, magnitude = 6.5, intensity = 1) {
  const scale = Math.pow(10, magnitude - 5) * intensity;
  const pw = 0.30 * periodicEnv(t,        1.4, 0.12, 0.30) * Math.sin(2 * Math.PI * 8   * t);
  const sw = 1.00 * periodicEnv(t - 0.28, 1.4, 0.15, 0.45) * Math.sin(2 * Math.PI * 4   * t + 0.3);
  const ww = 0.65 * periodicEnv(t - 0.60, 1.4, 0.20, 0.60) * Math.sin(2 * Math.PI * 1.5 * t + 0.8);
  return scale * (pw + sw + ww);
}

function seismicLayer(t, magnitude, intensity, layer) {
  const scale = Math.pow(10, magnitude - 5) * intensity;
  if (layer === "p") return scale * 0.30 * periodicEnv(t,        1.4, 0.12, 0.30) * Math.sin(2 * Math.PI * 8   * t);
  if (layer === "s") return scale * 1.00 * periodicEnv(t - 0.28, 1.4, 0.15, 0.45) * Math.sin(2 * Math.PI * 4   * t + 0.3);
  if (layer === "w") return scale * 0.65 * periodicEnv(t - 0.60, 1.4, 0.20, 0.60) * Math.sin(2 * Math.PI * 1.5 * t + 0.8);
  return 0;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SeismicWave({
  magnitude = 6.5,
  intensity  = 1,
  speed      = 0.004,
  height     = 200,
  className  = "",
  style      = {},
}) {
  const canvasRef  = useRef(null);
  const offsetRef  = useRef(0);
  const rafRef     = useRef(null);
  // flatRef.current = current lerp value (0 = full wave, 1 = flat)
  // flatRef._target = destination (set by hover handlers)
  const flatRef    = useRef(0);
  const paramsRef  = useRef({ magnitude, intensity, speed });

  useEffect(() => {
    paramsRef.current = { magnitude, intensity, speed };
  }, [magnitude, intensity, speed]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const W   = canvas.offsetWidth;
    const H   = canvas.offsetHeight;

    if (canvas.width !== W * dpr || canvas.height !== H * dpr) {
      canvas.width  = W * dpr;
      canvas.height = H * dpr;
    }

    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const { magnitude: mag, intensity: int } = paramsRef.current;
    const flatten = flatRef.current;   // 0–1
    const N       = 500;
    const tWindow = 1.4;
    const cy      = H / 2;
    const offset  = offsetRef.current;

    // ── Sample ────────────────────────────────────────────────────────────────
    const total = new Float32Array(N + 1);
    const pArr  = new Float32Array(N + 1);
    const sArr  = new Float32Array(N + 1);
    const wArr  = new Float32Array(N + 1);
    let maxAbs  = 0;

    for (let i = 0; i <= N; i++) {
      const t  = (i / N) * tWindow + offset;
      total[i] = seismicWave(t, mag, int);
      pArr[i]  = seismicLayer(t, mag, int, "p");
      sArr[i]  = seismicLayer(t, mag, int, "s");
      wArr[i]  = seismicLayer(t, mag, int, "w");
      if (Math.abs(total[i]) > maxAbs) maxAbs = Math.abs(total[i]);
    }
    if (maxAbs < 1e-9) maxAbs = 1;

    // Amplitude scale lerps to 0 as flatten → 1 (collapses wave to baseline)
    const sy = ((H * 0.40) / maxAbs) * (1 - flatten);

    // ── Baseline ──────────────────────────────────────────────────────────────
    // ctx.strokeStyle = `rgba(26,45,85,${0.6 + flatten * 0.4})`;
    // ctx.lineWidth   = 1 + flatten * 0.5;
    // ctx.beginPath();
    // ctx.moveTo(0, cy);
    // ctx.lineTo(W, cy);
    // ctx.stroke();

    // ── Draw helper ───────────────────────────────────────────────────────────
    function drawLine(arr, color, alpha, lw) {
      if (alpha <= 0) return;
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.globalAlpha = alpha;
      ctx.lineWidth   = lw;
      ctx.lineJoin    = "round";
      ctx.lineCap     = "round";
      for (let i = 0; i <= N; i++) {
        const x = (i / N) * W;
        const y = cy - arr[i] * sy;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Layer sub-waves fade out as flatten increases
    const layerAlpha = 0.40 * (1 - flatten);
    drawLine(pArr,  "#222222ff", layerAlpha, 1.2);
    drawLine(sArr,  "#606060ff", layerAlpha, 1.2);
    drawLine(wArr,  "#717171ff", layerAlpha, 1.2);

    // Composite glow — halo collapses faster, sharp edge fades gently
    drawLine(total, "#000000ff", 0.12 * (1 - flatten),        10);
    drawLine(total, "#000000ff", 0.30 * (1 - flatten * 0.8),  3.5);
    drawLine(total, "#e8f7ff", 0.92 * (1 - flatten * 0.15), 1.5);

    // Leading-edge dot — shrinks away when flat
    const dotR = 3.5 * (1 - flatten);
    if (dotR > 0.2) {
      const lastY = cy - total[N] * sy;
      ctx.beginPath();
      ctx.arc(W - 2, lastY, dotR, 0, Math.PI * 2);
      ctx.fillStyle   = "#fff";
      ctx.globalAlpha = 0.9;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }, []);

  // ── Animation loop ────────────────────────────────────────────────────────
  useEffect(() => {
    const EASE = 0.02; // lerp speed — lower = slower / smoother transition

    function loop() {
      offsetRef.current += paramsRef.current.speed;

      // Smooth lerp toward hover target
      const target = flatRef._target ?? 0;
      const curr   = flatRef.current;
      const diff   = target - curr;
      flatRef.current = Math.abs(diff) > 0.0005 ? curr + diff * EASE : target;

      draw();
      rafRef.current = requestAnimationFrame(loop);
    }

    flatRef._target = 0;
    rafRef.current  = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [draw]);

  // ── Resize observer ───────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => draw());
    ro.observe(canvas.parentElement);
    return () => ro.disconnect();
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      onMouseEnter={() => { flatRef._target = 1; }}
      onMouseLeave={() => { flatRef._target = 0; }}
      style={{
        display: "block",
        width: "100%",
        height,
        background: "transparent",
        cursor: "crosshair",
        ...style,
      }}
    />
  );
}