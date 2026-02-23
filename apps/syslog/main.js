WebOS.registerApp({
    id: "syslog",
    name: "System Log",
    icon: "📜",
    version: "1.6.0",
    manifest: {
        name: "System Log",
        icon: "📜",
        permissions: ["fs.read", "fs.write", "notifications"]
    },
    width: "600px",
    height: "400px",
    mount(container, api) {
        this.api = api;
        container.innerHTML = `
            <div class="syslog-app">
                <div class="syslog-toolbar">
                    <button class="notes-btn refresh-btn">Odśwież</button>
                    <button class="notes-btn clear-btn">Wyczyść</button>
                </div>
                <div class="syslog-viewer"></div>
            </div>
        `;
        const viewer = container.querySelector('.syslog-viewer');
        const refreshBtn = container.querySelector('.refresh-btn');
        const clearBtn = container.querySelector('.clear-btn');
        clearBtn.onclick = () => {
            api.ui.confirm('Czy na pewno wyczyścić logi?', async (confirmed) => {
                if (confirmed) {
                    await api.fs.write('/var/log/syslog', '[CLEARED] ' + new Date().toLocaleString() + '\n');
                    await refresh();
                }
            });
        };
        const refresh = async () => {
            const logs = await api.fs.read('/var/log/syslog');
            viewer.innerText = logs || 'Brak logów.';
            viewer.scrollTop = viewer.scrollHeight;
        };
        refreshBtn.onclick = () => refresh();
        this._watcher = api.system.subscribe('vfs:changed', (e) => {
            const path = e?.data?.path;
            if (path === '/var/log/syslog') refresh();
        });
        refresh();
    },
    unmount() {
        if (this._watcher) {
            this.api.system.unsubscribe('vfs:changed', this._watcher);
            this._watcher = null;
        }
        this.api = null;
    }
});
