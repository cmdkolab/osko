WebOS.registerApp({
    id: "settings",
    name: "Settings",
    icon: "⚙️",
    version: "2.3.0",
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
                    <h3>Dźwięk Systemu</h3>
                    <div class="theme-toggle-group">
                        <button class="sound-btn" data-sound="on">Włączony</button>
                        <button class="sound-btn" data-sound="off">Wyłączony</button>
                    </div>
                </div>
                <div class="settings-section">
                    <h3>O systemie</h3>
                    <div class="system-box">
                        <div class="sys-info">
                        <div class="sys-info">
                            <div class="sys-label">Status jądra</div>
                            <div class="sys-val sys-ok">OK</div>
                <div class="settings-section">
                    <h3>Autostart</h3>
                    <div class="autostart-list"></div>
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

        // Initialize Audio Toggle
        let currentSound = 'on';
        try {
            const rawAudio = await api.fs.read('/home/user/settings/audio.json');
            if (rawAudio) {
                const parsed = JSON.parse(rawAudio);
                currentSound = parsed.enabled ? 'on' : 'off';
            }
        } catch (e) { }

        container.querySelectorAll('.sound-btn').forEach(btn => {
            if (btn.dataset.sound === currentSound) btn.classList.add('active');
            btn.onclick = async () => {
                container.querySelectorAll('.sound-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const isEnabled = btn.dataset.sound === 'on';
                if (!(await api.fs.exists('/home/user/settings'))) {
                    await api.fs.mkdir('/home/user/settings');
                }
                await api.fs.write('/home/user/settings/audio.json', JSON.stringify({ enabled: isEnabled }));
                api.system.publish('settings:audio_changed', { enabled: isEnabled });
                if (isEnabled) {
                    try {
                        // Play a test sound to confirm turning on
                        const w = window;
                        const ae = w.WebOS && w.WebOS.audio;
                        if (ae && ae.play) ae.play('click');
                    } catch (e) { }
                }
            };
        });

        // Autostart Logic
        const autostartList = container.querySelector('.autostart-list');
        const loadAutostart = async () => {
            let startupApps = [];
            try {
                const raw = await api.fs.read('/sys/startup.json');
                startupApps = JSON.parse(raw) || [];
            } catch (e) {
                console.error('Błąd odczytu autostartu:', e);
            }

            const allApps = api.system.getAllApps();
            autostartList.innerHTML = '';

            allApps.forEach(app => {
                const isEnabled = startupApps.includes(app.id);

                const item = document.createElement('div');
                item.className = 'autostart-item';
                item.innerHTML = `
                        <div class="autostart-item-info">
                            <span class="autostart-item-icon">${app.icon}</span>
                            <span>${app.name}</span>
                        </div>
                        <input type="checkbox" class="autostart-toggle" data-appid="${app.id}" ${isEnabled ? 'checked' : ''}>
                    `;

                const toggle = item.querySelector('.autostart-toggle');
                toggle.onchange = async (e) => {
                    const checked = e.target.checked;
                    const id = e.target.dataset.appid;

                    let currentStartup = [];
                    try {
                        const raw = await api.fs.read('/sys/startup.json');
                        currentStartup = JSON.parse(raw) || [];
                    } catch (err) { }

                    if (checked && !currentStartup.includes(id)) {
                        currentStartup.push(id);
                    } else if (!checked && currentStartup.includes(id)) {
                        currentStartup = currentStartup.filter(appId => appId !== id);
                    }

                    await api.fs.write('/sys/startup.json', JSON.stringify(currentStartup));
                };

                autostartList.appendChild(item);
            });
        };

        const syncUI = async (eventData) => {
            const path = eventData?.data?.path;
            if (path === '/home/user/settings/wallpaper.txt') {
                const newVal = await api.fs.read('/home/user/settings/wallpaper.txt');
                container.querySelectorAll('.preset-btn').forEach(btn => {
                    btn.classList.toggle('active', btn.dataset.val === newVal);
                });
            } else if (path === '/home/user/settings/theme.txt') {
                const newTheme = await api.fs.read('/home/user/settings/theme.txt');
                container.querySelectorAll('.theme-btn').forEach(btn => {
                    btn.classList.toggle('active', btn.dataset.theme === newTheme);
                });
            }
        };

        this._watcher = api.system.subscribe('vfs:changed', syncUI);

        await loadAutostart();
    },
    unmount() {
        if (this._watcher) {
            this.api.system.unsubscribe('vfs:changed', this._watcher);
            this._watcher = null;
        }
        this.container = null;
        this.api = null;
    }
});
