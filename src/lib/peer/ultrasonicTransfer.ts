// src/lib/peer/ultrasonicTransfer.ts
// ──────────────────────────────────────────────────────────────
// Ultrasonic data transfer via Web Audio API.
//
// Encodes binary data as FSK (Frequency Shift Keying) tones
// in the near-ultrasonic range (18000-20000 Hz). Inaudible
// to most adults, works through phone speakers/mics.
//
// Protocol:
//   1. PREAMBLE: 300ms of 18000 Hz (sync tone — "I'm about to send")
//   2. DATA: FSK modulation, 4 bits per symbol (16-FSK)
//     - 16 frequencies from 18200-19800 Hz (100 Hz spacing)
//     - Each symbol = 25ms (40 symbols/sec = 20 bytes/sec)
//   3. POSTAMBLE: 200ms of 18000 Hz (end marker)
//
// Effective throughput: ~20 bytes/sec
// A typical exchange of 50 items ≈ 800 bytes ≈ 40 seconds
// With codebook compression: 50 items ≈ 400 bytes ≈ 20 seconds
// ──────────────────────────────────────────────────────────────

// ── Constants ────────────────────────────────────────────────

const SAMPLE_RATE = 44100;
const PREAMBLE_FREQ = 18000;
const PREAMBLE_DURATION_MS = 300;
const POSTAMBLE_DURATION_MS = 200;
const SYMBOL_DURATION_MS = 25; // 40 symbols/second
const BASE_FREQ = 18200;
const FREQ_STEP = 100; // 16 frequencies: 18200, 18300, ..., 19700
const NUM_SYMBOLS = 16; // 4 bits per symbol (nibble)
const TONE_AMPLITUDE = 0.8;

// Detection thresholds
const PREAMBLE_DETECT_THRESHOLD = 0.02;
const SYMBOL_DETECT_THRESHOLD = 0.015;
const FFT_SIZE = 2048;

// ── Transmitter ──────────────────────────────────────────────

export type TransmitProgress = {
  phase: "preamble" | "data" | "postamble" | "done";
  bytesSent: number;
  totalBytes: number;
  percent: number;
};

/**
 * Transmit binary data as ultrasonic tones.
 * Returns a promise that resolves when transmission completes.
 */
export async function transmit(
  data: Uint8Array,
  onProgress?: (p: TransmitProgress) => void,
): Promise<void> {
  const ctx = new AudioContext({ sampleRate: SAMPLE_RATE });

  try {
    // Convert bytes to nibbles (4-bit symbols)
    const nibbles: number[] = [];
    for (const byte of data) {
      nibbles.push((byte >> 4) & 0x0f); // high nibble
      nibbles.push(byte & 0x0f);         // low nibble
    }

    const totalSymbols = nibbles.length;
    const preambleSamples = Math.round(SAMPLE_RATE * PREAMBLE_DURATION_MS / 1000);
    const postambleSamples = Math.round(SAMPLE_RATE * POSTAMBLE_DURATION_MS / 1000);
    const symbolSamples = Math.round(SAMPLE_RATE * SYMBOL_DURATION_MS / 1000);
    const totalSamples = preambleSamples + (totalSymbols * symbolSamples) + postambleSamples;

    const buffer = ctx.createBuffer(1, totalSamples, SAMPLE_RATE);
    const channel = buffer.getChannelData(0);

    let offset = 0;

    // Preamble
    for (let i = 0; i < preambleSamples; i++) {
      const t = i / SAMPLE_RATE;
      channel[offset++] = TONE_AMPLITUDE * Math.sin(2 * Math.PI * PREAMBLE_FREQ * t);
    }

    // Data symbols
    for (let s = 0; s < totalSymbols; s++) {
      const freq = BASE_FREQ + nibbles[s] * FREQ_STEP;
      for (let i = 0; i < symbolSamples; i++) {
        const t = i / SAMPLE_RATE;
        // Apply Hann window for clean transitions
        const window = 0.5 * (1 - Math.cos(2 * Math.PI * i / symbolSamples));
        channel[offset++] = TONE_AMPLITUDE * window * Math.sin(2 * Math.PI * freq * t);
      }
    }

    // Postamble
    for (let i = 0; i < postambleSamples; i++) {
      const t = i / SAMPLE_RATE;
      channel[offset++] = TONE_AMPLITUDE * Math.sin(2 * Math.PI * PREAMBLE_FREQ * t);
    }

    // Play the buffer
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);

    return new Promise<void>((resolve) => {
      source.onended = () => {
        onProgress?.({
          phase: "done",
          bytesSent: data.length,
          totalBytes: data.length,
          percent: 100,
        });
        ctx.close();
        resolve();
      };

      source.start();

      // Progress tracking
      if (onProgress) {
        const totalDurationMs = PREAMBLE_DURATION_MS + (totalSymbols * SYMBOL_DURATION_MS) + POSTAMBLE_DURATION_MS;
        const startTime = Date.now();
        const interval = setInterval(() => {
          const elapsed = Date.now() - startTime;
          const percent = Math.min(100, (elapsed / totalDurationMs) * 100);

          let phase: TransmitProgress["phase"];
          let bytesSent: number;
          if (elapsed < PREAMBLE_DURATION_MS) {
            phase = "preamble";
            bytesSent = 0;
          } else if (elapsed < PREAMBLE_DURATION_MS + totalSymbols * SYMBOL_DURATION_MS) {
            phase = "data";
            const dataElapsed = elapsed - PREAMBLE_DURATION_MS;
            bytesSent = Math.floor(dataElapsed / SYMBOL_DURATION_MS / 2);
          } else {
            phase = "postamble";
            bytesSent = data.length;
          }

          onProgress({ phase, bytesSent, totalBytes: data.length, percent });

          if (percent >= 100) clearInterval(interval);
        }, 200);
      }
    });
  } catch (e) {
    ctx.close();
    throw e;
  }
}

// ── Receiver ─────────────────────────────────────────────────

export type ReceiveProgress = {
  phase: "listening" | "receiving" | "done" | "error";
  bytesReceived: number;
  percent: number; // estimated from preamble detection
  message?: string;
};

/**
 * Listen for ultrasonic transmission and decode the data.
 * Returns the decoded binary data.
 *
 * @param timeoutMs Max time to wait for preamble (default 120s)
 * @param onProgress Progress callback
 * @param signal AbortSignal to cancel listening
 */
export async function receive(
  timeoutMs = 120_000,
  onProgress?: (p: ReceiveProgress) => void,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  // Request microphone
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      sampleRate: SAMPLE_RATE,
    },
  });

  const ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = FFT_SIZE;
  analyser.smoothingTimeConstant = 0.3;
  source.connect(analyser);

  const freqData = new Float32Array(analyser.frequencyBinCount);
  const freqResolution = SAMPLE_RATE / FFT_SIZE; // ~21.5 Hz per bin

  function cleanup() {
    stream.getTracks().forEach((t) => t.stop());
    ctx.close().catch(() => {});
  }

  function freqToBin(freq: number): number {
    return Math.round(freq / freqResolution);
  }

  function getPeakFreqInRange(lo: number, hi: number): { freq: number; magnitude: number } {
    analyser.getFloatFrequencyData(freqData);
    const loBin = freqToBin(lo);
    const hiBin = freqToBin(hi);
    let bestBin = loBin;
    let bestMag = -Infinity;
    for (let b = loBin; b <= hiBin && b < freqData.length; b++) {
      // Convert dB to linear
      const mag = Math.pow(10, freqData[b] / 20);
      if (mag > bestMag) {
        bestMag = mag;
        bestBin = b;
      }
    }
    return { freq: bestBin * freqResolution, magnitude: bestMag };
  }

  function detectSymbol(): number | null {
    const peak = getPeakFreqInRange(BASE_FREQ - 50, BASE_FREQ + NUM_SYMBOLS * FREQ_STEP + 50);
    if (peak.magnitude < SYMBOL_DETECT_THRESHOLD) return null;

    // Find closest symbol frequency
    const symbolIdx = Math.round((peak.freq - BASE_FREQ) / FREQ_STEP);
    if (symbolIdx < 0 || symbolIdx >= NUM_SYMBOLS) return null;
    return symbolIdx;
  }

  function detectPreamble(): boolean {
    const peak = getPeakFreqInRange(PREAMBLE_FREQ - 100, PREAMBLE_FREQ + 100);
    return peak.magnitude > PREAMBLE_DETECT_THRESHOLD;
  }

  return new Promise<Uint8Array>((resolve, reject) => {
    const abortHandler = () => {
      cleanup();
      reject(new Error("Receive cancelled"));
    };
    signal?.addEventListener("abort", abortHandler, { once: true });

    let phase: "waiting" | "preamble" | "data" | "postamble" = "waiting";
    let preambleStart = 0;
    let nibbles: number[] = [];
    let lastSymbolTime = 0;
    let silenceCount = 0;

    onProgress?.({ phase: "listening", bytesReceived: 0, percent: 0, message: "Listening for ultrasonic signal..." });

    const startTime = Date.now();

    const poll = setInterval(() => {
      if (signal?.aborted) {
        clearInterval(poll);
        return;
      }

      const now = Date.now();

      // Timeout check
      if (phase === "waiting" && now - startTime > timeoutMs) {
        clearInterval(poll);
        cleanup();
        reject(new Error("Timeout waiting for ultrasonic signal"));
        return;
      }

      switch (phase) {
        case "waiting": {
          if (detectPreamble()) {
            preambleStart = now;
            phase = "preamble";
            onProgress?.({ phase: "receiving", bytesReceived: 0, percent: 0, message: "Preamble detected..." });
          }
          break;
        }
        case "preamble": {
          // Wait for preamble to end (transition to data frequencies)
          if (now - preambleStart > PREAMBLE_DURATION_MS * 0.8) {
            if (!detectPreamble()) {
              phase = "data";
              nibbles = [];
              lastSymbolTime = now;
              silenceCount = 0;
              onProgress?.({ phase: "receiving", bytesReceived: 0, percent: 5, message: "Receiving data..." });
            }
          }
          break;
        }
        case "data": {
          // Sample at symbol rate
          if (now - lastSymbolTime >= SYMBOL_DURATION_MS * 0.9) {
            const sym = detectSymbol();
            if (sym !== null) {
              nibbles.push(sym);
              silenceCount = 0;
              lastSymbolTime = now;
              const bytesReceived = Math.floor(nibbles.length / 2);
              onProgress?.({ phase: "receiving", bytesReceived, percent: -1, message: `${bytesReceived} bytes...` });
            } else {
              silenceCount++;
            }

            // Check for postamble (preamble freq returns)
            if (detectPreamble() && nibbles.length > 0) {
              phase = "postamble";
            }

            // Or if we've had too many silent samples, assume done
            if (silenceCount > 20 && nibbles.length > 0) {
              phase = "postamble";
            }
          }
          break;
        }
        case "postamble": {
          clearInterval(poll);
          cleanup();
          signal?.removeEventListener("abort", abortHandler);

          // Convert nibbles back to bytes
          // Pad with 0 if odd number of nibbles
          if (nibbles.length % 2 !== 0) nibbles.push(0);

          const bytes = new Uint8Array(nibbles.length / 2);
          for (let i = 0; i < bytes.length; i++) {
            bytes[i] = (nibbles[i * 2] << 4) | nibbles[i * 2 + 1];
          }

          onProgress?.({ phase: "done", bytesReceived: bytes.length, percent: 100, message: "Transfer complete!" });
          resolve(bytes);
          break;
        }
      }
    }, Math.floor(SYMBOL_DURATION_MS * 0.7)); // Poll slightly faster than symbol rate
  });
}

/**
 * Estimate transfer duration for a given payload size.
 */
export function estimateTransferSeconds(byteCount: number): number {
  const nibbles = byteCount * 2;
  const dataMs = nibbles * SYMBOL_DURATION_MS;
  const totalMs = PREAMBLE_DURATION_MS + dataMs + POSTAMBLE_DURATION_MS;
  return totalMs / 1000;
}
