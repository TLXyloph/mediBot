interface MonitorScenario {
  label: string;
  hr: number;
  spo2: number;
  systolic: number;
  diastolic: number;
}

const scenarios: MonitorScenario[] = [
  { label: "BASELINE", hr: 88, spo2: 97, systolic: 118, diastolic: 76 },
  { label: "OBSERVE", hr: 94, spo2: 95, systolic: 110, diastolic: 72 },
  { label: "ALERT", hr: 104, spo2: 92, systolic: 90, diastolic: 60 },
];

function scenarioOrder(): MonitorScenario[] {
  const seed = Number(new URLSearchParams(location.search).get("seed") ?? "0");
  const offset = Number.isInteger(seed) ? Math.abs(seed) % scenarios.length : 0;
  return [...scenarios.slice(offset), ...scenarios.slice(0, offset)];
}

export function renderMonitor(root: HTMLElement): void {
  const orderedScenarios = scenarioOrder();
  root.innerHTML = `
    <main class="monitor-shell">
      <header class="monitor-header">
        <div><span class="monitor-brand">MEDIBOT</span> SIMULATED PATIENT MONITOR</div>
        <div class="monitor-live"><span></span> LIVE · DEMO ONLY</div>
      </header>
      <section class="monitor-grid" aria-live="polite">
        <article class="monitor-reading heart">
          <div class="monitor-label">HR <small>bpm</small></div>
          <strong id="monitor-hr">--</strong>
          <div class="wave wave-heart"></div>
        </article>
        <article class="monitor-reading oxygen">
          <div class="monitor-label">SpO₂ <small>%</small></div>
          <strong id="monitor-spo2">--</strong>
          <div class="wave wave-oxygen"></div>
        </article>
        <article class="monitor-reading pressure">
          <div class="monitor-label">NIBP <small>mmHg</small></div>
          <strong><span id="monitor-sys">--- </span><i>/</i><span id="monitor-dia"> --</span></strong>
          <div class="pressure-caption">SYS / DIA</div>
        </article>
      </section>
      <footer class="monitor-footer">
        <span id="monitor-state">INITIALIZING</span>
        <span>Values change every 15 seconds</span>
        <time id="monitor-clock"></time>
      </footer>
    </main>
  `;

  const hr = root.querySelector<HTMLElement>("#monitor-hr")!;
  const spo2 = root.querySelector<HTMLElement>("#monitor-spo2")!;
  const systolic = root.querySelector<HTMLElement>("#monitor-sys")!;
  const diastolic = root.querySelector<HTMLElement>("#monitor-dia")!;
  const state = root.querySelector<HTMLElement>("#monitor-state")!;
  const clock = root.querySelector<HTMLTimeElement>("#monitor-clock")!;
  let index = 0;

  const applyScenario = () => {
    const scenario = orderedScenarios[index]!;
    hr.textContent = String(scenario.hr);
    spo2.textContent = String(scenario.spo2);
    systolic.textContent = String(scenario.systolic);
    diastolic.textContent = String(scenario.diastolic);
    state.textContent = scenario.label;
    document.body.dataset.monitorState = scenario.label.toLowerCase();
    index = (index + 1) % orderedScenarios.length;
  };

  const updateClock = () => {
    clock.textContent = new Intl.DateTimeFormat("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(new Date());
  };

  applyScenario();
  updateClock();
  window.setInterval(applyScenario, 15_000);
  window.setInterval(updateClock, 1_000);
}
