WebOS.registerApp({
    id: "settings",
    name: "Settings",
    icon: "⚙️",
    version: "1.0.1",
    manifest: {
        name: "Settings",
        icon: "⚙️",
        permissions: ["notifications", "fs.read", "fs.write"]
    },
    width: "420px",
    height: "480px",
    async mount(container, api) {
        this.container = container;
        this.api = api;
        const presets = [
            { name: 'Default', val: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)' },
            { name: 'Sunset', val: 'linear-gradient(135deg, #FF5F6D 0%, #FFC371 100%)' },
            { name: 'Ocean', val: 'linear-gradient(135deg, #2193b0 0%, #6dd5ed 100%)' },
            { name: 'Midnight', val: 'linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)' },
            { name: 'Emerald', val: 'linear-gradient(135deg, #1D976C 0%, #93F9B9 100%)' },
            { name: 'Cyberpunk', val: 'linear-gradient(135deg, #000428 0%, #004e92 100%)' }
        ];
        container.innerHTML = `
            <div class="settings-app">
                <div class="settings-section">
                    <h3>Tapeta i kolory</h3>
                    <div class="color-presets">
                        ${presets.map(p => `<div class="preset-btn" data-val="${p.val}" title="${p.name}" style="background: ${p.val}; background-size: cover;"></div>`).join('')}
                    </div>
                </div>
                <div class="settings-section">
                    <h3>Styl systemu</h3>
                    <div class="theme-toggle-group">
                        <button class="theme-btn" data-theme="default">Jasny / przezroczysty</button>
                        <button class="theme-btn" data-theme="dark">Ciemny</button>
                    </div>
                </div>
                <div class="settings-section">
                    <h3>O systemie</h3>
                    <div class="system-box">
                        <div class="sys-info">
                            <div class="sys-label">Aplikacje</div>
                            <div class="sys-val proc-count">0</div>
                        </div>
                        <div class="sys-info">
                            <div class="sys-label">Status jądra</div>
                            <div class="sys-val sys-ok">OK</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        const currentBackground = await api.fs.read('/home/user/settings/wallpaper.txt');
        container.querySelectorAll('.preset-btn').forEach(btn => {
            if (btn.dataset.val === currentBackground) btn.classList.add('active');
            btn.onclick = () => {
                container.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const val = btn.dataset.val;
                api.system.setWallpaper(val);
                api.notifications.show({ title: 'System', message: 'Zmieniono tapetę.' });
            };
        });
        const currentTheme = (await api.fs.read('/home/user/settings/theme.txt')) || 'default';
        container.querySelectorAll('.theme-btn').forEach(btn => {
            if (btn.dataset.theme === currentTheme) btn.classList.add('active');
            btn.onclick = () => {
                container.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const theme = btn.dataset.theme;
                api.system.setTheme(theme);
                api.notifications.show({ title: 'System', message: `Ustawiono motyw: ${theme === 'dark' ? 'ciemny' : 'jasny'}` });
            };
        });
        const refreshStats = async () => {
            const procCountEl = container.querySelector('.proc-count');
            if (procCountEl) {
                const procs = await api.system.getProcesses();
                procCountEl.innerText = procs.length;
            }
        };
        const syncUI = async (eventData) => {
            const path = eventData?.data?.path;
            if (path === '/home/user/settings/wallpaper.txt') {
                const newVal = await api.fs.read('/home/user/settings/wallpaper.txt');
                container.querySelectorAll('.preset-btn').forEach(btn => {
                    btn.classList.toggle('active', btn.dataset.val === newVal);
                });
            }
        };
        this.statsInterval = api.system.setInterval(refreshStats, 2000);
        this._watcher = api.system.subscribe('vfs:changed', syncUI);
        refreshStats();
    },
    unmount() {
        if (this.statsInterval) {
            this.api.system.clearInterval(this.statsInterval);
            this.statsInterval = null;
        }
        if (this._watcher) {
            this.api.system.unsubscribe('vfs:changed', this._watcher);
            this._watcher = null;
        }
        this.container = null;
        this.api = null;
    }
});
