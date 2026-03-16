WebOS.registerApp({
    id: "taskmanager",
    get name() { return window.I18n.t('taskmanager.title'); },
    icon: "📊",
    version: "4.1.14",
    manifest: {
        get name() { return window.I18n.t('taskmanager.title'); },
        icon: "📊",
        permissions: ["notifications", "system.manage"]
    },
    width: "500px",
    height: "550px",
    async mount(container, api) {
        this.container = container;
        this.api = api;
        container.innerHTML = `
            <div class="task-manager">
                <div class="tm-sysinfo">
                    <div class="tm-sys-header">
                        <span class="tm-os-version">OS(KO) v${api.system.VERSION}</span>
                        <span class="tm-sys-uptime"></span>
                    </div>
                    <div class="tm-storage-info">
                        <div class="tm-storage-label">
                            <span>${window.I18n.t('taskmanager.total_storage')}</span>
                            <span class="tm-storage-value">0 / 10 MB</span>
                        </div>
                        <div class="tm-storage-bar"><div class="tm-storage-fill"></div></div>
                    </div>
                    <button class="tm-kill-all-btn">${window.I18n.t('menu.close_all')}</button>
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
        const sysUptimeEl = container.querySelector('.tm-sys-uptime');
        const storageValueEl = container.querySelector('.tm-storage-value');
        const storageFillEl = container.querySelector('.tm-storage-fill');
        const refresh = async () => {
            const processes = await api.system.getProcesses();
            const activePids = new Set(processes.map(p => p.pid));
            Array.from(list.children).forEach(row => {
                if (!activePids.has(Number(row.dataset.pid))) row.remove();
            });
            processes.forEach(p => {
                let row = list.querySelector(`.tm-row[data-pid="${p.pid}"]`);
                if (!row) {
                    row = document.createElement('div');
                    row.className = 'tm-row';
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
            const totalUptime = Math.floor((Date.now() - (api.system.START_TIME || Date.now())) / 1000);
            const s = window.I18n.t('taskmanager.unit_s');
            const m = window.I18n.t('taskmanager.unit_m');
            const h = window.I18n.t('taskmanager.unit_h');
            sysUptimeEl.innerText = `${window.I18n.t('taskmanager.uptime')}: ${totalUptime < 3600 ? Math.floor(totalUptime/60)+m+' '+(totalUptime%60)+s : Math.floor(totalUptime/3600)+h+' '+Math.floor((totalUptime%3600)/60)+m}`;
            const totalUsage = api.system.storage.getTotalUsage ? api.system.storage.getTotalUsage() : 0;
            const quota = 10 * 1024 * 1024;
            const percent = Math.min(100, (totalUsage / quota) * 100);
            storageValueEl.innerText = `${(totalUsage / (1024 * 1024)).toFixed(2)} / 10.00 MB`;
            storageFillEl.style.width = percent + '%';
            storageFillEl.style.background = percent > 90 ? '#ef4444' : (percent > 70 ? '#f59e0b' : 'var(--accent)');
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
