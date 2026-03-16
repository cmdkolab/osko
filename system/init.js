    async function init() {
        console.log("OS(KO) Core Initializing...");
        _setupErrorHandlers();
        await VFS.init();
        await Promise.all([
            AudioEngine.init(),
            SessionManager.init(),
            ThemeEngine.init(),
            WebOS._loadDesktopPositions()
        ]);
        AudioEngine.play('startup');
        if (DBWrapper._isFallback) {
            WebOS.ui.showDialog({
                message: window.I18n.t('dialog.db_fallback'),
                type: 'alert',
                acceptText: window.I18n.t('dialog.ok')
            });
        }
        WebOS.updateSystemStats();
        WebOS._setupNotificationClearButton();
        EventBus.subscribe('vfs:changed', () => WebOS.updateSystemStats());
        if (state.isLocked) {
            const data = await PersistenceManager.get(state.persistenceKey);
            if (data && data.openApps) state.deferredRestoration = data.openApps;
        } else {
            await WebOS.restoreState();
        }
        _setupUIInteractives();
        _setupDesktopEvents();
        _setupGlobalEvents();
        _setupKeyboardShortcuts();
        EventBus.subscribe('system:ready', () => {
            _startAutoApps();
            setTimeout(() => {
                const bootScreen = document.getElementById('boot-screen');
                if (bootScreen) bootScreen.classList.add('hidden');
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
        window.addEventListener('i18n:changed', localizeStatic);
        SysLog.log('INFO', 'Initializing WebOS Core...', 'Kernel');
        window.onerror = (msg, url, line, col, error) => {
            SysLog.log('ERR', { message: msg, line, column: col, url, error: error?.toString() }, 'GlobalHandler');
            if (msg !== _lastErr) {
                Notifications.show({ title: window.I18n.t('system.error_title'), message: window.I18n.t('dialog.error', String(msg).slice(0, 50)), type: 'error' });
                _lastErr = msg;
                setTimeout(() => { if (_lastErr === msg) _lastErr = null; }, 5000);
            }
        };
        window.onunhandledrejection = (event) => {
            const reason = event.reason?.toString() || 'Unknown Reason';
            SysLog.log('ERR', `Unhandled Rejection: ${reason}`, 'GlobalHandler');
            if (reason !== _lastErr) {
                Notifications.show({ title: window.I18n.t('system.critical_error'), message: `Unhandled Promise: ${String(reason).slice(0, 50)}...`, type: 'error' });
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
                if (el && b.tooltip) { el.title = window.I18n.t(b.tooltip); el.setAttribute('aria-label', window.I18n.t(b.tooltip)); }
            });
            const hddUsage = document.getElementById('hdd-usage');
            if (hddUsage) { hddUsage.title = window.I18n.t('system.hdd_usage'); hddUsage.setAttribute('aria-label', window.I18n.t('system.hdd_usage')); }
            const clockEl = document.getElementById('clock');
            if (clockEl) clockEl.setAttribute('aria-label', window.I18n.t('system.clock_aria'));
        };
        updateTooltips();
        window.addEventListener('i18n:changed', () => {
            updateTooltips();
            WebOS.refreshUI();
        });
        const hddUsage = document.getElementById('hdd-usage');
        if (hddUsage) hddUsage.title = window.I18n.t('system.hdd_usage');
        setInterval(() => {
            const now = new Date();
            const clockEl = document.getElementById('clock');
            if (clockEl) {
                clockEl.innerText = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                clockEl.title = now.toLocaleDateString(window.I18n.current === 'pl' ? 'pl-PL' : 'en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
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
                    { label: window.I18n.t('menu.refresh'), icon: '🔄', action: () => window.location.reload() },
                    { label: window.I18n.t('menu.lock_system'), icon: '🔒', action: () => SessionManager.lock() },
                    { label: window.I18n.t('menu.settings'), icon: '⚙️', action: () => WebOS.launchApp('settings') },
                    { label: window.I18n.t('menu.new_note'), icon: '📝', action: () => WebOS.launchApp('notes') },
                    { label: window.I18n.t('menu.close_all'), icon: '🧹', action: () => WebOS.killAll() },
                    { label: window.I18n.t('menu.shutdown'), icon: '🔴', action: () => WebOS.shutdown() }
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
                    label: window.I18n.t('menu.close_all'),
                    icon: '🧹',
                    action: () => WebOS.ui.confirm(window.I18n.t('dialog.close_all_confirm'), (conf) => conf && WebOS.killAll())
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
        window.addEventListener('resize', () => {
            state.viewport.w = window.innerWidth;
            state.viewport.h = window.innerHeight;
        });
        const saveOnExit = () => VFS._saveTimer && VFS.saveImmediate();
        window.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && saveOnExit());
        window.addEventListener('beforeunload', saveOnExit);
    }
    function _setupKeyboardShortcuts() {
        window.addEventListener('keydown', (e) => {
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
    init();
