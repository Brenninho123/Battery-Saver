export class GametimeOverlay {
  constructor(options = {}) {
    this.visible = options.visible ?? true;
    this.position = options.position || 'top-right';
    this.container = null;
    this.levelElem = null;
    this.iconFillElem = null;
    this.dragOffset = { x: 0, y: 0 };
    this.isDragging = false;
  }

  init() {
    if (document.getElementById('gametime-overlay')) {
      this.container = document.getElementById('gametime-overlay');
      return;
    }

    this.createDom();
    this.bindDragEvents();
  }

  createDom() {
    const overlay = document.createElement('div');
    overlay.id = 'gametime-overlay';
    overlay.className = `gametime-overlay ${this.position}`;
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

    this.injectStyles();
  }

  injectStyles() {
    if (document.getElementById('gametime-styles')) return;

    const style = document.createElement('style');
    style.id = 'gametime-styles';
    style.textContent = `
      .gametime-overlay {
        position: fixed;
        z-index: 9999;
        display: flex;
        align-items: center;
        padding: 6px 12px;
        background: rgba(10, 10, 12, 0.85);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 20px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
        cursor: grab;
        touch-action: none;
        transition: opacity 0.3s ease, transform 0.2s ease;
      }

      .gametime-overlay:active {
        cursor: grabbing;
        transform: scale(1.05);
      }

      .gametime-overlay.hidden {
        display: none !important;
      }

      .gametime-overlay.top-right {
        top: 16px;
        right: 16px;
      }

      .gametime-content {
        display: flex;
        align-items: center;
        gap: 8px;
        pointer-events: none;
      }

      .gametime-battery-icon {
        width: 22px;
        height: 11px;
        border: 1.5px solid #ffffff;
        border-radius: 3px;
        padding: 1px;
        position: relative;
        display: flex;
        align-items: center;
      }

      .gametime-battery-icon::after {
        content: "";
        position: absolute;
        right: -3.5px;
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
        border-radius: 1px;
        transition: width 0.4s ease, background-color 0.4s ease;
      }

      .gametime-text {
        font-size: 0.75rem;
        font-weight: 800;
        font-family: -apple-system, BlinkMacSystemFont, "SF Mono", monospace;
        color: #ffffff;
        letter-spacing: -0.5px;
      }
    `;
    document.head.appendChild(style);
  }

  update(telemetry) {
    if (!this.container || !telemetry) return;

    const level = telemetry.level ?? 100;
    if (this.levelElem) this.levelElem.textContent = `${level}%`;

    if (this.iconFillElem) {
      this.iconFillElem.style.width = `${level}%`;

      if (level <= 20) {
        this.iconFillElem.style.backgroundColor = 'var(--danger, #ff3b30)';
      } else if (level <= 45) {
        this.iconFillElem.style.backgroundColor = 'var(--warning, #ffcc00)';
      } else {
        this.iconFillElem.style.backgroundColor = 'var(--accent, #34c759)';
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

  bindDragEvents() {
    if (!this.container) return;

    const onStart = (e) => {
      this.isDragging = true;
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;

      const rect = this.container.getBoundingClientRect();
      this.dragOffset.x = clientX - rect.left;
      this.dragOffset.y = clientY - rect.top;

      this.container.style.right = 'auto';
      this.container.style.bottom = 'auto';
    };

    const onMove = (e) => {
      if (!this.isDragging) return;
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;

      const x = clientX - this.dragOffset.x;
      const y = clientY - this.dragOffset.y;

      this.container.style.left = `${Math.max(8, Math.min(window.innerWidth - 80, x))}px`;
      this.container.style.top = `${Math.max(8, Math.min(window.innerHeight - 40, y))}px`;
    };

    const onEnd = () => {
      this.isDragging = false;
    };

    this.container.addEventListener('mousedown', onStart);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);

    this.container.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onEnd);
  }
}
