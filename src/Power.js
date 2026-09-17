export class PowerEngine {
  constructor(options = {}) {
    this.targetFPS = options.targetFPS || 60;
    this.isEcoMode = false;
    this.isFPSThrottled = false;
    this.isThreadThrottled = false;
    this.battery = null;
    this.animationFrameId = null;
    this.lastFrameTime = performance.now();
    this.listeners = new Set();
    this.drainSamples = [];
    this.maxSamples = 50;
  }

  static getPlatformInfo() {
    const ua = navigator.userAgent || navigator.vendor || window.opera;
    const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isAndroid = /Android/.test(ua);

    return {
      isIOS,
      isAndroid,
      isMobile: isIOS || isAndroid,
      platformName: isIOS ? 'iOS WebKit Engine' : isAndroid ? 'Android BatteryManager' : 'Desktop Standard',
      hardwareConcurrency: navigator.hardwareConcurrency || 2,
      deviceMemory: navigator.deviceMemory || 'Unknown'
    };
  }

  async init() {
    if ('getBattery' in navigator) {
      try {
        this.battery = await navigator.getBattery();
        this._bindBatteryEvents();
        this.recordTelemetrySample();
      } catch (e) {
        // Fallback for missing/restricted APIs
      }
    }
    this._startGovernorLoop();
  }

  _bindBatteryEvents() {
    if (!this.battery) return;

    const events = ['levelchange', 'chargingchange', 'dischargingtimechange', 'chargingtimechange'];
    events.forEach(event => {
      this.battery.addEventListener(event, () => {
        this.recordTelemetrySample();
        this.notifyState();
      });
    });
  }

  getTelemetry() {
    if (!this.battery) {
      return {
        supported: false,
        level: 100,
        charging: true,
        dischargingTime: Infinity,
        chargingTime: 0
      };
    }

    return {
      supported: true,
      level: Math.round(this.battery.level * 100),
      charging: this.battery.charging,
      dischargingTime: this.battery.dischargingTime,
      chargingTime: this.battery.chargingTime
    };
  }

  recordTelemetrySample() {
    const telemetry = this.getTelemetry();
    if (!telemetry.supported) return;

    const sample = {
      timestamp: Date.now(),
      level: telemetry.level,
      charging: telemetry.charging
    };

    this.drainSamples.push(sample);
    if (this.drainSamples.length > this.maxSamples) {
      this.drainSamples.shift();
    }
  }

  analyzeWearProfile() {
    if (this.drainSamples.length < 3) {
      return {
        healthScore: 'Gathering Data',
        status: 'optimal',
        drainRatePerMin: 0,
        unstableSpikes: 0
      };
    }

    let unstableSpikes = 0;
    let totalDrainRate = 0;
    let validIntervals = 0;

    for (let i = 1; i < this.drainSamples.length; i++) {
      const prev = this.drainSamples[i - 1];
      const curr = this.drainSamples[i];
      const timeDiffMin = (curr.timestamp - prev.timestamp) / 60000;

      if (!curr.charging && !prev.charging && timeDiffMin > 0) {
        const drop = prev.level - curr.level;
        if (drop > 0) {
          const rate = drop / timeDiffMin;
          totalDrainRate += rate;
          validIntervals++;

          if (drop >= 4 && timeDiffMin < 2) {
            unstableSpikes++;
          }
        }
      }
    }

    const avgDrainRate = validIntervals > 0 ? Number((totalDrainRate / validIntervals).toFixed(2)) : 0;
    let status = 'optimal';
    let healthScore = 'Cell Health Normal';

    if (unstableSpikes > 0) {
      status = 'degraded';
      healthScore = 'Capacity Drop Anomaly';
    } else if (avgDrainRate > 1.2) {
      status = 'warning';
      healthScore = 'Elevated Discharge Velocity';
    }

    return {
      healthScore,
      status,
      drainRatePerMin: avgDrainRate,
      unstableSpikes
    };
  }

  setEcoMode(enable) {
    this.isEcoMode = enable;
    if (enable) {
      document.body.classList.add('power-saver-active');
    } else {
      document.body.classList.remove('power-saver-active');
    }
    this.notifyState();
  }

  setFrameRateCap(cap30FPS) {
    this.isFPSThrottled = cap30FPS;
    this.targetFPS = cap30FPS ? 30 : 60;
    this.notifyState();
  }

  setThreadThrottle(enable) {
    this.isThreadThrottled = enable;
    this.notifyState();
  }

  _startGovernorLoop() {
    const loop = (now) => {
      const delta = now - this.lastFrameTime;
      const interval = 1000 / this.targetFPS;

      if (delta >= interval) {
        this.lastFrameTime = now - (delta % interval);
      }

      this.animationFrameId = requestAnimationFrame(loop);
    };

    this.animationFrameId = requestAnimationFrame(loop);
  }

  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  notifyState() {
    const state = {
      telemetry: this.getTelemetry(),
      wearAnalysis: this.analyzeWearProfile(),
      platform: PowerEngine.getPlatformInfo(),
      isEcoMode: this.isEcoMode,
      targetFPS: this.targetFPS,
      isFPSThrottled: this.isFPSThrottled,
      isThreadThrottled: this.isThreadThrottled
    };
    this.listeners.forEach(fn => fn(state));
  }

  destroy() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    this.listeners.clear();
  }
}
