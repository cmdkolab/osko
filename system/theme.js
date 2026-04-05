    window.ThemeEngine = {
        async setTheme(name) {
            document.documentElement.setAttribute('data-theme', name);
            await VFS.write('/home/user/settings/theme.txt', name, 'system');
            await VFS.saveImmediate();
        },
        async setWallpaper(val) {
            if (!val || typeof val !== 'string') return;
            const urlPattern = /^(https?:\/\/|data:image\/)/i;
            const isUrl = urlPattern.test(val);
            const setStyle = (bgValue) => {
                document.body.style.transition = 'background 0.8s var(--ease-in-out-cubic)';
                document.body.style.background = bgValue;
                document.body.style.backgroundSize = 'cover';
                document.body.style.backgroundPosition = 'center center';
                document.body.style.backgroundAttachment = 'fixed';
            };
            if (isUrl) {
                const img = new Image();
                img.onload = async () => {
                    setStyle(`url('${val.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}')`);
                    await VFS.write('/home/user/settings/wallpaper.txt', val, 'system');
                    await VFS.saveImmediate();
                };
                img.onerror = () => {
                    Notifications.show({
                        title: window.I18n.t('settings.title'),
                        message: window.I18n.t('explorer.wallpaper_invalid'),
                        type: 'error'
                    });
                };
                img.src = val;
            } else {
                const safeVal = val.replace(/[;{}]/g, '');
                setStyle(safeVal);
                await VFS.write('/home/user/settings/wallpaper.txt', safeVal, 'system');
                await VFS.saveImmediate();
            }
        },
        async init() {
            const savedTheme = await VFS.read('/home/user/settings/theme.txt', 'system');
            if (savedTheme && ['dark', 'light', 'default'].includes(savedTheme)) {
                if (savedTheme === 'default') {
                    this.applyAutoTheme();
                } else {
                    document.documentElement.setAttribute('data-theme', savedTheme);
                    this._manualTheme = true;
                }
            } else {
                this.applyAutoTheme();
            }
            const savedWall = await VFS.read('/home/user/settings/wallpaper.txt', 'system');
            if (savedWall) {
                this.setWallpaper(savedWall);
            }
            this._prefersDark = window.matchMedia('(prefers-color-scheme: dark)');
            this._prefersDark.addEventListener('change', this._themeChangeListener);
        },
        _themeChangeListener() {
            if (!ThemeEngine._manualTheme) ThemeEngine.applyAutoTheme();
        },
        _cleanup() {
            if (this._prefersDark) this._prefersDark.removeEventListener('change', this._themeChangeListener);
        },
        applyAutoTheme() {
            const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
        }
    };
