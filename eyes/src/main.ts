import "./styles.css";
import { api } from "./api.js";
import { FallbackScanner, LiveEyes, type LiveEyesCallbacks } from "./live.js";
import { CameraCapture } from "./media/camera.js";
import { PcmMicrophone, PcmSpeaker, WakeWordAudioGate } from "./media/audio.js";
import { renderMonitor } from "./monitor.js";
import type { EyesMode, HealthResponse, VitalsReading } from "./shared/types.js";

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("#app is missing");

if (location.pathname === "/monitor" || location.pathname.startsWith("/monitor/")) {
  document.title = "MediBot Simulated Monitor";
  document.body.classList.add("monitor-page");
  renderMonitor(root);
} else {
  renderWatcher(root);
}

function renderWatcher(container: HTMLElement): void {
  container.innerHTML = `
    <main class="watcher-shell">
      <header class="topbar">
        <a class="brand" href="/" aria-label="MediBot Eyes home">
          <span class="brand-mark" aria-hidden="true"><i></i></span>
          <span><strong>MediBot</strong><small>Eyes · Lane D</small></span>
        </a>
        <div class="header-meta">
          <a class="monitor-link" href="/monitor" target="_blank">Open monitor ↗</a>
          <span class="mode-pill" id="mode-pill" data-mode="idle"><i></i><b>IDLE</b></span>
        </div>
      </header>

      <section class="hero-copy">
        <p class="eyebrow">AMBIENT MULTIMODAL WATCHER</p>
        <h1>Eyes on the monitor.<br><em>Hands on the patient.</em></h1>
        <p>Gemini watches the simulated cardiac monitor, writes changed vitals to Convex, and answers only when the medic says “MediBot.”</p>
      </section>

      <section class="workspace">
        <div class="camera-stage">
          <video id="camera" autoplay muted playsinline></video>
          <div class="camera-empty" id="camera-empty">
            <span class="focus-corners"></span>
            <strong>Camera standing by</strong>
            <p>Point the webcam at the Samsung monitor.</p>
          </div>
          <div class="camera-overlay">
            <span><i class="record-dot"></i> MB3 CAMERA</span>
            <span id="camera-time">--:--:--</span>
          </div>
          <div class="scan-line" aria-hidden="true"></div>
        </div>

        <aside class="side-panel">
          <div class="status-block">
            <span class="section-label">SESSION</span>
            <strong id="status-message">Ready to connect</strong>
            <p id="configuration-message">Checking server configuration…</p>
          </div>

          <div class="vitals-block">
            <div class="section-heading">
              <span class="section-label">LATEST VISION EVENT</span>
              <time id="vitals-time">Not reported</time>
            </div>
            <div class="vitals-row">
              <div><span>HR</span><strong id="vital-hr">—</strong><small>bpm</small></div>
              <div><span>SpO₂</span><strong id="vital-spo2">—</strong><small>%</small></div>
              <div class="bp"><span>BP</span><strong id="vital-bp">—/—</strong><small>mmHg</small></div>
            </div>
          </div>

          <div class="activity-block">
            <div class="section-heading">
              <span class="section-label">LIVE ACTIVITY</span>
              <button class="text-button" id="clear-log" type="button">Clear</button>
            </div>
            <ol id="activity-log" aria-live="polite"></ol>
          </div>
        </aside>
      </section>

      <footer class="controls">
        <div class="voice-cue">
          <span class="voice-orb"><i></i><i></i><i></i></span>
          <div><small>VOICE QUERY</small><strong>“MediBot, when was the last epi?”</strong></div>
        </div>
        <div class="control-actions">
          <button class="secondary-button" id="fallback-button" type="button" disabled>Force fallback</button>
          <button class="secondary-button danger" id="stop-button" type="button" disabled>Stop</button>
          <button class="primary-button" id="start-button" type="button">Start Eyes</button>
        </div>
      </footer>
    </main>
  `;

  const elements = {
    video: required<HTMLVideoElement>("#camera"),
    cameraEmpty: required<HTMLElement>("#camera-empty"),
    cameraTime: required<HTMLElement>("#camera-time"),
    modePill: required<HTMLElement>("#mode-pill"),
    status: required<HTMLElement>("#status-message"),
    configuration: required<HTMLElement>("#configuration-message"),
    hr: required<HTMLElement>("#vital-hr"),
    spo2: required<HTMLElement>("#vital-spo2"),
    bp: required<HTMLElement>("#vital-bp"),
    vitalsTime: required<HTMLTimeElement>("#vitals-time"),
    log: required<HTMLOListElement>("#activity-log"),
    clearLog: required<HTMLButtonElement>("#clear-log"),
    start: required<HTMLButtonElement>("#start-button"),
    stop: required<HTMLButtonElement>("#stop-button"),
    fallback: required<HTMLButtonElement>("#fallback-button"),
  };

  const camera = new CameraCapture(elements.video);
  const microphone = new PcmMicrophone();
  const speaker = new PcmSpeaker();
  const audioGate = new WakeWordAudioGate(speaker);
  let live: LiveEyes | undefined;
  let fallback: FallbackScanner | undefined;
  let mode: EyesMode = "idle";

  const log = (message: string, kind: "info" | "voice" | "tool" | "warning" = "info") => {
    const item = document.createElement("li");
    item.dataset.kind = kind;
    const timestamp = new Intl.DateTimeFormat("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(new Date());
    item.innerHTML = `<time>${timestamp}</time><span></span>`;
    item.querySelector("span")!.textContent = message;
    elements.log.prepend(item);
    while (elements.log.childElementCount > 8) elements.log.lastElementChild?.remove();
  };

  const setMode = (nextMode: EyesMode, status?: string) => {
    mode = nextMode;
    elements.modePill.dataset.mode = nextMode;
    elements.modePill.querySelector("b")!.textContent = nextMode.toUpperCase();
    if (status) elements.status.textContent = status;
    elements.start.disabled = nextMode === "connecting" || nextMode === "live";
    elements.stop.disabled = nextMode === "idle" || nextMode === "stopped";
    elements.fallback.disabled = nextMode !== "live";
    elements.start.textContent = nextMode === "fallback" || nextMode === "error" ? "Retry Live" : "Start Eyes";
    document.body.dataset.mode = nextMode;
  };

  const showVitals = (reading: VitalsReading, duplicate: boolean) => {
    elements.hr.textContent = String(reading.hrBpm);
    elements.spo2.textContent = String(reading.spo2Pct);
    elements.bp.textContent = `${reading.systolicMmHg}/${reading.diastolicMmHg}`;
    elements.vitalsTime.textContent = duplicate ? "Unchanged" : "Just appended";
    elements.vitalsTime.dateTime = new Date().toISOString();
  };

  const callbacks: LiveEyesCallbacks = {
    onStatus: (message) => {
      elements.status.textContent = message;
      log(message, message.toLowerCase().includes("fail") ? "warning" : "info");
    },
    onTranscript: (source, text) => {
      log(`${source === "human" ? "Heard" : "MediBot"}: ${text}`, "voice");
    },
    onVitals: showVitals,
    onTool: (message) => log(message, "tool"),
    onFallback: (reason) => {
      log(reason, "warning");
      startFallback(reason);
    },
  };

  const makeLive = () => new LiveEyes(camera, audioGate, callbacks);
  fallback = new FallbackScanner(camera, callbacks);

  function startFallback(reason = "Live disabled manually"): void {
    live?.stop();
    live = undefined;
    fallback?.start();
    setMode("fallback", "Fallback vision active");
    log(reason, "warning");
  }

  async function startLive(): Promise<void> {
    try {
      setMode("connecting", "Starting camera and Gemini Live…");
      fallback?.stop();
      await speaker.resume();
      const stream = await camera.start();
      elements.cameraEmpty.hidden = true;
      await microphone.start(stream, (chunk) => live?.sendAudio(chunk));
      live?.stop();
      live = makeLive();
      await live.start();
      if (mode !== "fallback") setMode("live", "Gemini Live connected");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to start Eyes";
      log(message, "warning");
      startFallback(message);
    }
  }

  function stopAll(): void {
    live?.stop();
    live = undefined;
    fallback?.stop();
    microphone.stop();
    camera.stop();
    audioGate.reset();
    elements.cameraEmpty.hidden = false;
    setMode("stopped", "Eyes stopped");
    log("Camera, microphone, and model sessions stopped");
  }

  elements.start.addEventListener("click", () => void startLive());
  elements.stop.addEventListener("click", stopAll);
  elements.fallback.addEventListener("click", () => startFallback());
  elements.clearLog.addEventListener("click", () => (elements.log.innerHTML = ""));

  const updateClock = () => {
    elements.cameraTime.textContent = new Intl.DateTimeFormat("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(new Date());
  };
  updateClock();
  window.setInterval(updateClock, 1_000);

  void api
    .health()
    .then((health) => showConfiguration(health, elements.configuration, log))
    .catch((error) => {
      elements.configuration.textContent = "Server health check failed";
      log(error instanceof Error ? error.message : "Health check failed", "warning");
    });

  setMode(mode);
}

function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing element: ${selector}`);
  return element;
}

function showConfiguration(
  health: HealthResponse,
  element: HTMLElement,
  log: (message: string, kind?: "info" | "voice" | "tool" | "warning") => void,
): void {
  if (health.convexMode === "mock") {
    element.textContent = `${health.liveModel} · MOCK CONVEX — do not demo`;
    element.classList.add("configuration-warning");
    log("CONVEX_MOCK is active; switch to the real deployment before rehearsal", "warning");
    return;
  }

  const missing = [
    !health.geminiConfigured ? "Gemini key" : "",
    !health.convexConfigured ? "Convex URL" : "",
  ].filter(Boolean);
  if (missing.length) {
    element.textContent = `Missing: ${missing.join(", ")}`;
    element.classList.add("configuration-warning");
    return;
  }

  element.textContent = `${health.liveModel} · Convex connected`;
}
