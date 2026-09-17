export class ConfigStorage {
  constructor(key = 'battery_saver_app_data') {
    this.STORAGE_KEY = key;
    this.defaults = {
      saverMode: false,
      amoledMode: true,
      fpsCap: false,
      taskLimit: true,
      autoSaver: true,
      samples: []
    };
  }

  load() {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      return raw ? { ...this.defaults, ...JSON.parse(raw) } : { ...this.defaults };
    } catch (e) {
      return { ...this.defaults };
    }
  }

  save(config) {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(config));
      return true;
    } catch (e) {
      return false;
    }
  }

  clear() {
    try {
      localStorage.removeItem(this.STORAGE_KEY);
      return true;
    } catch (e) {
      return false;
    }
  }
}
