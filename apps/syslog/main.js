WebOS.registerApp({
    id: "syslog",
    name: "System Log",
    icon: "📜",
    version: "2.3.0",
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
            if (!logs) {
                viewer.innerHTML = 'Brak logów.';
                return;
            }
            const lines = logs.split('\n');
            const fragment = document.createElement('div');
            // Optimizing: only parse the last 500 lines to avoid lagging the UI
            const renderLines = lines.slice(-500);
            renderLines.forEach(line => {
                if (!line) return;
                const entry = document.createElement('div');
                entry.className = 'log-entry';

                const match = line.match(/^\[(.*?)\] \[(.*?)\] \[([A-Z]+)\] \[(.*?)\] (.*)$/);
                if (match) {
                    const timeEl = document.createElement('span');
                    timeEl.className = 'log-time';
                    timeEl.textContent = '[' + match[1] + ']';

                    const sessionEl = document.createElement('span');
                    sessionEl.style.color = '#a855f7';
                    sessionEl.textContent = ' [' + match[2] + ']';

                    const levelEl = document.createElement('span');
                    const level = match[3];
                    if (level === 'ERR') levelEl.className = 'log-level-err';
                    else if (level === 'INFO') levelEl.className = 'log-level-info';
                    else if (level === 'WARN') levelEl.style.color = '#fbbf24';
                    levelEl.textContent = ' [' + level + ']';

                    const sourceEl = document.createElement('span');
                    sourceEl.style.color = '#10b981';
                    sourceEl.textContent = ' [' + match[4] + '] ';

                    const msgEl = document.createElement('span');
                    msgEl.textContent = match[5];

                    entry.appendChild(timeEl);
                    entry.appendChild(sessionEl);
                    entry.appendChild(levelEl);
                    entry.appendChild(sourceEl);
                    entry.appendChild(msgEl);
                } else if (line.startsWith('[CLEARED]')) {
                    entry.className = 'log-entry log-level-info';
                    entry.textContent = line;
                } else {
                    entry.textContent = line;
                }
                fragment.appendChild(entry);
            });
            viewer.innerHTML = '';
            viewer.appendChild(fragment);
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
