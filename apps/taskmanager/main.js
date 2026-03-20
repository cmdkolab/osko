WebOS.registerApp({
    id: "taskmanager",
    get name() { return window.I18n.t('taskmanager.title'); },
    icon: "📊",
    version: "4.2.0",
    manifest: {
        get name() { return window.I18n.t('taskmanager.title'); },
        icon: "📊",
        permissions: ["notifications", "system.manage"]
    },
    width: "550px",
    height: "600px",
    async mount(container, api) {
        this.container = container;
        this.api = api;
        this.history = []; // For sparkline
        this.filter = '';
        container.innerHTML = `
            <div class="task-manager">
                <div class="tm-sysinfo">
                    <div class="tm-metrics">
                        <div class="tm-storage-info">
                            <div class="tm-storage-label">
                                <span>${window.I18n.t('taskmanager.total_storage')}</span>
                                <span class="tm-storage-value">0 / 10 MB</span>
                            </div>
                            <div class="tm-storage-bar"><div class="tm-storage-fill"></div></div>
                        </div>
                        <div class="tm-sparkline-container">
                            <canvas class="tm-sparkline-canvas"></canvas>
                        </div>
                    </div>
                    <div class="tm-controls">
                        <input type="text" class="tm-search" placeholder="${window.I18n.t('system.search_placeholder')}">
                        <button class="tm-kill-all-btn">${window.I18n.t('menu.close_all')}</button>
                    </div>
                </div>
                <div class="tm-table">
                    <div class="tm-header">
                        <span>${window.I18n.t('taskmanager.app')}</span>
                        <span class="text-center">${window.I18n.t('taskmanager.pid')}</span>
                        <span class="text-right">${window.I18n.t('taskmanager.uptime')}</span>
                        <span class="text-right">${window.I18n.t('taskmanager.storage')}</span>
                        <span class="text-center">${window.I18n.t('taskmanager.action')}</span>
                    </div>
                    <div class="tm-list"></div>
                </div>
            </div>
        `;
        const list = container.querySelector('.tm-list');
        const storageValueEl = container.querySelector('.tm-storage-value');
        const storageFillEl = container.querySelector('.tm-storage-fill');
        const searchInput = container.querySelector('.tm-search');
        const canvas = container.querySelector('.tm-sparkline-canvas');
        const ctx = canvas.getContext('2d');

        searchInput.oninput = (e) => {
            this.filter = e.target.value.toLowerCase();
            refresh();
        };

        const drawSparkline = (usage) => {
            this.history.push(usage);
            if (this.history.length > 50) this.history.shift();
            
            const w = canvas.width = canvas.offsetWidth * window.devicePixelRatio;
            const h = canvas.height = canvas.offsetHeight * window.devicePixelRatio;
            ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
            ctx.clearRect(0, 0, w, h);
            
            if (this.history.length < 2) return;
            
            const max = 10 * 1024 * 1024;
            const points = this.history.map((v, i) => ({
                x: (i / 49) * (canvas.offsetWidth),
                y: canvas.offsetHeight - (v / max) * canvas.offsetHeight
            }));

            ctx.beginPath();
            ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent');
            ctx.lineWidth = 2;
            ctx.lineJoin = 'round';
            ctx.moveTo(points[0].x, points[0].y);
            for(let i=1; i<points.length; i++) ctx.lineTo(points[i].x, points[i].y);
            ctx.stroke();

            // Area fill
            ctx.lineTo(points[points.length-1].x, canvas.offsetHeight);
            ctx.lineTo(points[0].x, canvas.offsetHeight);
            const gradient = ctx.createLinearGradient(0, 0, 0, canvas.offsetHeight);
            const accentRGB = getComputedStyle(document.documentElement).getPropertyValue('--accent-rgb').trim() || '59, 130, 246';
            gradient.addColorStop(0, `rgba(${accentRGB}, 0.2)`);
            gradient.addColorStop(1, `rgba(${accentRGB}, 0)`);
            ctx.fillStyle = gradient;
            ctx.fill();
        };

        const refresh = async () => {
            const processes = await api.system.getProcesses();
            const filtered = processes.filter(p => 
                (p.name || p.appId).toLowerCase().includes(this.filter) || 
                String(p.pid).includes(this.filter)
            );
            
            const activePids = new Set(filtered.map(p => p.pid));
            Array.from(list.children).forEach(row => {
                if (!activePids.has(Number(row.dataset.pid))) row.remove();
            });

            filtered.forEach(p => {
                let row = list.querySelector(`.tm-row[data-pid="${p.pid}"]`);
                if (!row) {
                    row = document.createElement('div');
                    row.className = 'tm-row reveal';
                    row.dataset.pid = p.pid;
                    row.innerHTML = `
                        <div class="tm-app-info">
                            <span class="tm-icon">${p.icon || '❓'}</span>
                            <span class="tm-name">${p.name || p.appId}</span>
                        </div>
                        <div class="tm-pid text-center">${p.pid}</div>
                        <div class="tm-uptime text-right"></div>
                        <div class="tm-mem text-right"></div>
                        <div class="tm-actions text-center">
                            <button class="tm-kill-btn" ${p.appId === 'taskmanager' ? 'disabled' : ''}>
                                ${window.I18n.t('taskmanager.kill')}
                            </button>
                        </div>
                    `;
                    const killBtn = row.querySelector('.tm-kill-btn');
                    if (p.appId !== 'taskmanager') {
                        killBtn.onclick = () => {
                            api.system.killApp(p.appId, p.pid);
                            refresh();
                        };
                    }
                    list.appendChild(row);
                }
                const uptimeEl = row.querySelector('.tm-uptime');
                const memEl = row.querySelector('.tm-mem');
                const uptime = Math.floor((Date.now() - p.startTime) / 1000);
                const s = window.I18n.t('taskmanager.unit_s');
                const m = window.I18n.t('taskmanager.unit_m');
                uptimeEl.innerText = uptime < 60 ? `${uptime}${s}` : `${Math.floor(uptime/60)}${m} ${uptime%60}${s}`;
                const appUsage = api.system.storage.calculateUsage ? api.system.storage.calculateUsage(p.appId) : 0;
                memEl.innerText = (appUsage / 1024).toFixed(1) + ' KB';
            });

            const totalUsage = api.system.storage.getTotalUsage ? api.system.storage.getTotalUsage() : 0;
            const quota = 10 * 1024 * 1024;
            const percent = Math.min(100, (totalUsage / quota) * 100);
            storageValueEl.innerText = `${(totalUsage / (1024 * 1024)).toFixed(2)} / 10.00 MB`;
            storageFillEl.style.width = percent + '%';
            storageFillEl.style.background = percent > 90 ? '#ef4444' : (percent > 70 ? '#ff9f0a' : 'var(--accent)');
            drawSparkline(totalUsage);
        };

        const killAllBtn = container.querySelector('.tm-kill-all-btn');
        killAllBtn.onclick = () => {
            api.ui.confirm(window.I18n.t('dialog.close_all_confirm'), async (ok) => {
                if (ok) {
                    const procs = await api.system.getProcesses();
                    for(const p of procs) {
                        if (p.appId !== 'taskmanager') await api.system.killApp(p.appId, p.pid);
                    }
                    refresh();
                }
            });
        };
        this._interval = api.system.setInterval(refresh, 1000);
        refresh();
        this._i18nListener = () => this.mount(container, api);
        window.addEventListener('i18n:changed', this._i18nListener);
    },
    unmount() {
        if (this._interval) this.api.system.clearInterval(this._interval);
        window.removeEventListener('i18n:changed', this._i18nListener);
    }
});
