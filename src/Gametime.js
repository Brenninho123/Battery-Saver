export class GametimeOverlay {
  constructor(options = {}) {
    this.visible = options.visible ?? true;
    this.positionKey = 'gametime_widget_pos';
    this.container = null;
    this.levelElem = null;
    this.iconFillElem = null;
    this.dragOffset = { x: 0, y: 0 };
    this.isDragging = false;
    this.hasMoved = false;
    this.collapsed = false;
    this.currentLevel = 100;
  }

  init() {
    if (document.getElementById('gametime-overlay')) {
      this.container = document.getElementById('gametime-overlay');
      return;
    }

    this.createDom();
    this.injectStyles();
    this.loadSavedPosition();
    this.bindEvents();
  }

  createDom() {
    const overlay = document.createElement('div');
    overlay.id = 'gametime-overlay';
    overlay.className = 'gametime-overlay';
    if (!this.visible) overlay.classList.add('hidden');

    overlay.innerHTML = `
      <div class="gametime-content">
        <div class="gametime-battery-icon">
          <div class="gametime-battery-level" id="gametime-fill"></div>
        </div>
        <span class="gametime-text" id="gametime-text">--%</span>
      </div>
    `;

    document.body.appendChild(overlay);
    this.container = overlay;
    this.levelElem = document.getElementById('gametime-text');
    this.iconFillElem = document.getElementById('gametime-fill');
  }

  injectStyles() {
    if (document.getElementById('gametime-styles')) return;

    const style = document.createElement('style');
    style.id = 'gametime-styles';
    style.textContent = `
      .gametime-overlay {
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 99999;
        display: flex;
        align-items: center;
        padding: 6px 12px;
        background: rgba(10, 10, 14, 0.88);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 20px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
        cursor: grab;
        touch-action: none;
        user-select: none;
        transition: opacity 0.3s ease, transform 0.15s ease, background-color 0.3s ease;
      }

      .gametime-overlay:active {
        cursor: grabbing;
        transform: scale(1.04);
      }

      .gametime-overlay.hidden {
        display: none !important;
      }

      .gametime-overlay.collapsed .gametime-text {
        display: none;
      }

      .gametime-overlay.critical {
        border-color: rgba(255, 59, 48, 0.5);
        animation: gametime-pulse 1.8s infinite;
      }

      .gametime-content {
        display: flex;
        align-items: center;
        gap: 8px;
        pointer-events: none;
      }

      .gametime-battery-icon {
        width: 24px;
        height: 12px;
        border: 1.5px solid #ffffff;
        border-radius: 3.5px;
        padding: 1px;
        position: relative;
        display: flex;
        align-items: center;
      }

      .gametime-battery-icon::after {
        content: "";
        position: absolute;
        right: -4px;
        top: 2px;
        width: 2px;
        height: 5px;
        background: #ffffff;
        border-radius: 0 1px 1px 0;
      }

      .gametime-battery-level {
        height: 100%;
        width: 100%;
        background-color: var(--accent, #34c759);
        border-radius: 1.5px;
        transition: width 0.4s ease, background-color 0.4s ease;
      }

      .gametime-text {
        font-size: 0.75rem;
        font-weight: 800;
        font-family: -apple-system, BlinkMacSystemFont, "SF Mono", monospace;
        color: #ffffff;
        letter-spacing: -0.5px;
      }

      @keyframes gametime-pulse {
        0% { box-shadow: 0 0 0 0 rgba(255, 59, 48, 0.4); }
        70% { box-shadow: 0 0 0 10px rgba(255, 59, 48, 0); }
        100% { box-shadow: 0 0 0 0 rgba(255, 59, 48, 0); }
      }
    `;
    document.head.appendChild(style);
  }

  update(telemetry) {
    if (!this.container || !telemetry) return;

    const level = telemetry.level ?? 100;
    this.currentLevel = level;

    if (this.levelElem) {
      this.levelElem.textContent = `${level}%`;
    }

    if (this.iconFillElem) {
      this.iconFillElem.style.width = `${level}%`;

      if (level <= 20) {
        this.iconFillElem.style.backgroundColor = 'var(--danger, #ff3b30)';
        this.container.classList.add('critical');
      } else if (level <= 45) {
        this.iconFillElem.style.backgroundColor = 'var(--warning, #ffcc00)';
        this.container.classList.remove('critical');
      } else {
        this.iconFillElem.style.backgroundColor = 'var(--accent, #34c759)';
        this.container.classList.remove('critical');
      }
    }
  }

  setVisible(visible) {
    this.visible = visible;
    if (!this.container) return;
    if (visible) {
      this.container.classList.remove('hidden');
    } else {
      this.container.classList.add('hidden');
    }
  }

  loadSavedPosition() {
    try {
      const saved = localStorage.getItem(this.positionKey);
      if (saved) {
        const { x, y } = JSON.parse(saved);
        this.setPosition(x, y);
      }
    } catch (e) {}
  }

  savePosition(x, y) {
    try {
      localStorage.setItem(this.positionKey, JSON.stringify({ x, y }));
    } catch (e) {}
  }

  setPosition(x, y) {
    if (!this.container) return;
    const maxX = window.innerWidth - this.container.offsetWidth - 10;
    const maxY = window.innerHeight - this.container.offsetHeight - 10;

    const clampedX = Math.max(10, Math.min(maxX, x));
    const clampedY = Math.max(10, Math.min(maxY, y));

    this.container.style.left = `${clampedX}px`;
    this.container.style.top = `${clampedY}px`;
    this.container.style.right = 'auto';
  }

  bindEvents() {
    if (!this.container) return;

    const onStart = (e) => {
      this.isDragging = true;
      this.hasMoved = false;
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;

      const rect = this.container.getBoundingClientRect();
      this.dragOffset.x = clientX - rect.left;
      this.dragOffset.y = clientY - rect.top;
    };

    const onMove = (e) => {
      if (!this.isDragging) return;
      this.hasMoved = true;
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;

      const x = clientX - this.dragOffset.x;
      const y = clientY - this.dragOffset.y;

      this.setPosition(x, y);
    };

    const onEnd = () => {
      if (this.isDragging) {
        this.isDragging = false;
        const rect = this.container.getBoundingClientRect();
        this.savePosition(rect.left, rect.top);

        if (!this.hasMoved) {
          this.toggleCollapse();
        }
      }
    };

    this.container.addEventListener('mousedown', onStart);
    window.addEventListener('mousemove', onMove, { passive: true });
    window.addEventListener('mouseup', onEnd);

    this.container.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onEnd);
  }

  toggleCollapse() {
    this.collapsed = !this.collapsed;
    if (this.collapsed) {
      this.container.classList.add('collapsed');
    } else {
      this.container.classList.remove('collapsed');
    }
  }
}
