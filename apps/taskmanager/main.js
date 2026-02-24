WebOS.registerApp({
    id: "taskmanager",
    get name() { return window.I18n.t('taskmanager.title'); },
    icon: "📊",
    version: "2.3.1",
    manifest: {
        get name() { return window.I18n.t('taskmanager.title'); },
        icon: "📊",
        permissions: ["notifications", "system.manage"]
    },
    width: "400px",
    height: "500px",
    mount(container, api) {
        this.container = container;
        this.api = api;
        container.innerHTML = `
            <div class="task-manager">
                <div class="tm-sysinfo">
                    <span>OS(KO) v${api.system.VERSION}</span>
                    <span class="tm-sys-uptime"></span>
                    <button class="tm-kill-all-btn">${window.I18n.t('menu.close_all')}</button>
                </div>
                <div class="tm-header">
                    <span>${window.I18n.t('taskmanager.app')}</span>
                    <span>${window.I18n.t('taskmanager.status')}</span>
                    <span>${window.I18n.t('taskmanager.memory')}</span>
                    <span>${window.I18n.t('taskmanager.dom')}</span>
                    <span>${window.I18n.t('taskmanager.action')}</span>
                </div>
                <div class="tm-list"></div>
            </div>
        `;
        const list = container.querySelector('.tm-list');
        const killAllBtn = container.querySelector('.tm-kill-all-btn');
        killAllBtn.onclick = () => {
            api.ui.confirm(window.I18n.t('dialog.close_all_confirm'), async (confirmed) => {
                if (confirmed) {
                    const processes = await api.system.getProcesses();
                    processes.forEach(p => {
                        if (p.appId !== 'taskmanager') api.system.killApp(p.appId);
                    });
                    refresh();
                }
            });
        };
        const refresh = async () => {
            const processes = await api.system.getProcesses();
            const existingAppIds = new Set(processes.map(p => p.appId));
            const items = Array.from(list.children);
            items.forEach(item => {
                if (!existingAppIds.has(item.dataset.id)) item.remove();
            });
            processes.forEach(p => {
                let item = list.querySelector(`.tm-item[data-id="${p.appId}"]`);
                if (!item) {
                    item = document.createElement('div');
                    item.className = 'tm-item';
                    item.dataset.id = p.appId;
                    item.innerHTML = `
                        <span class="tm-name"></span>
                        <span class="tm-uptime"></span>
                        <span class="tm-storage"></span>
                        <span class="tm-nodes"></span>
                        <button class="tm-kill-btn">Kill</button>
                    `;
                    const killBtn = item.querySelector('.tm-kill-btn');
                    if (p.appId === 'taskmanager') {
                        killBtn.disabled = true;
                        killBtn.innerText = '—';
                    } else {
                        killBtn.onclick = () => {
                            api.system.killApp(p.appId);
                            refresh();
                        };
                    }
                    list.appendChild(item);
                }
                const nameEl = item.querySelector('.tm-name');
                const uptimeEl = item.querySelector('.tm-uptime');
                const storageEl = item.querySelector('.tm-storage');
                const nodesEl = item.querySelector('.tm-nodes');
                if (nameEl.innerText !== p.name) nameEl.innerText = p.name;
                if (uptimeEl.innerText !== p.uptime) {
                    const secs = parseInt(p.uptime);
                    if (secs < 60) uptimeEl.innerText = `${secs}s`;
                    else uptimeEl.innerText = `${Math.floor(secs / 60)}m ${secs % 60}s`;
                }
                if (storageEl.innerText !== p.storage.split(' / ')[0]) storageEl.innerText = p.storage.split(' / ')[0];
                if (nodesEl.innerText !== String(p.nodes)) nodesEl.innerText = p.nodes;
            });

            const sysUptime = container.querySelector('.tm-sys-uptime');
            if (sysUptime) {
                const totalUptime = Math.floor((Date.now() - (api.system.START_TIME || Date.now())) / 1000);
                if (totalUptime < 60) sysUptime.innerText = `${window.I18n.t('taskmanager.uptime')}: ${totalUptime}s`;
                else if (totalUptime < 3600) sysUptime.innerText = `${window.I18n.t('taskmanager.uptime')}: ${Math.floor(totalUptime / 60)}m ${totalUptime % 60}s`;
                else sysUptime.innerText = `${window.I18n.t('taskmanager.uptime')}: ${Math.floor(totalUptime / 3600)}h ${Math.floor((totalUptime % 3600) / 60)}m`;
            }
        };
        this._refreshInterval = api.system.setInterval(refresh, 2000);
        refresh();
    },
    unmount() {
        if (this._refreshInterval) {
            this.api.system.clearInterval(this._refreshInterval);
            this._refreshInterval = null;
        }
        this.container = null;
        this.api = null;
    }
});
