export class BatteryChargerEngine {
  constructor(options = {}) {
    this.targetFullVoltage = options.targetFullVoltage || 4.2;
    this.estimatedCapacityMah = options.estimatedCapacityMah || 4500;
    this.isFastCharging = false;
    this.isOverheatingRisk = false;
    this.chargeStartTime = null;
    this.chargeStartLevel = null;
    this.chargeTelemetryHistory = [];
    this.maxTelemetrySamples = 60;
  }

  evaluateChargeState(telemetry) {
    if (!telemetry || !telemetry.supported) {
      return {
        isCharging: false,
        chargeType: 'Disconnected',
        estimatedTimeRemainingSeconds: null,
        healthImpactScore: 'Normal',
        overheatWarning: false
      };
    }

    const { charging, level, chargingTime } = telemetry;

    if (!charging) {
      this.chargeStartTime = null;
      this.chargeStartLevel = null;
      return {
        isCharging: false,
        chargeType: 'Disconnected',
        estimatedTimeRemainingSeconds: null,
        healthImpactScore: 'Optimal',
        overheatWarning: false
      };
    }

    if (this.chargeStartTime === null) {
      this.chargeStartTime = Date.now();
      this.chargeStartLevel = level;
    }

    const now = Date.now();
    this.chargeTelemetryHistory.push({ timestamp: now, level });

    if (this.chargeTelemetryHistory.length > this.maxTelemetrySamples) {
      this.chargeTelemetryHistory.shift();
    }

    const elapsedMinutes = (now - this.chargeStartTime) / 60000;
    const gainedLevel = level - this.chargeStartLevel;
    const chargeSpeedPerMin = elapsedMinutes > 0.5 ? gainedLevel / elapsedMinutes : 0;

    this.isFastCharging = chargeSpeedPerMin > 1.5;
    this.isOverheatingRisk = this.isFastCharging && level > 80;

    let chargeType = 'Standard Charging';
    if (this.isFastCharging) {
      chargeType = 'Fast / High-Wattage Charge';
    } else if (chargeSpeedPerMin > 0 && chargeSpeedPerMin <= 0.4) {
      chargeType = 'Trickle / Slow USB Charge';
    }

    let healthImpactScore = 'Optimal';
    if (this.isOverheatingRisk) {
      healthImpactScore = 'Thermal Stress Warning';
    } else if (level >= 95) {
      healthImpactScore = 'High Voltage Saturation';
    }

    return {
      isCharging: true,
      chargeType,
      chargeSpeedPerMin: Number(chargeSpeedPerMin.toFixed(2)),
      estimatedTimeRemainingSeconds: isFinite(chargingTime) ? chargingTime : null,
      healthImpactScore,
      overheatWarning: this.isOverheatingRisk,
      recommendedLimit: level >= 80 ? '80% Charge Limit Recommended for Lifespan' : 'Normal Cycle'
    };
  }

  calculateOptimalChargeCutoff(currentLevel) {
    if (currentLevel >= 80) {
      return {
        shouldStop: true,
        reason: 'Protection Threshold Reached (80% Lifespan Preserver)'
      };
    }
    return {
      shouldStop: false,
      reason: 'Safe Charging Zone'
    };
  }
}
