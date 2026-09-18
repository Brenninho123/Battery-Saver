export class OfflineManager {
  constructor(options = {}) {
    this.swPath = options.swPath || './sw.js';
    this.isOnline = navigator.onLine;
    this.swRegistration = null;
    this.listeners = new Set();

    this.init();
  }

  async init() {
    this.bindNetworkEvents();

    if ('serviceWorker' in navigator) {
      try {
        this.swRegistration = await navigator.serviceWorker.register(this.swPath);
        this.listenServiceWorkerUpdates();
      } catch (e) {
      }
    }
  }

  bindNetworkEvents() {
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.notifyState();
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
      this.notifyState();
    });
  }

  listenServiceWorkerUpdates() {
    if (!this.swRegistration) return;

    this.swRegistration.addEventListener('updatefound', () => {
      const newWorker = this.swRegistration.installing;
      if (!newWorker) return;

      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          this.notifyUpdateAvailable();
        }
      });
    });
  }

  forceWorkerUpdate() {
    if (this.swRegistration && this.swRegistration.waiting) {
      this.swRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
  }

  async getCacheStorageSize() {
    if (!('caches' in window)) return '0 B';

    try {
      const keys = await caches.keys();
      let totalBytes = 0;

      for (const key of keys) {
        const cache = await caches.open(key);
        const requests = await cache.keys();
        for (const req of requests) {
          const res = await cache.match(req);
          if (res) {
            const blob = await res.blob();
            totalBytes += blob.size;
          }
        }
      }

      if (totalBytes < 1024) return `${totalBytes} B`;
      if (totalBytes < 1024 * 1024) return `${(totalBytes / 1024).toFixed(1)} KB`;
      return `${(totalBytes / (1024 * 1024)).toFixed(1)} MB`;
    } catch (e) {
      return 'N/A';
    }
  }

  async purgeAllCaches() {
    if (!('caches' in window)) return false;

    try {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
      return true;
    } catch (e) {
      return false;
    }
  }

  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  notifyState() {
    const state = {
      isOnline: this.isOnline,
      hasServiceWorker: !!this.swRegistration
    };
    this.listeners.forEach(fn => fn(state));
  }

  notifyUpdateAvailable() {
    window.dispatchEvent(new CustomEvent('batterysaver:sw-update-available'));
  }
}
