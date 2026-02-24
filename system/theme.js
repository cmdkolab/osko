    window.ThemeEngine = {
        async setTheme(name) {
            document.documentElement.setAttribute('data-theme', name);
            await VFS.write('/home/user/settings/theme.txt', name, 'system');
        },
        async setWallpaper(val) {
            if (!val || typeof val !== 'string') return;

            const sanitized = val.replace(/[\\"]/g, '').replace(/expression\s*\(/gi, '').replace(/javascript\s*:/gi, '');
            const isUrl = sanitized.startsWith('http://') || sanitized.startsWith('https://') || sanitized.startsWith('data:image/');
            document.body.style.background = isUrl ? `url('${sanitized}') no-repeat center center fixed` : sanitized;
            document.body.style.backgroundSize = 'cover';
            await VFS.write('/home/user/settings/wallpaper.txt', sanitized, 'system');
        },
        async init() {
            const savedTheme = await VFS.read('/home/user/settings/theme.txt', 'system');
            if (savedTheme) {
                document.documentElement.setAttribute('data-theme', savedTheme);
                this._manualTheme = true;
            } else {
                this.applyAutoTheme();
            }
            const savedWall = await VFS.read('/home/user/settings/wallpaper.txt', 'system');
            if (savedWall) await this.setWallpaper(savedWall);

            window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
                if (!this._manualTheme) this.applyAutoTheme();
            });
        },
        applyAutoTheme() {
            const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
        }
    };
    window.ThemeEngine = ThemeEngine;
