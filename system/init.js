    async function init() {
        console.log("OS(KO) Core Initialized");
        let _lastErr = null;
        window.onerror = (msg, url, line, col, error) => {
            let logMsg = msg;
            SysLog.log('ERR', {
                message: logMsg,
                line,
                column: col,
                url,
                error: error ? error.toString() : null
            }, 'GlobalHandler');
            if (logMsg !== _lastErr) {
                const errText = String(logMsg).slice(0, 50);
                Notifications.show({ title: 'System Error', message: window.I18n.t('dialog.error', errText) });
                _lastErr = logMsg;
                setTimeout(() => { if (_lastErr === logMsg) _lastErr = null; }, 5000);
            }
        };
        window.onunhandledrejection = (event) => {
            const reason = event.reason ? event.reason.toString() : 'Unknown Reason';
            SysLog.log('ERR', `Unhandled Rejection: ${reason}`, 'GlobalHandler');
            if (reason !== _lastErr) {
                const reasonText = String(reason).slice(0, 50);
                Notifications.show({ title: 'Critical Error', message: `Unhandled Promise: ${reasonText}...` });
                _lastErr = reason;
                setTimeout(() => { if (_lastErr === reason) _lastErr = null; }, 5000);
            }
        };
        await VFS.init();
        AudioEngine.init();
        AudioEngine.play('startup');
        if (DBWrapper._isFallback) {
            WebOS.ui.showDialog({
                message: window.I18n.t('dialog.db_fallback'),
                type: 'alert',
                acceptText: window.I18n.t('dialog.ok')
            });
        }
        await WebOS._loadDesktopPositions();
        SysLog.init();
        await SessionManager.init();
        await ThemeEngine.init();
        WebOS.updateSystemStats();
        EventBus.subscribe('vfs:changed', () => WebOS.updateSystemStats());
        if (state.isLocked) {
            const data = await PersistenceManager.get(state.persistenceKey);
            if (data && data.openApps) state.deferredRestoration = data.openApps;
        } else {
            await WebOS.restoreState();
        }
        const searchBtn = document.getElementById('search-btn');
        if (searchBtn) {
            searchBtn.title = window.I18n.t('system.search_tooltip');
            searchBtn.onclick = () => WebOS.ui.toggleSearch();
        }
        const switcherBtn = document.getElementById('switcher-btn');
        if (switcherBtn) {
            switcherBtn.title = window.I18n.t('system.switcher_tooltip');
            switcherBtn.onclick = () => WebOS.ui.toggleSwitcher();
        }
        const hddUsage = document.getElementById('hdd-usage');
        if (hddUsage) {
            hddUsage.title = window.I18n.t('system.hdd_usage');
        }

        const taskbarContainer = document.getElementById('running-apps');
        if (taskbarContainer) {
            taskbarContainer.oncontextmenu = (e) => {
                if (e.target.closest('.taskbar-item')) return;
                e.preventDefault();
                e.stopPropagation();
                ContextMenu.show(e, [
                    {
                        label: window.I18n.t('menu.close_all'),
                        action: () => {
                            WebOS.ui.confirm(window.I18n.t('dialog.close_all_confirm'), async (confirmed) => {
                                if (confirmed) await WebOS.killAll();
                            });
                        }
                    }
                ]);
            };
        }
        document.addEventListener('mousedown', (e) => {
            const switcher = document.getElementById('switcher-overlay');
            if (switcher && switcher.classList.contains('active') && !e.target.closest('.switcher-grid') && !e.target.closest('#switcher-btn')) {
                WebOS.ui.toggleSwitcher(false);
            }
        });
        events.on('window:closed', (winId) => {
            const proc = state.processes.find(p => p.windowId === winId);
            if (proc && !proc._terminated) WebOS.killApp(proc.appId);
        });
        setInterval(() => {
            const now = new Date();
            const clockEl = document.getElementById('clock');
            if (clockEl) {
                clockEl.innerText = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                clockEl.title = now.toLocaleDateString(window.I18n.current === 'pl' ? 'pl-PL' : 'en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
                if (!clockEl.onclick) {
                    clockEl.onclick = (e) => {
                        e.stopPropagation();
                        WebOS.ui.toggleCalendar();
                    };
                }
            }
        }, 1000);

        document.addEventListener('mousedown', (e) => {
            const cal = document.getElementById('calendar-overlay');
            if (cal && cal.classList.contains('active') && !e.target.closest('#calendar-overlay') && !e.target.closest('#clock')) {
                WebOS.ui.toggleCalendar(false);
            }
        });

        const desktopEl = document.getElementById('desktop');
        if (desktopEl) {
            desktopEl.oncontextmenu = (e) => {
                e.preventDefault();
                if (e.target.closest('#window-layer') || (e.target.id !== 'desktop' && !e.target.closest('#desktop-icons'))) return;
                ContextMenu.show(e, [
                    { label: window.I18n.t('menu.refresh'), action: () => window.location.reload() },
                    { label: window.I18n.t('menu.lock_system'), action: () => SessionManager.lock() },
                    { label: window.I18n.t('menu.settings'), action: () => WebOS.launchApp('settings') },
                    { label: window.I18n.t('menu.new_note'), action: () => WebOS.launchApp('notes') },
                    { label: window.I18n.t('menu.close_all'), action: () => WebOS.killAll() },
                    { label: window.I18n.t('menu.shutdown'), action: () => WebOS.shutdown() }
                ]);
            };
        }

        const desktopMain = document.getElementById('desktop');
        if (desktopMain) {
            desktopMain.addEventListener('mousedown', (e) => {
                if (e.target.id === 'desktop' || e.target.id === 'desktop-icons') {
                    document.querySelectorAll('.desktop-icon.selected').forEach(el => el.classList.remove('selected'));
                }
            });
        }

        const startApps = () => {
            Object.values(state.apps).forEach(app => {
                if (app.startup) {
                    if (state.isLocked) {
                        if (!state.deferredRestoration) state.deferredRestoration = [];
                        state.deferredRestoration.push({ appId: app.id, startup: true });
                    } else {
                        console.log(`System: Auto-starting ${app.id}...`);
                        WebOS.launchApp(app.id);
                    }
                }
            });
        };
        setTimeout(startApps, 100);
        EventBus.publish('system:ready');
    }
    window.addEventListener('resize', () => {
        state.viewport.w = window.innerWidth;
        state.viewport.h = window.innerHeight;
    });
    window.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden' && VFS._saveTimer) {
            VFS.saveImmediate();
        }
    });

    window.addEventListener('beforeunload', () => {
        if (VFS._saveTimer) {
            VFS.saveImmediate();
        }
    });

    window.addEventListener('keydown', (e) => {
        if (e.altKey && e.key === 'Tab') {
            e.preventDefault();
            const stack = state.windowStack || [];
            if (stack.length < 2) return;
            const nextId = stack[stack.length - 2];
            WindowManager.focus(nextId);
        }
        if ((e.ctrlKey && e.code === 'Space') || (e.metaKey && e.key === 'k')) {
            e.preventDefault();
            WebOS.ui.toggleSearch();
        }
        if (e.altKey && (e.code === 'ArrowLeft' || e.code === 'ArrowRight' || e.code === 'ArrowUp' || e.code === 'ArrowDown')) {
            if (state.focusedWindow) {
                e.preventDefault();
                const win = state.windows.find(w => w.id === state.focusedWindow);
                if (!win) return;
                const el = win.element;
                if (e.code === 'ArrowUp') {
                    if (win.state !== 'maximized') WindowManager.toggleMaximize(win.id);
                } else if (e.code === 'ArrowDown') {
                    if (win.state === 'maximized') WindowManager.toggleMaximize(win.id);
                    else WindowManager.minimize(win.id);
                } else if (e.code === 'ArrowLeft') {
                    if (win.state === 'maximized') WindowManager.toggleMaximize(win.id);
                    Object.assign(el.style, { top: '0', left: '0', width: '50%', height: 'calc(100vh - 40px)' });
                    win.element.classList.add('window-snapped');
                } else if (e.code === 'ArrowRight') {
                    if (win.state === 'maximized') WindowManager.toggleMaximize(win.id);
                    Object.assign(el.style, { top: '0', left: '50%', width: '50%', height: 'calc(100vh - 40px)' });
                    win.element.classList.add('window-snapped');
                }
            }
        }
    });

    init();
