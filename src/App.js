import { PowerEngine } from './Power.js';
import { ConfigStorage } from './Storage.js';

export class BatterySaverApp {
  constructor() {
    this.storage = new ConfigStorage();
    this.config = this.storage.load();
    this.engine = new PowerEngine();
    this.circumference = 2 * Math.PI * 70;

    this.dom = {
      gaugeFill: document.getElementById('gauge-fill'),
      levelDisplay: document.getElementById('level-display'),
      statusDisplay: document.getElementById('status-display'),
      remainingTime: document.getElementById('remaining-time'),
      drainRate: document.getElementById('drain-rate'),
      voltageState: document.getElementById('voltage-state'),
      osPowerMode: document.getElementById('os-power-mode'),
      healthScore: document.getElementById('health-score'),
      healthTag: document.getElementById('health-tag'),
      diagnosticLogs: document.getElementById('diagnostic-logs'),
      sampleCount: document.getElementById('sample-count'),
      platformName: document.getElementById('platform-name'),
      platformDot: document.getElementById('platform-dot'),
      syncIndicator: document.getElementById('sync-indicator'),
      toggleSaver: document.getElementById('toggle-saver'),
      toggleAmoled: document.getElementById('toggle-amoled'),
      toggleFps: document.getElementById('toggle-fps'),
      toggleTasks: document.getElementById('toggle-tasks'),
      toggleAutosaver: document.getElementById('toggle-autosaver'),
      btnReset: document.getElementById('btn-reset')
    };

    this.init();
  }

  async init() {
    await this.engine.init();
    
    if (this.config.samples && this.config.samples.length > 0) {
      this.engine.drainSamples = this.config.samples;
    }

    const platform = PowerEngine.getPlatformInfo();
    this.dom.platformName.textContent = platform.platformName;

    this.applyStoredUI();
    this.bindEvents();

    this.engine.subscribe((state) => this.render(state));
    this.engine.notifyState();
  }

  applyStoredUI() {
    this.dom.toggleSaver.checked = this.config.saverMode;
    this.dom.toggleAmoled.checked = this.config.amoledMode;
    this.dom.toggleFps.checked = this.config.fpsCap;
    this.dom.toggleTasks.checked = this.config.taskLimit;
    this.dom.toggleAutosaver.checked = this.config.autoSaver;

    this.setAmoledTheme(this.config.amoledMode, false);
    this.engine.setEcoMode(this.config.saverMode);
    this.engine.setFrameRateCap(this.config.fpsCap);
    this.engine.setThreadThrottle(this.config.taskLimit);
  }

  saveState(showIndicator = true) {
    this.config.samples = this.engine.drainSamples;
    const saved = this.storage.save(this.config);
    if (saved && showIndicator) {
      this.dom.syncIndicator.classList.add('active');
      setTimeout(() => this.dom.syncIndicator.classList.remove('active'), 1000);
    }
  }

  formatTime(seconds) {
    if (!isFinite(seconds) || seconds === 0) return 'N/A';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }

  setAmoledTheme(enable, save = true) {
    this.config.amoledMode = enable;
    document.documentElement.style.setProperty('--bg', enable ? '#000000' : '#0a0a0c');
    if (save) this.saveState();
  }

  render(state) {
    const { telemetry, wearAnalysis, platform } = state;

    if (!telemetry.supported) {
      this.dom.statusDisplay.textContent = 'OS STANDBY';
      this.dom.levelDisplay.textContent = '100%';
      this.dom.remainingTime.textContent = 'N/A';
      this.dom.osPowerMode.textContent = 'Fallback Mode';
      return;
    }

    const level = telemetry.level;
    const offset = this.circumference - ((level / 100) * this.circumference);

    this.dom.gaugeFill.style.strokeDasharray = `${this.circumference}`;
    this.dom.gaugeFill.style.strokeDashoffset = offset;
    this.dom.levelDisplay.textContent = `${level}%`;

    if (level <= 20) {
      this.dom.gaugeFill.style.stroke = 'var(--danger)';
    } else if (level <= 45) {
      this.dom.gaugeFill.style.stroke = 'var(--warning)';
    } else {
      this.dom.gaugeFill.style.stroke = 'var(--accent)';
    }

    if (telemetry.charging) {
      this.dom.statusDisplay.textContent = 'CHARGING';
      this.dom.remainingTime.textContent = this.formatTime(telemetry.chargingTime);
    } else {
      this.dom.statusDisplay.textContent = 'DISCHARGING';
      this.dom.remainingTime.textContent = this.formatTime(telemetry.dischargingTime);
    }

    this.dom.sampleCount.textContent = `${this.engine.drainSamples.length} Samples`;
    this.dom.drainRate.textContent = `${wearAnalysis.drainRatePerMin} %/min`;

    this.dom.healthScore.textContent = wearAnalysis.healthScore;
    this.dom.healthTag.textContent = wearAnalysis.status.toUpperCase();
    this.dom.healthTag.className = `status-badge ${wearAnalysis.status}`;

    this.dom.voltageState.textContent = wearAnalysis.unstableSpikes > 0 ? 'Unstable Spikes' : 'Normal';
    this.dom.voltageState.style.color = wearAnalysis.unstableSpikes > 0 ? 'var(--danger)' : 'var(--accent)';
    this.dom.osPowerMode.textContent = state.isEcoMode ? 'Throttled (ECO)' : 'Standard';

    let logs = [];
    if (wearAnalysis.unstableSpikes > 0) {
      logs.push({ text: `Detected ${wearAnalysis.unstableSpikes} sudden capacity drop irregularity.`, color: 'var(--danger)' });
    }
    if (wearAnalysis.drainRatePerMin > 1.2) {
      logs.push({ text: 'High discharge rate recorded during cycle.', color: 'var(--warning)' });
    }
    if (logs.length === 0) {
      logs.push({ text: 'Discharge slope is stable. Cell wear profile optimal.', color: 'var(--accent)' });
    }

    this.dom.diagnosticLogs.innerHTML = logs.map(l => `
      <div class="log-row">
        <div class="log-indicator" style="background: ${l.color};"></div>
        <span>${l.text}</span>
      </div>
    `).join('');

    if (level <= 20 && !telemetry.charging && this.config.autoSaver && !this.config.saverMode) {
      this.dom.toggleSaver.checked = true;
      this.config.saverMode = true;
      this.engine.setEcoMode(true);
      this.saveState();
    }
  }

  bindEvents() {
    this.dom.toggleSaver.addEventListener('change', (e) => {
      this.config.saverMode = e.target.checked;
      this.engine.setEcoMode(e.target.checked);
      this.saveState();
    });

    this.dom.toggleAmoled.addEventListener('change', (e) => this.setAmoledTheme(e.target.checked));

    this.dom.toggleFps.addEventListener('change', (e) => {
      this.config.fpsCap = e.target.checked;
      this.engine.setFrameRateCap(e.target.checked);
      this.saveState();
    });

    this.dom.toggleTasks.addEventListener('change', (e) => {
      this.config.taskLimit = e.target.checked;
      this.engine.setThreadThrottle(e.target.checked);
      this.saveState();
    });

    this.dom.toggleAutosaver.addEventListener('change', (e) => {
      this.config.autoSaver = e.target.checked;
      this.saveState();
    });

    this.dom.btnReset.addEventListener('click', () => {
      this.storage.clear();
      this.config = this.storage.load();
      this.engine.drainSamples = [];
      this.applyStoredUI();
      this.engine.notifyState();
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.App = new BatterySaverApp();
});
