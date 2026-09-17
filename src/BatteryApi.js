export class BatteryApi {
  constructor(endpoint = '') {
    this.endpoint = endpoint;
  }

  setEndpoint(endpoint) {
    this.endpoint = endpoint;
  }

  async syncTelemetry(payload) {
    if (!this.endpoint) {
      return { success: false, reason: 'No API Endpoint Configured' };
    }

    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Client-Platform': payload.platform.platformName
        },
        body: JSON.stringify({
          clientTimestamp: Date.now(),
          battery: payload.telemetry,
          diagnostics: payload.wearAnalysis,
          governorState: {
            ecoMode: payload.isEcoMode,
            fpsCap: payload.isFPSThrottled,
            threadThrottle: payload.isThreadThrottled
          }
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP Error: ${response.status}`);
      }

      const data = await response.json();
      return { success: true, response: data };
    } catch (error) {
      return { success: false, reason: error.message };
    }
  }

  async fetchOptimizationProfile(deviceModel = 'default') {
    if (!this.endpoint) {
      return null;
    }

    try {
      const response = await fetch(`${this.endpoint}/profile?device=${encodeURIComponent(deviceModel)}`);
      if (!response.ok) return null;
      return await response.json();
    } catch (e) {
      return null;
    }
  }
}
