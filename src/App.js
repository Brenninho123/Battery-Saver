import { PowerEngine } from './Power.js';
import { ConfigStorage } from './Storage.js';
import { BatteryApi } from './BatteryApi.js';
import { GametimeOverlay } from './Gametime.js';
import { BatteryChargerEngine } from './Charger.js';

export class BatterySaverApp {
  constructor() {
    this.storage = new ConfigStorage();
    this.config = this.storage.load();
    this.engine = new PowerEngine();
    this.api = new BatteryApi(this.config.apiEndpoint);
    this.gametime = new GametimeOverlay({ visible: this.config.gametimeOverlay });
    this.charger = new BatteryChargerEngine();

    this.circumference = 2 * Math.PI * 70;
    this.lastSyncTime = 0;
    this.syncIntervalMs = this.config.syncInterval || 60000;
    this.sessionStartTime = Date.now();
    this.wakeLock = null;
    this.isPaused = false;
    this.eventListeners = new Map();

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
      toggleGametime: document.getElementById('toggle-gametime'),
      btnReset: document.getElementById('btn-reset'),
      btnReplayIntro: document.getElementById('btn-replay-intro'),
      apiStatusText: document.getElementById('api-status-text')
    };

    this.init();
  }

  async init() {
    await this.engine.init();
    this.gametime.init();

    if (this.config.samples && Array.isArray(this.config.samples)) {
      this.engine.drainSamples = this.config.samples;
    }

    const platform = PowerEngine.getPlatformInfo();
    if (this.dom.platformName) {
      this.dom.platformName.textContent = platform.platformName;
    }

    this.applyStoredUI();
    this.bindEvents();
    this.initVisibilityGovernor();
    this.initNetworkMonitor();
    this.initHardwareMetrics();
    this.initThermalGovernor();

    this.engine.subscribe((state) => {
      if (this.isPaused) return;
      const chargeProfile = this.charger.evaluateChargeState(state.telemetry);
      const combinedState = { ...state, chargeProfile };
      
      this.render(combinedState);
      this.gametime.update(state.telemetry);
      this.handleCloudSync(combinedState);
      this.dispatchEvent('telemetry', combinedState);
    });

    this.engine.notifyState();
  }

  applyStoredUI() {
    if (this.dom.toggleSaver) this.dom.toggleSaver.checked = this.config.saverMode;
    if (this.dom.toggleAmoled) this.dom.toggleAmoled.checked = this.config.amoledMode;
    if (this.dom.toggleFps) this.dom.toggleFps.checked = this.config.fpsCap;
    if (this.dom.toggleTasks) this.dom.toggleTasks.checked = this.config.taskLimit;
    if (this.dom.toggleAutosaver) this.dom.toggleAutosaver.checked = this.config.autoSaver;
    if (this.dom.toggleGametime) this.dom.toggleGametime.checked = this.config.gametimeOverlay;

    this.setAmoledTheme(this.config.amoledMode, false);
    this.engine.setEcoMode(this.config.saverMode);
    this.engine.setFrameRateCap(this.config.fpsCap);
    this.engine.setThreadThrottle(this.config.taskLimit);
    this.gametime.setVisible(this.config.gametimeOverlay);
  }

  saveState(showIndicator = true) {
    this.config.samples = this.engine.drainSamples;
    const saved = this.storage.save(this.config);
    if (saved && showIndicator && this.dom.syncIndicator) {
      this.dom.syncIndicator.classList.add('active');
      setTimeout(() => {
        if (this.dom.syncIndicator) this.dom.syncIndicator.classList.remove('active');
      }, 1000);
    }
  }

  formatTime(seconds) {
    if (!isFinite(seconds) || seconds === 0 || seconds == null) return 'N/A';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }

  setAmoledTheme(enable, save = true) {
    this.config.amoledMode = enable;
    document.documentElement.style.setProperty('--bg', enable ? '#000000' : '#0a0a0c');
    if (save) this.saveState();
  }

  async requestScreenWakeLock() {
    if ('wakeLock' in navigator && !this.wakeLock) {
      try {
        this.wakeLock = await navigator.wakeLock.request('screen');
      } catch (e) {
        this.wakeLock = null;
      }
    }
  }

  releaseScreenWakeLock() {
    if (this.wakeLock) {
      this.wakeLock.release().then(() => {
        this.wakeLock = null;
      });
    }
  }

  pauseExecution() {
    this.isPaused = true;
    this.engine.setFrameRateCap(true);
    this.releaseScreenWakeLock();
    this.dispatchEvent('pause');
  }

  resumeExecution() {
    this.isPaused = false;
    this.engine.setFrameRateCap(this.config.fpsCap);
    if (!this.config.saverMode) {
      this.requestScreenWakeLock();
    }
    this.engine.notifyState();
    this.dispatchEvent('resume');
  }

  initVisibilityGovernor() {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.pauseExecution();
      } else {
        this.resumeExecution();
      }
    });
  }

  initNetworkMonitor() {
    if ('connection' in navigator) {
      const connection = navigator.connection;
      const updateNetworkState = () => {
        if (connection.saveData && !this.config.saverMode) {
          this.config.saverMode = true;
          this.engine.setEcoMode(true);
          if (this.dom.toggleSaver) this.dom.toggleSaver.checked = true;
          this.saveState();
        }
      };
      connection.addEventListener('change', updateNetworkState);
      updateNetworkState();
    }
  }

  initHardwareMetrics() {
    const platform = PowerEngine.getPlatformInfo();
    if (platform.hardwareConcurrency <= 2 && !this.config.saverMode) {
      this.engine.setThreadThrottle(true);
    }
  }

  initThermalGovernor() {
    if ('computePressure' in window) {
      try {
        const observer = new PressureObserver((entries) => {
          const latest = entries[entries.length - 1];
          if (latest.state === 'critical' || latest.state === 'serious') {
            if (!this.config.saverMode) {
              this.config.saverMode = true;
              this.engine.setEcoMode(true);
              this.engine.setFrameRateCap(true);
              if (this.dom.toggleSaver) this.dom.toggleSaver.checked = true;
              if (this.dom.toggleFps) this.dom.toggleFps.checked = true;
              this.saveState();
            }
          }
        });
        observer.observe('cpu');
      } catch (e) {}
    }
  }

  triggerHapticFeedback(pattern = [40]) {
    if ('vibrate' in navigator && !this.config.saverMode) {
      navigator.vibrate(pattern);
    }
  }

  async handleCloudSync(state) {
    if (!this.config.cloudSync || !this.config.apiEndpoint) return;

    const now = Date.now();
    if (now - this.lastSyncTime >= this.syncIntervalMs) {
      this.lastSyncTime = now;
      if (this.dom.apiStatusText) this.dom.apiStatusText.textContent = 'Syncing Telemetry...';

      const payload = {
        ...state,
        sessionDurationMs: now - this.sessionStartTime
      };

      const result = await this.api.syncTelemetry(payload);
      if (this.dom.apiStatusText) {
        this.dom.apiStatusText.textContent = result.success ? 'Telemetry Synced' : 'API Offline';
      }
    }
  }

  render(state) {
    const { telemetry, wearAnalysis, chargeProfile } = state;

    if (!telemetry || !telemetry.supported) {
      if (this.dom.statusDisplay) this.dom.statusDisplay.textContent = 'OS STANDBY';
      if (this.dom.levelDisplay) this.dom.levelDisplay.textContent = '100%';
      if (this.dom.remainingTime) this.dom.remainingTime.textContent = 'N/A';
      if (this.dom.osPowerMode) this.dom.osPowerMode.textContent = 'Fallback Mode';
      return;
    }

    const level = telemetry.level;
    const offset = this.circumference - ((level / 100) * this.circumference);

    if (this.dom.gaugeFill) {
      this.dom.gaugeFill.style.strokeDasharray = `${this.circumference}`;
      this.dom.gaugeFill.style.strokeDashoffset = offset;

      if (level <= 20) {
        this.dom.gaugeFill.style.stroke = 'var(--danger)';
      } else if (level <= 45) {
        this.dom.gaugeFill.style.stroke = 'var(--warning)';
      } else {
        this.dom.gaugeFill.style.stroke = 'var(--accent)';
      }
    }

    if (this.dom.levelDisplay) this.dom.levelDisplay.textContent = `${level}%`;

    if (this.dom.statusDisplay) {
      if (telemetry.charging) {
        this.dom.statusDisplay.textContent = chargeProfile?.chargeType || 'CHARGING';
        if (this.dom.remainingTime) this.dom.remainingTime.textContent = this.formatTime(telemetry.chargingTime);
      } else {
        this.dom.statusDisplay.textContent = 'DISCHARGING';
        if (this.dom.remainingTime) this.dom.remainingTime.textContent = this.formatTime(telemetry.dischargingTime);
      }
    }

    if (this.dom.sampleCount) this.dom.sampleCount.textContent = `${this.engine.drainSamples.length} Samples`;
    if (this.dom.drainRate) this.dom.drainRate.textContent = `${wearAnalysis.drainRatePerMin} %/min`;

    if (this.dom.healthScore) this.dom.healthScore.textContent = wearAnalysis.healthScore;
    if (this.dom.healthTag) {
      this.dom.healthTag.textContent = wearAnalysis.status.toUpperCase();
      this.dom.healthTag.className = `status-badge ${wearAnalysis.status}`;
    }

    if (this.dom.voltageState) {
      this.dom.voltageState.textContent = wearAnalysis.unstableSpikes > 0 ? 'Unstable Spikes' : 'Normal';
      this.dom.voltageState.style.color = wearAnalysis.unstableSpikes > 0 ? 'var(--danger)' : 'var(--accent)';
    }

    if (this.dom.osPowerMode) {
      this.dom.osPowerMode.textContent = state.isEcoMode ? 'Throttled (ECO)' : 'Standard';
    }

    if (this.dom.diagnosticLogs) {
      let logs = [];
      if (chargeProfile && chargeProfile.isCharging) {
        logs.push({ text: `Power Mode: ${chargeProfile.chargeType}`, color: 'var(--ios-blue)' });
        if (chargeProfile.overheatWarning) {
          logs.push({ text: 'High thermal stress detected due to fast charging above 80%.', color: 'var(--danger)' });
        }
      }
      if (wearAnalysis.unstableSpikes > 0) {
        logs.push({ text: `Detected ${wearAnalysis.unstableSpikes} capacity drop anomaly. Wear risk detected.`, color: 'var(--danger)' });
      }
      if (wearAnalysis.drainRatePerMin > 1.2 && !telemetry.charging) {
        logs.push({ text: 'High discharge velocity logged during passive cycle.', color: 'var(--warning)' });
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
    }

    if (level <= 20 && !telemetry.charging && this.config.autoSaver && !this.config.saverMode) {
      if (this.dom.toggleSaver) this.dom.toggleSaver.checked = true;
      this.config.saverMode = true;
      this.engine.setEcoMode(true);
      this.triggerHapticFeedback([100, 50, 100]);
      this.saveState();
    }
  }

  bindEvents() {
    if (this.dom.toggleSaver) {
      this.dom.toggleSaver.addEventListener('change', (e) => {
        this.config.saverMode = e.target.checked;
        this.engine.setEcoMode(e.target.checked);
        this.triggerHapticFeedback();
        this.saveState();
      });
    }

    if (this.dom.toggleAmoled) {
      this.dom.toggleAmoled.addEventListener('change', (e) => {
        this.setAmoledTheme(e.target.checked);
        this.triggerHapticFeedback();
      });
    }

    if (this.dom.toggleFps) {
      this.dom.toggleFps.addEventListener('change', (e) => {
        this.config.fpsCap = e.target.checked;
        this.engine.setFrameRateCap(e.target.checked);
        this.triggerHapticFeedback();
        this.saveState();
      });
    }

    if (this.dom.toggleTasks) {
      this.dom.toggleTasks.addEventListener('change', (e) => {
        this.config.taskLimit = e.target.checked;
        this.engine.setThreadThrottle(e.target.checked);
        this.triggerHapticFeedback();
        this.saveState();
      });
    }

    if (this.dom.toggleAutosaver) {
      this.dom.toggleAutosaver.addEventListener('change', (e) => {
        this.config.autoSaver = e.target.checked;
        this.triggerHapticFeedback();
        this.saveState();
      });
    }

    if (this.dom.toggleGametime) {
      this.dom.toggleGametime.addEventListener('change', (e) => {
        this.config.gametimeOverlay = e.target.checked;
        this.gametime.setVisible(e.target.checked);
        this.triggerHapticFeedback();
        this.saveState();
      });
    }

    if (this.dom.btnReset) {
      this.dom.btnReset.addEventListener('click', () => {
        this.storage.clear();
        this.config = this.storage.load();
        this.engine.drainSamples = [];
        this.triggerHapticFeedback([40, 40, 40]);
        this.applyStoredUI();
        this.engine.notifyState();
      });
    }
  }

  on(eventName, listener) {
    if (!this.eventListeners.has(eventName)) {
      this.eventListeners.set(eventName, new Set());
    }
    this.eventListeners.get(eventName).add(listener);
  }

  off(eventName, listener) {
    if (this.eventListeners.has(eventName)) {
      this.eventListeners.get(eventName).delete(listener);
    }
  }

  dispatchEvent(name, detail = {}) {
    if (this.eventListeners.has(name)) {
      this.eventListeners.get(name).forEach((fn) => fn(detail));
    }
    window.dispatchEvent(new CustomEvent(`batterysaver:${name}`, { detail }));
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.App = new BatterySaverApp();
});
