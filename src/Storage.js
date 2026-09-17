export class ConfigStorage {
  constructor(options = {}) {
    this.STORAGE_KEY = options.key || 'battery_saver_app_data';
    this.DB_NAME = options.dbName || 'BatterySaverDB';
    this.DB_VERSION = options.dbVersion || 1;
    this.STORE_NAME = 'telemetry_history';
    
    this.defaults = {
      saverMode: false,
      amoledMode: true,
      fpsCap: false,
      taskLimit: true,
      autoSaver: true,
      samples: [],
      apiEndpoint: '',
      cloudSync: false,
      maxHistoryLimit: 200,
      syncInterval: 60000,
      lastUpdated: null
    };

    this.db = null;
    this._initIndexedDB();
  }

  _initIndexedDB() {
    if (!('indexedDB' in window)) return;

    try {
      const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(this.STORE_NAME)) {
          const store = db.createObjectStore(this.STORE_NAME, { keyPath: 'timestamp' });
          store.createIndex('level', 'level', { unique: false });
          store.createIndex('charging', 'charging', { unique: false });
        }
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
      };

      request.onerror = () => {
        this.db = null;
      };
    } catch (e) {
      this.db = null;
    }
  }

  load() {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      if (!raw) return { ...this.defaults };

      const parsed = JSON.parse(raw);
      return this._validateAndMigrate({ ...this.defaults, ...parsed });
    } catch (e) {
      return { ...this.defaults };
    }
  }

  save(config) {
    try {
      const updatedConfig = {
        ...config,
        lastUpdated: Date.now()
      };

      if (updatedConfig.samples && updatedConfig.samples.length > updatedConfig.maxHistoryLimit) {
        updatedConfig.samples = updatedConfig.samples.slice(-updatedConfig.maxHistoryLimit);
      }

      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(updatedConfig));
      this._persistToIndexedDB(updatedConfig.samples);
      return true;
    } catch (e) {
      return false;
    }
  }

  _persistToIndexedDB(samples = []) {
    if (!this.db || !Array.isArray(samples) || samples.length === 0) return;

    try {
      const transaction = this.db.transaction([this.STORE_NAME], 'readwrite');
      const store = transaction.objectStore(this.STORE_NAME);

      samples.forEach(sample => {
        if (sample && sample.timestamp) {
          store.put(sample);
        }
      });
    } catch (e) {
    }
  }

  async fetchIndexedDBHistory(limit = 100) {
    return new Promise((resolve) => {
      if (!this.db) {
        resolve([]);
        return;
      }

      try {
        const transaction = this.db.transaction([this.STORE_NAME], 'readonly');
        const store = transaction.objectStore(this.STORE_NAME);
        const request = store.getAll();

        request.onsuccess = () => {
          const results = request.result || [];
          resolve(results.slice(-limit));
        };

        request.onerror = () => resolve([]);
      } catch (e) {
        resolve([]);
      }
    });
  }

  exportBackup() {
    const config = this.load();
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(config, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `battery_saver_backup_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  }

  async importBackup(jsonString) {
    try {
      const parsed = JSON.parse(jsonString);
      const validated = this._validateAndMigrate(parsed);
      this.save(validated);
      return { success: true, config: validated };
    } catch (e) {
      return { success: false, reason: 'Invalid JSON format' };
    }
  }

  _validateAndMigrate(config) {
    if (typeof config.saverMode !== 'boolean') config.saverMode = this.defaults.saverMode;
    if (typeof config.amoledMode !== 'boolean') config.amoledMode = this.defaults.amoledMode;
    if (typeof config.fpsCap !== 'boolean') config.fpsCap = this.defaults.fpsCap;
    if (typeof config.taskLimit !== 'boolean') config.taskLimit = this.defaults.taskLimit;
    if (typeof config.autoSaver !== 'boolean') config.autoSaver = this.defaults.autoSaver;
    if (!Array.isArray(config.samples)) config.samples = [];

    return config;
  }

  clear() {
    try {
      localStorage.removeItem(this.STORAGE_KEY);
      this._clearIndexedDB();
      return true;
    } catch (e) {
      return false;
    }
  }

  _clearIndexedDB() {
    if (!this.db) return;

    try {
      const transaction = this.db.transaction([this.STORE_NAME], 'readwrite');
      const store = transaction.objectStore(this.STORE_NAME);
      store.clear();
    } catch (e) {
    }
  }
}
