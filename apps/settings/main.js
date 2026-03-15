WebOS.registerApp({
    id: "settings",
    get name() { return window.I18n.t('settings.title'); },
    icon: "⚙️",
    version: "4.1.1",
    manifest: {
        get name() { return window.I18n.t('settings.title'); },
        icon: "⚙️",
        permissions: ["notifications", "fs.read", "fs.write", "system.manage", "system.ui"]
    },
    width: "420px",
    height: "520px",
    async mount(container, api) {
        this.container = container;
        this.api = api;
        const render = async () => {
            const presets = [
                { name: 'settings.preset_default', val: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)' },
                { name: 'settings.preset_sunset', val: 'linear-gradient(135deg, #FF5F6D 0%, #FFC371 100%)' },
                { name: 'settings.preset_ocean', val: 'linear-gradient(135deg, #2193b0 0%, #6dd5ed 100%)' },
                { name: 'settings.preset_midnight', val: 'linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)' },
                { name: 'settings.preset_emerald', val: 'linear-gradient(135deg, #1D976C 0%, #93F9B9 100%)' },
                { name: 'settings.preset_cyberpunk', val: 'linear-gradient(135deg, #000428 0%, #004e92 100%)' }
            ];
            const currentWallpaper = await api.fs.read('/home/user/settings/wallpaper.txt');
            const currentTheme = (await api.fs.read('/home/user/settings/theme.txt')) || 'default';
            let currentSound = 'on';
            try {
                const rawAudio = await api.fs.read('/home/user/settings/audio.json');
                if (rawAudio) currentSound = JSON.parse(rawAudio).enabled ? 'on' : 'off';
            } catch (e) {}
            container.innerHTML = `
                <div class="settings-app">
                    <div class="settings-section">
                        <h3>${window.I18n.t('settings.language')}</h3>
                        <div class="toggle-group">
                            <button class="lang-btn ${window.I18n.current === 'en' ? 'active' : ''}" data-lang="en">English</button>
                            <button class="lang-btn ${window.I18n.current === 'pl' ? 'active' : ''}" data-lang="pl">Polski</button>
                        </div>
                    </div>
                    <div class="settings-section">
                        <h3>${window.I18n.t('settings.tab_personalization')}</h3>
                        <div class="color-presets">
                            ${presets.map(p => `<div class="preset-btn ${currentWallpaper === p.val ? 'active' : ''}" data-val="${p.val}" title="${window.I18n.t(p.name)}" style="background: ${p.val};"></div>`).join('')}
                        </div>
                    </div>
                    <div class="settings-section">
                        <h3>${window.I18n.t('settings.tab_system')}</h3>
                        <div class="toggle-group">
                            <button class="theme-btn ${currentTheme === 'default' ? 'active' : ''}" data-theme="default">${window.I18n.t('settings.theme_light')} / Auto</button>
                            <button class="theme-btn ${currentTheme === 'dark' ? 'active' : ''}" data-theme="dark">${window.I18n.t('settings.theme_dark')}</button>
                        </div>
                    </div>
                    <div class="settings-section">
                        <h3>${window.I18n.t('settings.sound')}</h3>
                        <div class="toggle-group">
                            <button class="sound-btn ${currentSound === 'on' ? 'active' : ''}" data-sound="on">${window.I18n.t('settings.sound_on')}</button>
                            <button class="sound-btn ${currentSound === 'off' ? 'active' : ''}" data-sound="off">${window.I18n.t('settings.sound_off')}</button>
                        </div>
                    </div>
                    <div class="settings-section">
                        <h3>${window.I18n.t('settings.autostart')}</h3>
                        <p class="section-desc">${window.I18n.t('settings.autostart_desc')}</p>
                        <div class="autostart-list"></div>
                    </div>
                    <div class="settings-section danger-zone">
                        <h3>${window.I18n.t('settings.clear_data')}</h3>
                        <button class="reset-btn danger">${window.I18n.t('settings.clear_data')}</button>
                    </div>
                </div>
            `;
            this._setupEvents(container, api);
            await this._loadAutostart(container, api);
        };
        this._render = render;
        await render();
        this._i18nListener = () => render();
        window.addEventListener('i18n:changed', this._i18nListener);
    },
    _setupEvents(container, api) {
        container.querySelectorAll('.lang-btn').forEach(btn => {
            btn.onclick = () => window.I18n.setLanguage(btn.dataset.lang);
        });
        container.querySelectorAll('.preset-btn').forEach(btn => {
            btn.onclick = () => {
                const val = btn.dataset.val;
                api.system.setWallpaper(val);
                api.notifications.show({ title: window.I18n.t('settings.tab_personalization'), message: window.I18n.t('settings.wallpaper_changed') });
            };
        });
        container.querySelectorAll('.theme-btn').forEach(btn => {
            btn.onclick = () => {
                const theme = btn.dataset.theme;
                api.system.setTheme(theme);
                api.notifications.show({ title: window.I18n.t('settings.tab_system'), message: window.I18n.t('settings.theme_changed') + " " + (theme === 'dark' ? window.I18n.t('settings.theme_dark') : window.I18n.t('settings.theme_light')) });
            };
        });
        container.querySelectorAll('.sound-btn').forEach(btn => {
            btn.onclick = async () => {
                const isEnabled = btn.dataset.sound === 'on';
                await api.fs.write('/home/user/settings/audio.json', JSON.stringify({ enabled: isEnabled }));
                api.system.publish('settings:audio_changed', { enabled: isEnabled });
                if (isEnabled) { try { AudioEngine.play('click'); } catch(e){} }
            };
        });
        const resetBtn = container.querySelector('.reset-btn');
        if (resetBtn) {
            resetBtn.onclick = () => {
                WebOS.ui.confirm(window.I18n.t('settings.clear_data_confirm'), async (ok) => {
                    if (ok) {
                        try {
                            await PersistenceManager.clear();
                            window.location.reload();
                        } catch (e) {
                            SysLog.log('ERR', `Reset failed: ${e.message}`, 'Settings');
                        }
                    }
                });
            };
        }
        this._vfsWatcher = (eventData) => {
            const path = eventData?.data?.path;
            if (path && (path.includes('settings/') || path.includes('startup.json'))) {
                this._render();
            }
        };
        api.system.subscribe('vfs:changed', this._vfsWatcher);
    },
    async _loadAutostart(container, api) {
        const list = container.querySelector('.autostart-list');
        if (!list) return;
        let startupApps = [];
        try {
            const raw = await api.fs.read('/sys/startup.json');
            startupApps = JSON.parse(raw) || [];
        } catch (e) {}
        const allApps = api.system.getAllApps();
        list.innerHTML = '';
        allApps.forEach(app => {
            const enabled = startupApps.includes(app.id);
            const item = document.createElement('div');
            item.className = 'autostart-item';
            item.innerHTML = `
                <div class="autostart-item-info">
                    <span class="autostart-item-icon">${app.icon}</span>
                    <span>${app.name}</span>
                </div>
                <input type="checkbox" class="autostart-toggle" ${enabled ? 'checked' : ''} data-id="${app.id}">
            `;
            item.querySelector('input').onchange = async (e) => {
                const id = e.target.dataset.id;
                let current = [];
                try {
                    current = JSON.parse(await api.fs.read('/sys/startup.json') || '[]');
                } catch(e){}
                if (e.target.checked) { if (!current.includes(id)) current.push(id); }
                else { current = current.filter(x => x !== id); }
                await api.fs.write('/sys/startup.json', JSON.stringify(current));
            };
            list.appendChild(item);
        });
    },
    unmount() {
        window.removeEventListener('i18n:changed', this._i18nListener);
        if (this._vfsWatcher) {
            this.api.system.unsubscribe('vfs:changed', this._vfsWatcher);
        }
    }
});
