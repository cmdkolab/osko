WebOS.registerApp({
    id: "taskmanager",
    name: "Task Manager",
    icon: "📊",
    version: "1.0.0",
    manifest: {
        name: "Task Manager",
        icon: "📊",
        permissions: ["notifications"]
    },
    width: "400px",
    height: "450px",
    mount(container, api) {
        this.container = container;
        this.api = api;
        container.innerHTML = `
            <div class="task-manager">
                <div class="tm-sysinfo">
                    <span>OS(KO) v${api.system.VERSION}</span>
                    <span class="tm-sys-uptime">${api.system.getUptime()}</span>
                </div>
                <div class="tm-header">
                    <span>Aplikacja</span>
                    <span>Uptime</span>
                    <span>Pliki</span>
                    <span>DOM</span>
                    <span>Akcja</span>
                </div>
                <div class="tm-list"></div>
            </div>
        `;
        const list = container.querySelector('.tm-list');
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
                            WebOS.killApp(p.appId);
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
                if (uptimeEl.innerText !== p.uptime) uptimeEl.innerText = p.uptime;
                if (storageEl.innerText !== p.storage) storageEl.innerText = p.storage;
                if (nodesEl.innerText !== String(p.nodes)) nodesEl.innerText = p.nodes;
            });
            const sysUptime = container.querySelector('.tm-sys-uptime');
            if (sysUptime) sysUptime.innerText = api.system.getUptime();
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
