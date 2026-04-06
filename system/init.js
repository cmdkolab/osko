    async function init() {
        console.log("OS(KO) Core Initializing...");
        const splash = document.getElementById('boot-screen');
        const loader = splash?.querySelector('.loader-bar');
        const statusEl = splash?.querySelector('.boot-status');
        const setProgress = (p, text) => {
            if (loader) loader.style.width = p + '%';
            if (statusEl) statusEl.innerText = text;
        };
        _setupErrorHandlers();
        setProgress(20, 'Loading VFS...');
        await VFS.init();
        setProgress(40, 'Initializing Audio...');
        await Promise.all([
            AudioEngine.init(),
            SessionManager.init(),
            ThemeEngine.init(),
            WebOS._loadDesktopPositions(),
            _setupUIInteractives()
        ]);
        _setupLockScreen();
        setProgress(60, 'Starting Kernel...');
        AudioEngine.play('startup');
        if (DBWrapper._isFallback) {
            WebOS.ui.showDialog({
                message: globalThis.I18n.t('dialog.db_fallback'),
                type: 'alert',
                acceptText: globalThis.I18n.t('dialog.ok')
            });
        }
        setProgress(80, 'Updating System Stats...');
        WebOS.updateSystemStats();
        WebOS._setupNotificationClearButton();
        EventBus.subscribe('vfs:changed', () => WebOS.updateSystemStats());
        setProgress(85, 'Restoring Session State...');
        if (state.isLocked) {
            const raw = await VFS.read('/sys/session.json', 'system');
            if (raw) {
                const data = JSON.parse(raw);
                if (data.openApps) state.deferredRestoration = data.openApps;
            } else {
                const legacy = await PersistenceManager.get(state.persistenceKey);
                if (legacy && legacy.openApps) state.deferredRestoration = legacy.openApps;
            }
        } else {
            await WebOS.restoreState();
        }
        setProgress(90, 'Setting up Desktop Events...');
        _setupDesktopEvents();
        setProgress(92, 'Setting up Global Events...');
        _setupGlobalEvents();
        setProgress(95, 'Setting up Keyboard Shortcuts...');
        _setupKeyboardShortcuts();
        EventBus.subscribe('system:ready', () => {
            _startAutoApps();
            setTimeout(() => {
                setProgress(100, 'Ready');
                if (splash) splash.classList.add('hidden');
                document.querySelectorAll('.desktop-icon').forEach((icon, i) => {
                    setTimeout(() => icon.classList.add('show'), 100 + (i * 60));
                });
            }, 500);
        });
        EventBus.publish('system:ready');
        console.log("OS(KO) Core Ready.");
    }
    function _setupErrorHandlers() {
        let _lastErr = null;
        const localizeStatic = () => {
            const bootStatus = document.querySelector('.boot-status');
            if (bootStatus) bootStatus.innerText = I18n.t('system.loading');
            const searchBtn = document.getElementById('search-btn');
            if (searchBtn) { searchBtn.title = I18n.t('system.search_tooltip'); searchBtn.setAttribute('aria-label', I18n.t('system.search_tooltip')); }
            const switcherBtn = document.getElementById('switcher-btn');
            if (switcherBtn) { switcherBtn.title = I18n.t('system.switcher_tooltip'); switcherBtn.setAttribute('aria-label', I18n.t('system.switcher_tooltip')); }
            const hddUsage = document.getElementById('hdd-usage');
            if (hddUsage) { hddUsage.title = I18n.t('system.hdd_usage'); hddUsage.setAttribute('aria-label', I18n.t('system.hdd_usage')); }
            const clockEl = document.getElementById('clock');
            if (clockEl) clockEl.setAttribute('aria-label', I18n.t('system.clock_aria'));
        };
        localizeStatic();
        globalThis.addEventListener('i18n:changed', localizeStatic);
        SysLog.log('INFO', 'Initializing WebOS Core...', 'Kernel');
        globalThis.onerror = (msg, url, line, col, error) => {
            SysLog.log('ERR', { message: msg, line, column: col, url, error: error?.toString() }, 'GlobalHandler');
            if (msg !== _lastErr) {
                Notifications.show({ title: globalThis.I18n.t('system.error_title'), message: globalThis.I18n.t('dialog.error', String(msg).slice(0, 50)), type: 'error' });
                _lastErr = msg;
                setTimeout(() => { if (_lastErr === msg) _lastErr = null; }, 5000);
            }
        };
        globalThis.onunhandledrejection = (event) => {
            const reason = event.reason?.toString() || 'Unknown Reason';
            SysLog.log('ERR', `Unhandled Rejection: ${reason}`, 'GlobalHandler');
            if (reason !== _lastErr) {
                Notifications.show({ title: globalThis.I18n.t('system.critical_error'), message: `Unhandled Promise: ${String(reason).slice(0, 50)}...`, type: 'error' });
                _lastErr = reason;
                setTimeout(() => { if (_lastErr === reason) _lastErr = null; }, 5000);
            }
        };
    }
    function _setupUIInteractives() {
        const apps = [
            'apps/about',
            'apps/notes',
            'apps/explorer',
            'apps/settings',
            'apps/taskmanager',
            'apps/syslog',
            'apps/calculator',
            'apps/terminal'
        ];
        apps.forEach(app => WebOS.installApp(app));
        const binds = [
            { id: 'search-btn', tooltip: 'system.search_tooltip', action: () => WebOS.ui.toggleSearch() },
            { id: 'switcher-btn', tooltip: 'system.switcher_tooltip', action: () => WebOS.ui.toggleSwitcher() },
            { id: 'clock', action: (e) => { e.stopPropagation(); WebOS.ui.toggleCalendar(); } }
        ];
        binds.forEach(b => {
            const el = document.getElementById(b.id);
            if (!el) return;
            el.onclick = b.action;
        });
        const updateTooltips = () => {
            binds.forEach(b => {
                const el = document.getElementById(b.id);
                if (el && b.tooltip) { el.title = globalThis.I18n.t(b.tooltip); el.setAttribute('aria-label', globalThis.I18n.t(b.tooltip)); }
            });
            const hddUsage = document.getElementById('hdd-usage');
            if (hddUsage) { hddUsage.title = globalThis.I18n.t('system.hdd_usage'); hddUsage.setAttribute('aria-label', globalThis.I18n.t('system.hdd_usage')); }
            const clockEl = document.getElementById('clock');
            if (clockEl) clockEl.setAttribute('aria-label', globalThis.I18n.t('system.clock_aria'));
        };
        updateTooltips();
        globalThis.addEventListener('i18n:changed', () => {
            updateTooltips();
            WebOS.refreshUI();
        });
        const hddUsage = document.getElementById('hdd-usage');
        if (hddUsage) hddUsage.title = globalThis.I18n.t('system.hdd_usage');
        setInterval(() => {
            const now = new Date();
            const clockEl = document.getElementById('clock');
            if (clockEl) {
                clockEl.innerText = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                clockEl.title = now.toLocaleDateString(globalThis.I18n.current === 'pl' ? 'pl-PL' : 'en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
            }
        }, 1000);
    }
    function _setupDesktopEvents() {
        const desktopEl = document.getElementById('desktop');
        if (desktopEl) {
            desktopEl.oncontextmenu = (e) => {
                e.preventDefault();
                if (e.target.closest('#window-layer') || (e.target.id !== 'desktop' && !e.target.closest('#desktop-icons'))) return;
                ContextMenu.show(e, [
                    { label: globalThis.I18n.t('menu.refresh'), icon: '🔄', action: () => globalThis.location.reload() },
                    { label: globalThis.I18n.t('menu.lock_system'), icon: '🔒', action: () => SessionManager.lock() },
                    { label: globalThis.I18n.t('menu.settings'), icon: '⚙️', action: () => WebOS.launchApp('settings') },
                    { label: globalThis.I18n.t('menu.new_note'), icon: '📝', action: () => WebOS.launchApp('notes') },
                    { label: globalThis.I18n.t('menu.close_all'), icon: '🧹', action: () => WebOS.killAll() },
                    { label: globalThis.I18n.t('menu.shutdown'), icon: '🔴', action: () => WebOS.shutdown() }
                ]);
            };
            desktopEl.addEventListener('mousedown', (e) => {
                if (e.target.id === 'desktop' || e.target.id === 'desktop-icons') {
                    document.querySelectorAll('.desktop-icon.selected').forEach(el => el.classList.remove('selected'));
                }
            });
        }
        const taskbarContainer = document.getElementById('running-apps');
        if (taskbarContainer) {
            taskbarContainer.oncontextmenu = (e) => {
                if (e.target.closest('.taskbar-item')) return;
                e.preventDefault(); e.stopPropagation();
                ContextMenu.show(e, [{
                    label: globalThis.I18n.t('menu.close_all'),
                    icon: '🧹',
                    action: () => WebOS.ui.confirm(globalThis.I18n.t('dialog.close_all_confirm'), (conf) => conf && WebOS.killAll())
                }]);
            };
        }
    }
    function _setupGlobalEvents() {
        document.addEventListener('mousedown', (e) => {
            const overlays = [
                { id: 'switcher-overlay', grid: '.switcher-grid', btn: '#switcher-btn', action: () => WebOS.ui.toggleSwitcher(false) },
                { id: 'calendar-overlay', grid: '#calendar-overlay', btn: '#clock', action: () => WebOS.ui.toggleCalendar(false) }
            ];
            overlays.forEach(o => {
                const el = document.getElementById(o.id);
                if (el?.classList.contains('active') && !e.target.closest(o.grid) && !e.target.closest(o.btn)) o.action();
            });
        });
        events.on('window:closed', (winId) => {
            const proc = state.processes.find(p => p.windowId === winId);
            if (proc && !proc._terminated) WebOS.killApp(proc.appId);
        });
        globalThis.addEventListener('resize', () => {
            state.viewport.w = globalThis.innerWidth;
            state.viewport.h = globalThis.innerHeight;
        });
        const saveOnExit = () => VFS._saveTimer && VFS.saveImmediate();
        globalThis.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && saveOnExit());
        globalThis.addEventListener('beforeunload', saveOnExit);
    }
    function _setupKeyboardShortcuts() {
        globalThis.addEventListener('keydown', (e) => {
            if (e.altKey && e.key === 'Tab') {
                e.preventDefault();
                const stack = state.windowStack || [];
                if (stack.length >= 2) WindowManager.focus(stack[stack.length - 2]);
            }
            if ((e.ctrlKey && e.code === 'Space') || (e.metaKey && e.key === 'k')) {
                e.preventDefault();
                WebOS.ui.toggleSearch();
            }
            if (e.altKey && e.code.startsWith('Arrow') && state.focusedWindow) {
                const win = state.windows.find(w => w.id === state.focusedWindow);
                if (!win) return;
                e.preventDefault();
                _handleWindowSnap(win, e.code);
            }
        });
    }
    function _handleWindowSnap(win, code) {
        const el = win.element;
        if (code === 'ArrowUp') {
            if (win.state !== 'maximized') WindowManager.toggleMaximize(win.id);
        } else if (code === 'ArrowDown') {
            if (win.state === 'maximized') WindowManager.toggleMaximize(win.id);
            else WindowManager.minimize(win.id);
        } else {
            if (win.state === 'maximized') WindowManager.toggleMaximize(win.id);
            const side = code === 'ArrowLeft' ? 'left' : 'right';
            Object.assign(el.style, {
                top: '0',
                left: side === 'left' ? '0' : '50%',
                width: '50%',
                height: 'calc(100vh - 40px)'
            });
            el.classList.add('window-snapped');
        }
    }
    function _startAutoApps() {
        Object.values(state.apps).forEach(app => {
            if (!app.startup) return;
            if (state.isLocked) {
                if (!state.deferredRestoration) state.deferredRestoration = [];
                state.deferredRestoration.push({ appId: app.id, startup: true });
            } else {
                WebOS.launchApp(app.id);
            }
        });
    }
    function _setupLockScreen() {
        const lockScreen = document.getElementById('lock-screen');
        if (!lockScreen) {
            console.error('[init] lock-screen element not found! DOM structure might be corrupted.');
            return;
        }
        const lockWallpaper = lockScreen.querySelector('.lock-wallpaper');
        const lockTime = document.getElementById('lock-time');
        const lockDate = document.getElementById('lock-date');
        const unlockBtn = document.getElementById('unlock-btn');
        if (!lockTime || !lockDate || !unlockBtn) {
            console.error('[init] Critical lock screen sub-elements missing!');
            return;
        }
        const updateLockTime = () => {
            const now = new Date();
            const loc = globalThis.I18n.current === 'pl' ? 'pl-PL' : 'en-US';
            lockTime.innerText = now.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit', hour12: false });
            lockDate.innerText = now.toLocaleDateString(loc, { weekday: 'long', month: 'long', day: 'numeric' });
        };
        setInterval(updateLockTime, 1000);
        updateLockTime();
        document.addEventListener('mousemove', (e) => {
            if (lockScreen.classList.contains('hidden')) return;
            const x = (e.clientX / globalThis.innerWidth - 0.5) * 40;
            const y = (e.clientY / globalThis.innerHeight - 0.5) * 40;
            if (lockWallpaper) lockWallpaper.style.transform = `translate(${x}px, ${y}px) scale(1.1)`;
        });
        unlockBtn.onclick = () => SessionManager.unlock();
        if (state.isLocked) {
            lockScreen.classList.remove('hidden');
            SessionManager.showLockScreen();
        }
    }
    init();
