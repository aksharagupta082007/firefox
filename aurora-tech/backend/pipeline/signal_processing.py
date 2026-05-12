"""
Layer 3: Signal Processing
FFT analysis and feature extraction from raw XYZ accelerometer data.
Computes:
  - Rolling variance to detect sudden amplitude changes
  - FFT to identify dominant frequencies (seismic vs. non-seismic)
  - STA/LTA ratio (Short-Term Average / Long-Term Average) — classic seismology trigger
  - Per-reading anomaly score (0.0 to 1.0)
"""

import numpy as np
from typing import List, Dict, Any

# ─── Configuration ──────────────────────────────────────────────────────
SAMPLE_RATE_HZ = 10  # ~100ms polling → 10 samples/sec
STA_WINDOW = 10      # Short-term: 1 second of samples
LTA_WINDOW = 50      # Long-term: 5 seconds of samples
STA_LTA_THRESHOLD = 3.0   # Classic seismology trigger ratio
VARIANCE_THRESHOLD = 2.0  # m/s² variance to flag anomaly
DOMINANT_FREQ_MIN = 0.5   # Hz — seismic signals are typically 0.5–10 Hz
DOMINANT_FREQ_MAX = 10.0


def compute_magnitude(acc_x: float, acc_y: float, acc_z: float) -> float:
    """Compute acceleration magnitude from XYZ components."""
    return np.sqrt(acc_x**2 + acc_y**2 + acc_z**2)


def rolling_variance(magnitudes: np.ndarray, window: int = 10) -> np.ndarray:
    """
    Compute rolling variance over a sliding window.
    Returns array of same length (padded with 0 at start).
    """
    if len(magnitudes) < window:
        return np.var(magnitudes) * np.ones(len(magnitudes))

    result = np.zeros(len(magnitudes))
    for i in range(window, len(magnitudes)):
        result[i] = np.var(magnitudes[i - window:i])
    # Fill leading values
    result[:window] = result[window] if len(magnitudes) > window else 0.0
    return result


def compute_fft_features(magnitudes: np.ndarray, sample_rate: float = SAMPLE_RATE_HZ) -> Dict[str, float]:
    """
    Run FFT on magnitude signal and extract key features:
      - dominant_frequency: frequency with highest amplitude
      - spectral_energy: total energy in the seismic band (0.5–10 Hz)
      - peak_amplitude: maximum FFT amplitude
      - is_seismic_band: whether dominant freq falls in seismic range
    """
    n = len(magnitudes)
    if n < 4:
        return {
            "dominant_frequency": 0.0,
            "spectral_energy": 0.0,
            "peak_amplitude": 0.0,
            "is_seismic_band": False,
        }

    # Remove DC offset (mean)
    signal = magnitudes - np.mean(magnitudes)

    # Apply Hanning window to reduce spectral leakage
    window = np.hanning(n)
    signal = signal * window

    # FFT
    fft_vals = np.fft.rfft(signal)
    fft_mag = np.abs(fft_vals)
    freqs = np.fft.rfftfreq(n, d=1.0 / sample_rate)

    # Dominant frequency
    if len(fft_mag) > 1:
        dominant_idx = np.argmax(fft_mag[1:]) + 1  # skip DC
        dominant_freq = freqs[dominant_idx]
        peak_amplitude = fft_mag[dominant_idx]
    else:
        dominant_freq = 0.0
        peak_amplitude = 0.0

    # Spectral energy in seismic band
    seismic_mask = (freqs >= DOMINANT_FREQ_MIN) & (freqs <= DOMINANT_FREQ_MAX)
    spectral_energy = float(np.sum(fft_mag[seismic_mask] ** 2))

    is_seismic = DOMINANT_FREQ_MIN <= dominant_freq <= DOMINANT_FREQ_MAX

    return {
        "dominant_frequency": float(dominant_freq),
        "spectral_energy": spectral_energy,
        "peak_amplitude": float(peak_amplitude),
        "is_seismic_band": bool(is_seismic),
    }


def compute_sta_lta(magnitudes: np.ndarray) -> float:
    """
    Compute STA/LTA ratio — the classic seismic event trigger.
    Short-Term Average / Long-Term Average of signal energy.
    A ratio > 3.0 typically indicates a seismic event onset.
    """
    n = len(magnitudes)
    if n < LTA_WINDOW:
        return 0.0

    # Use the last LTA_WINDOW samples for LTA
    lta_signal = magnitudes[-LTA_WINDOW:]
    lta = np.mean(lta_signal ** 2)

    # Use the last STA_WINDOW samples for STA
    sta_signal = magnitudes[-STA_WINDOW:]
    sta = np.mean(sta_signal ** 2)

    if lta < 1e-9:
        return 0.0

    return float(sta / lta)


def compute_anomaly_score(
    variance: float,
    sta_lta_ratio: float,
    fft_features: Dict[str, float]
) -> float:
    """
    Compute a normalized anomaly score (0.0 to 1.0) from signal features.
    
    Components:
      - Variance component:  min(1.0, variance / VARIANCE_THRESHOLD) * 0.35
      - STA/LTA component:   min(1.0, ratio / STA_LTA_THRESHOLD) * 0.35
      - Spectral component:  0.30 if in seismic band with high energy, else scaled
    """
    # Variance contribution (0–1)
    var_score = min(1.0, variance / VARIANCE_THRESHOLD) if VARIANCE_THRESHOLD > 0 else 0.0

    # STA/LTA contribution (0–1)
    sta_score = min(1.0, sta_lta_ratio / (STA_LTA_THRESHOLD * 2))

    # Spectral contribution (0–1)
    if fft_features["is_seismic_band"] and fft_features["spectral_energy"] > 0:
        spec_score = min(1.0, fft_features["spectral_energy"] / 100.0)
    else:
        spec_score = 0.0

    anomaly = (0.35 * var_score) + (0.35 * sta_score) + (0.30 * spec_score)
    return max(0.0, min(1.0, anomaly))


def process_sensor_buffer(readings: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Full signal processing pipeline on a buffer of sensor readings.
    
    Args:
        readings: List of dicts with 'acc_x', 'acc_y', 'acc_z' keys.
    
    Returns:
        Dict with:
          - magnitudes: raw magnitude array
          - variance: latest rolling variance value
          - sta_lta_ratio: current STA/LTA ratio
          - fft_features: dict of FFT-derived features
          - anomaly_score: final 0–1 anomaly score
          - phone_anomaly: alias for anomaly_score (used in verification formula)
    """
    if not readings:
        return {
            "magnitudes": [],
            "variance": 0.0,
            "sta_lta_ratio": 0.0,
            "fft_features": {},
            "anomaly_score": 0.0,
            "phone_anomaly": 0.0,
        }

    # Compute magnitudes (prefer linear acceleration if available)
    mags_list = []
    for r in readings:
        # Check if linear acceleration is present and not None
        if r.get("lin_acc_x") is not None and r.get("lin_acc_y") is not None and r.get("lin_acc_z") is not None:
            mags_list.append(compute_magnitude(r["lin_acc_x"], r["lin_acc_y"], r["lin_acc_z"]))
        else:
            # Fallback to standard accelerometer (which includes gravity)
            mags_list.append(compute_magnitude(r.get("acc_x", 0), r.get("acc_y", 0), r.get("acc_z", 0)))
    
    mags = np.array(mags_list)

    # Rolling variance
    variances = rolling_variance(mags, window=STA_WINDOW)
    current_variance = float(variances[-1])

    # STA/LTA
    sta_lta = compute_sta_lta(mags)

    # FFT
    fft_feats = compute_fft_features(mags)

    # Anomaly score
    score = compute_anomaly_score(current_variance, sta_lta, fft_feats)

    return {
        "magnitudes": mags.tolist(),
        "variance": current_variance,
        "sta_lta_ratio": sta_lta,
        "fft_features": fft_feats,
        "anomaly_score": score,
        "phone_anomaly": score,  # alias for the verification formula
    }
