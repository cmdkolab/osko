window.WebOS = {
    state,
    installApp(folderPath) {
        console.log(`System: Installing app from ${folderPath}...`);
        const ts = Date.now();
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = `${folderPath}/style.css?v=${ts}`;
        link.onerror = () => {
            Notifications.show({ title: 'System', message: `Nie udało się załadować stylów dla aplikacji z: ${folderPath}` });
        };
        document.head.appendChild(link);
        const script = document.createElement('script');
        script.src = `${folderPath}/main.js?v=${ts}`;
        script.async = false;
        script.onerror = () => {
            Notifications.show({ title: 'System', message: `Błąd instalacji: Nie znaleziono pliku main.js w ${folderPath}` });
        };
        document.body.appendChild(script);
    },
    registerApp(appDef) {
        SysLog.log('DEBUG', `Registering App: ${appDef.id}`, 'WebOS');
        const entry = state.apps[appDef.id];
        if (!entry) {
            state.apps[appDef.id] = { manifest: { name: appDef.name, icon: appDef.icon }, folderPath: '' };
        }
        Object.assign(state.apps[appDef.id], appDef);
        const existing = document.querySelector(`.desktop-icon[data-id="${appDef.id}"]`);
        if (!existing) {
            this.createDesktopIcon(state.apps[appDef.id]);
        }
    },
    async launchApp(appId, params = {}) {
        if (state.isLocked) return;
        const app = state.apps[appId];
        if (!app) return;
        SysLog.log('INFO', `Requesting launch: ${app.name} (${appId})`);
        const existingProc = state.processes.find(p => p.appId === appId);
        if (existingProc) {
            const win = state.windows.find(w => w.id === existingProc.windowId);
            if (win && win.state === 'minimized') {
                win.element.style.display = 'flex';
                win.state = 'normal';
            }
            WindowManager.focus(existingProc.windowId);
            if (app.onParamsChange) app.onParamsChange(params);
            this.updateTaskbar();
            return;
        }
        const winHandle = WindowManager.create({
            title: app.name || app.manifest.name,
            icon: app.icon || app.manifest.icon,
            width: app.width,
            height: app.height
        }, appId);
        const api = Permissions.createScopedAPI(app);
        const pid = state.nextPid++;
        const process = {
            pid,
            appId,
            windowId: winHandle.id,
            api,
            appDef: app,
            instance: app,
            params,
            startTime: Date.now()
        };
        state.processes.push(process);
        try {
            SysLog.log('INFO', `Mounting App: ${app.name}`, 'WebOS', { appId, pid });
            app.mount(winHandle.container, api, params);
        } catch (e) {
            console.error(`[Kernel] Failed to mount app "${app.name}":`, e);
            SysLog.log('ERR', `Mount error in ${app.name}`, 'WebOS', { appId, pid, error: e.message });
            Notifications.show({ title: 'System', message: `Aplikacja ${app.name} uległa awarii podczas startu.` });
            await this.killApp(appId);
            return;
        }
        this.updateTaskbar();
        SysLog.log('DEBUG', `App Launched Successfully: ${app.name}`, 'WebOS', { appId, pid });
        this.saveState();
    },
    async killApp(appId) {
        const index = state.processes.findIndex(p => p.appId === appId);
        if (index > -1) {
            const proc = state.processes[index];
            if (proc._terminated) return;
            proc._terminated = true;
            SysLog.log('INFO', `Terminating process: ${proc.appDef.name}`, 'WebOS', { appId, pid: proc.pid });
            if (proc.appDef.onBeforeClose) {
                try {
                    const proceed = await proc.appDef.onBeforeClose();
                    if (proceed === false) {
                        proc._terminated = false;
                        return;
                    }
                } catch (e) {
                    SysLog.log('ERR', `onBeforeClose error in ${proc.appDef.name}`, 'WebOS', { error: e.message });
                }
            }
            if (proc.appDef.unmount) {
                try {
                    proc.appDef.unmount();
                } catch (e) {
                    SysLog.log('ERR', `unmount error in ${proc.appDef.name}`, 'WebOS', { error: e.message });
                }
            }
            if (proc._resources) {
                SysLog.log('DEBUG', `Cleaning up ${proc._resources.length} resources for ${appId}`, 'WebOS');
                proc._resources.forEach(res => {
                    try {
                        if (res.type === 'interval') clearInterval(res.handle);
                        if (res.type === 'timeout') clearTimeout(res.handle);
                        if (res.type === 'eventbus') EventBus.unsubscribe(res.handle.event, res.handle.token);
                        if (res.type === 'vfs_watch') res.handle();
                        if (res.type === 'event_listener') {
                            try {
                                const t = typeof WeakRef !== 'undefined' && res.handle.target instanceof WeakRef ? res.handle.target.deref() : res.handle.target;
                                if (t) t.removeEventListener(res.handle.type, res.handle.fn, res.handle.options);
                            } catch (e) { }
                        }
                    } catch (e) {
                        console.warn("Resource cleanup error:", e);
                    }
                });
            }
            if (proc.windowId) {
                WindowManager.destroy(proc.windowId);
            }
            state.processes.splice(index, 1);
            events.emit('process:terminated', appId);
            this.updateTaskbar();
            this.saveState();
        }
    },
    async shutdown() {
        SysLog.log('WARN', 'System shutdown initiated', 'WebOS');
        const overlay = document.createElement('div');
        overlay.id = 'shutdown-overlay';
        overlay.innerHTML = `
                <div class="shutdown-content">
                    <div class="shutdown-icon">⏻</div>
                    <h1>Trwa wyłączanie...</h1>
                    <p>Wszystkie procesy są bezpiecznie kończone.</p>
                </div>
            `;
        document.body.appendChild(overlay);

        await this.killAll();
        await VFS.saveImmediate();

        overlay.innerHTML = `
                <div class="shutdown-content">
                    <div class="shutdown-icon">⏻</div>
                    <h1>System wyłączony</h1>
                    <p>Wszystkie procesy zostały zakończone bezpiecznie.</p>
                    <button onclick="window.location.reload()" class="restart-btn">Uruchom ponownie</button>
                </div>
            `;
    },
    async killAll() {
        for (const p of [...state.processes]) {
            await this.killApp(p.appId);
        }
        SysLog.log('INFO', 'All applications terminated');
    },
    _desktopPositions: {},
    async _loadDesktopPositions() {
        try {
            const data = await VFS.read('/home/user/settings/desktop.json', 'system');
            if (data) {
                this._desktopPositions = JSON.parse(data);
                SysLog.log('DEBUG', `Loaded ${Object.keys(this._desktopPositions).length} icon positions`, 'Desktop');
            }
        } catch (e) {
            SysLog.log('ERR', `Failed to load desktop positions: ${e.message}`, 'Desktop');
            this._desktopPositions = {};
        } finally {
            state.positionsLoaded = true;
            EventBus.publish('system:positions-ready');
        }
    },
    async _saveDesktopPositions() {
        try {
            const data = JSON.stringify(this._desktopPositions);
            await VFS.write('/home/user/settings/desktop.json', data, 'system');
            await VFS.saveImmediate();
            SysLog.log('DEBUG', `Saved ${Object.keys(this._desktopPositions).length} icon positions`, 'Desktop');
        } catch (e) {
            SysLog.log('ERR', `Failed to save desktop positions: ${e.message}`, 'Desktop');
        }
    },
    createDesktopIcon(app) {
        if (!state.positionsLoaded) {
            const token = EventBus.subscribe('system:positions-ready', () => {
                EventBus.unsubscribe('system:positions-ready', token);
                this.createDesktopIcon(app);
            });
            return;
        }
        const container = document.getElementById('desktop-icons');
        if (!container) {
            setTimeout(() => this.createDesktopIcon(app), 50);
            return;
        }
        if (container.querySelector(`.desktop-icon[data-id="${app.id}"]`)) return;
        const name = app.name || (app.manifest && app.manifest.name) || 'App';
        const iconImg = app.icon || (app.manifest && app.manifest.icon) || '❓';
        const icon = document.createElement('div');
        icon.className = 'desktop-icon';
        icon.setAttribute('data-id', app.id);


        const pos = this._desktopPositions[app.id];
        if (pos) {
            icon.style.left = pos.x + 'px';
            icon.style.top = pos.y + 'px';
        } else {

            const count = container.querySelectorAll('.desktop-icon').length;
            const columns = Math.floor(container.clientWidth / 100) || 1;
            const col = count % columns;
            const row = Math.floor(count / columns);
            icon.style.left = (20 + col * 100) + 'px';
            icon.style.top = (20 + row * 120) + 'px';
        }

        icon.innerHTML = `
                <div class="icon"></div>
                <div class="label"></div>
            `;
        icon.querySelector('.icon').textContent = iconImg;
        icon.querySelector('.label').textContent = name;


        let dragging = false;
        let startX, startY, initialX, initialY;

        icon.onmousedown = (e) => {
            if (e.button !== 0) return;


            document.querySelectorAll('.desktop-icon.selected').forEach(el => el.classList.remove('selected'));
            icon.classList.add('selected');

            dragging = true;
            icon.style.transition = 'none';
            icon.style.zIndex = '1000';
            startX = e.clientX;
            startY = e.clientY;
            initialX = parseInt(icon.style.left);
            initialY = parseInt(icon.style.top);

            let rAFQueued = false;
            let cX, cY;
            const onMouseMove = (moveEvent) => {
                if (!dragging) return;
                cX = moveEvent.clientX - startX;
                cY = moveEvent.clientY - startY;
                if (!rAFQueued) {
                    rAFQueued = true;
                    requestAnimationFrame(() => {
                        rAFQueued = false;
                        icon.style.left = (initialX + cX) + 'px';
                        icon.style.top = (initialY + cY) + 'px';
                    });
                }
            };

            const onMouseUp = () => {
                if (dragging) {
                    dragging = false;
                    icon.style.transition = '';
                    icon.style.zIndex = '';

                    let snappedX = Math.round((parseInt(icon.style.left) - 20) / 100) * 100 + 20;
                    let snappedY = Math.round((parseInt(icon.style.top) - 20) / 120) * 120 + 20;

                    const maxW = window.innerWidth - 80;
                    const maxH = window.innerHeight - 100;
                    snappedX = Math.max(20, Math.min(snappedX, maxW));
                    snappedY = Math.max(20, Math.min(snappedY, Math.max(20, maxH)));

                    icon.style.left = snappedX + 'px';
                    icon.style.top = snappedY + 'px';
                    this._desktopPositions[app.id] = { x: snappedX, y: snappedY };
                    this._saveDesktopPositions();
                }
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
            };
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        };

        icon.ondblclick = () => {
            AudioEngine.play('click');
            this.launchApp(app.id);
        };
        container.appendChild(icon);
    },
    _taskbarCache: {},
    updateTaskbar() {
        const container = document.getElementById('running-apps');
        if (!container) return;
        const activePids = new Set(state.processes.map(p => p.pid));
        Object.keys(this._taskbarCache).forEach(pid => {
            if (!activePids.has(Number(pid))) {
                this._taskbarCache[pid].remove();
                delete this._taskbarCache[pid];
            }
        });
        state.processes.forEach(proc => {
            let item = this._taskbarCache[proc.pid];
            const isActive = state.focusedWindow === proc.windowId;
            if (!item) {
                const name = proc.appDef.name || (proc.appDef.manifest && proc.appDef.manifest.name) || 'App';
                const icon = proc.appDef.icon || (proc.appDef.manifest && proc.appDef.manifest.icon) || '❓';
                item = document.createElement('div');
                item.className = 'taskbar-item';
                item.dataset.pid = proc.pid;
                item.innerHTML = `
                        <span class="tb-icon"></span> <span class="tb-name"></span>
                        <div class="taskbar-preview">
                            <div class="preview-thumbnail"></div>
                            <div class="preview-info"></div>
                        </div>
                    `;
                item.querySelector('.tb-icon').textContent = icon;
                item.querySelector('.tb-name').textContent = name;
                item.querySelector('.preview-thumbnail').textContent = icon;
                item.querySelector('.preview-info').textContent = name;
                item.onclick = (e) => {
                    const win = state.windows.find(w => w.id === proc.windowId);
                    if (!win) return;
                    if (win.state === 'minimized' || win.element.style.display === 'none') {
                        win.element.style.display = 'flex';
                        win.state = 'normal';
                        WindowManager.focus(proc.windowId);
                    } else if (state.focusedWindow === proc.windowId) {
                        WindowManager.minimize(proc.windowId);
                    } else {
                        WindowManager.focus(proc.windowId);
                    }
                };
                item.oncontextmenu = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    ContextMenu.show(e, [
                        {
                            label: window.I18n.t('menu.terminate'),
                            action: () => WebOS.killApp(proc.appId)
                        }
                    ]);
                };
                container.appendChild(item);
                this._taskbarCache[proc.pid] = item;
            }
            if (item.classList.contains('active') !== isActive) {
                item.classList.toggle('active', isActive);
            }
        });
    },
    _statsUpdateTimer: null,
    updateSystemStats() {
        if (this._statsUpdateTimer) return;
        this._statsUpdateTimer = setTimeout(() => {
            const hddEl = document.getElementById('hdd-usage');
            if (hddEl) {
                const total = VFS.getTotalUsage();
                let display = total + ' B';
                if (total > 1024 * 1024) display = (total / (1024 * 1024)).toFixed(1) + ' MB';
                else if (total > 1024) display = (total / 1024).toFixed(1) + ' KB';
                hddEl.innerText = display;
            }
            this._statsUpdateTimer = null;
        }, 200);
    },
    _saveStateTimer: null,
    saveState() {
        if (this._saveStateTimer) clearTimeout(this._saveStateTimer);
        this._saveStateTimer = setTimeout(async () => {
            this._saveStateTimer = null;
            const data = {
                openApps: state.processes.reduce((acc, p) => {
                    const win = state.windows.find(w => w.id === p.windowId);
                    if (!win) return acc;
                    acc.push({
                        appId: p.appId,
                        params: p.api?.fs ? { filePath: p.instance?.currentPath || p.params?.filePath } : null,
                        window: {
                            x: win.element.style.left,
                            y: win.element.style.top,
                            width: win.element.style.width,
                            height: win.element.style.height
                        }
                    });
                    return acc;
                }, [])
            };
            await PersistenceManager.set(state.persistenceKey, data);
        }, 500);
    },
    async restoreState(deferredData) {
        const data = deferredData ? { openApps: deferredData } : (await PersistenceManager.get(state.persistenceKey));


        const startupConfigStr = await VFS.read('/sys/startup.json', 'system');
        let startupAppsList = [];
        try { startupAppsList = JSON.parse(startupConfigStr || '[]'); } catch (e) { }

        if (data && Array.isArray(data.openApps)) {
            setTimeout(() => {
                data.openApps.forEach(appData => {
                    if (state.processes.find(p => p.appId === appData.appId)) return;
                    WebOS.launchApp(appData.appId, appData.params || {});

                    const win = state.windows.find(w => w.appId === appData.appId);
                    if (win && appData.window) {
                        Object.assign(win.element.style, {
                            left: appData.window.x,
                            top: appData.window.y,
                            width: appData.window.width,
                            height: appData.window.height
                        });
                    }
                });
                this.updateTaskbar();
            }, deferredData ? 100 : 500);
        }


        setTimeout(() => {
            startupAppsList.forEach(appId => {
                const tryLaunch = (attempts = 0) => {
                    if (state.processes.find(p => p.appId === appId)) return;
                    if (state.apps[appId]) {
                        WebOS.launchApp(appId);
                    } else if (attempts < 10) {
                        setTimeout(() => tryLaunch(attempts + 1), 500);
                    }
                };
                tryLaunch();
            });
        }, deferredData ? 300 : 1000);
    },
    async flushDeferredRestoration() {
        if (!state.deferredRestoration) return;
        const apps = state.deferredRestoration;
        state.deferredRestoration = null;
        await this.restoreState(apps);
    },
    ui: {
        _dialogStack: [],
        _keyHandlerInitialized: false,
        show(options) {
            Notifications.show(options);
        },
        confirm(msg, cb) {
            this.showDialog({
                type: 'confirm',
                message: msg,
                onAccept: () => cb(true),
                onCancel: () => cb(false)
            });
        },
        prompt(msg, defaultValue, cb) {
            this.showDialog({
                type: 'prompt',
                message: msg,
                defaultValue: defaultValue,
                onAccept: (val) => cb(val),
                onCancel: () => cb(null)
            });
        },
        fileConflict(filename, cb) {
            this.showDialog({
                message: window.I18n.t('dialog.file_exists', filename),
                type: 'choice',
                choices: [
                    { label: window.I18n.t('dialog.replace'), value: 'replace', class: 'danger' },
                    { label: window.I18n.t('dialog.copy'), value: 'copy' },
                    { label: window.I18n.t('dialog.cancel'), value: 'cancel' }
                ],
                onChoice: (val) => cb(val)
            });
        },
        toggleSwitcher(force) {
            let overlay = document.getElementById('switcher-overlay');
            if (!overlay) {
                overlay = document.createElement('div');
                overlay.id = 'switcher-overlay';
                overlay.innerHTML = '<div class="switcher-grid"></div>';
                document.body.appendChild(overlay);
            }
            const isActive = force !== undefined ? force : !overlay.classList.contains('active');
            if (isActive) {
                const grid = overlay.querySelector('.switcher-grid');
                grid.innerHTML = state.processes.map(proc => `
                        <div class="switcher-card" data-pid="${proc.pid}">
                            <div class="card-icon"></div>
                            <div class="card-title"></div>
                        </div>
                    `).join('');
                const cards = grid.querySelectorAll('.switcher-card');
                state.processes.forEach((proc, idx) => {
                    cards[idx].querySelector('.card-icon').textContent = proc.appDef.icon;
                    cards[idx].querySelector('.card-title').textContent = proc.appDef.name;
                });
                grid.querySelectorAll('.switcher-card').forEach(card => {
                    card.onclick = () => {
                        const pid = parseInt(card.dataset.pid);
                        const proc = state.processes.find(p => p.pid === pid);
                        if (proc) {
                            const win = state.windows.find(w => w.id === proc.windowId);
                            if (win) {
                                if (win.state === 'minimized' || win.element.style.display === 'none') {
                                    win.element.style.display = 'flex';
                                    win.state = 'normal';
                                }
                                WindowManager.focus(proc.windowId);
                            }
                        }
                        this.toggleSwitcher(false);
                    };
                });
                if (!overlay.style.display || overlay.style.display === 'none') overlay.style.display = 'flex';
                setTimeout(() => overlay.classList.add('active'), 10);
            } else {
                overlay.classList.remove('active');
            }
        },
        toggleSearch(force) {
            let overlay = document.getElementById('search-overlay');
            if (!overlay) {
                overlay = document.createElement('div');
                overlay.id = 'search-overlay';
                overlay.innerHTML = `
                        <div class="search-container glass-panel">
                            <div class="search-input-wrapper">
                                <span class="search-icon">🔍</span>
                                <input type="text" class="search-input" placeholder="${window.I18n.t('system.search_placeholder')}">
                            </div>
                            <div class="search-results"></div>
                        </div>
                    `;
                document.body.appendChild(overlay);

                const input = overlay.querySelector('.search-input');
                input.oninput = (e) => {
                    const query = e.target.value;
                    const results = overlay.querySelector('.search-results');
                    if (!query) {
                        results.innerHTML = '';
                        return;
                    }

                    const appResults = Object.entries(state.apps)
                        .filter(([id, app]) => app.name.toLowerCase().includes(query.toLowerCase()))
                        .map(([id, app]) => ({ type: 'app', id, name: app.name, icon: app.icon }));

                    const fileResults = VFS.find(query, 'system');

                    let allResults = [];
                    if (/^[0-9+\-*/().\s]+$/.test(query) && /[0-9]/.test(query)) {
                        try {
                            const res = Function('"use strict";return (' + query + ')')();
                            if (typeof res === 'number') {
                                allResults.push({ type: 'math', name: `= ${res}`, id: res, icon: '🧮', path: 'Wynik obliczenia' });
                            }
                        } catch (e) { }
                    }
                    allResults = [...allResults, ...appResults, ...fileResults.slice(0, 10)];
                    results.innerHTML = '';
                    allResults.forEach(res => {
                        const item = document.createElement('div');
                        item.className = 'search-item';
                        item.dataset.type = res.type;
                        item.dataset.id = res.id || res.path;

                        const iconSpan = document.createElement('span');
                        iconSpan.className = 'res-icon';
                        iconSpan.textContent = res.icon || (res.type === 'dir' ? '📁' : '📄');

                        const nameSpan = document.createElement('span');
                        nameSpan.className = 'res-name';
                        nameSpan.textContent = res.name;

                        const pathSpan = document.createElement('span');
                        pathSpan.className = 'res-path';
                        pathSpan.textContent = res.path || window.I18n.t('taskmanager.app');

                        item.appendChild(iconSpan);
                        item.appendChild(nameSpan);
                        item.appendChild(pathSpan);
                        results.appendChild(item);
                    });

                    results.querySelectorAll('.search-item').forEach(item => {
                        item.onclick = () => {
                            const type = item.dataset.type;
                            const id = item.dataset.id;
                            if (type === 'app') {
                                WebOS.launchApp(id);
                            } else if (type === 'file') {
                                const ext = id.split('.').pop().toLowerCase();
                                const app = WebOS.getAssociation(ext);
                                if (app) WebOS.launchApp(app, { filePath: id });
                                else WebOS.launchApp('explorer', { filePath: VFS.dirname(id) });
                            } else if (type === 'math') {
                                input.value = id;
                                input.dispatchEvent(new Event('input'));
                            }
                            if (type !== 'math') this.toggleSearch(false);
                        };
                    });

                    // Select first item by default
                    const firstItem = results.querySelector('.search-item');
                    if (firstItem) Object.assign(firstItem.style, { background: 'rgba(255,255,255,0.1)', outline: '1px solid rgba(255,255,255,0.2)' });
                };

                input.onkeydown = (e) => {
                    const items = Array.from(overlay.querySelectorAll('.search-item'));
                    if (!items.length) return;
                    let currentIndex = items.findIndex(item => item.style.background !== '');

                    if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        if (currentIndex < items.length - 1) currentIndex++;
                        else currentIndex = 0;
                    } else if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        if (currentIndex > 0) currentIndex--;
                        else currentIndex = items.length - 1;
                    } else if (e.key === 'Enter' && currentIndex !== -1) {
                        items[currentIndex].click();
                        return;
                    } else if (e.key === 'Escape') {
                        this.toggleSearch(false);
                        return;
                    } else {
                        return; // Not an arrow/enter key
                    }

                    items.forEach(item => {
                        item.style.background = '';
                        item.style.outline = '';
                    });
                    if (currentIndex !== -1) {
                        Object.assign(items[currentIndex].style, { background: 'rgba(255,255,255,0.1)', outline: '1px solid rgba(255,255,255,0.2)' });
                        items[currentIndex].scrollIntoView({ block: 'nearest' });
                    }
                };

                overlay.onclick = (e) => {
                    if (e.target === overlay) this.toggleSearch(false);
                };
            }

            const isActive = force !== undefined ? force : !overlay.classList.contains('active');
            if (isActive) {
                overlay.style.display = 'flex';
                const input = overlay.querySelector('.search-input');
                input.value = '';
                overlay.querySelector('.search-results').innerHTML = '';
                setTimeout(() => {
                    overlay.classList.add('active');
                    input.focus();
                }, 10);
            } else {
                overlay.classList.remove('active');
                setTimeout(() => overlay.style.display = 'none', 300);
            }
        },
        toggleCalendar(force) {
            let overlay = document.getElementById('calendar-overlay');
            if (!overlay) {
                overlay = document.createElement('div');
                overlay.id = 'calendar-overlay';
                overlay.className = 'glass-panel';
                document.body.appendChild(overlay);
            }
            const isActive = force !== undefined ? force : !overlay.classList.contains('active');
            if (isActive) {
                const now = new Date();
                const loc = window.I18n.current === 'pl' ? 'pl-PL' : 'en-US';
                const month = now.toLocaleString(loc, { month: 'long' });
                const year = now.getFullYear();
                const daysInMonth = new Date(year, now.getMonth() + 1, 0).getDate();
                const firstDay = (new Date(year, now.getMonth(), 1).getDay() + 6) % 7;

                let daysHtml = '';
                for (let i = 0; i < firstDay; i++) daysHtml += '<div class="cal-day empty"></div>';
                for (let i = 1; i <= daysInMonth; i++) {
                    const isToday = i === now.getDate() ? 'today' : '';
                    daysHtml += `<div class="cal-day ${isToday}">${i}</div>`;
                }

                const weekdays = window.I18n.current === 'pl' ? ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd'] : ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
                const weekHtml = weekdays.map(w => `<div class="cal-weekday">${w}</div>`).join('');

                overlay.innerHTML = `
                        <div class="cal-header">${month} ${year}</div>
                        <div class="cal-grid">
                            ${weekHtml}
                            ${daysHtml}
                        </div>
                    `;
                if (!overlay.style.display || overlay.style.display === 'none') overlay.style.display = 'block';
                setTimeout(() => overlay.classList.add('active'), 10);
            } else {
                overlay.classList.remove('active');
            }
        },
        showDialog(options) {
            if (document.activeElement && document.activeElement !== document.body) {
                try { document.activeElement.blur(); } catch (e) { }
            }
            const overlay = document.createElement('div');
            overlay.className = 'system-dialog-overlay';

            overlay.style.zIndex = 21000 + this._dialogStack.length;

            let actionsHtml = '';
            if (options.type === 'choice') {
                actionsHtml = options.choices.map(c =>
                    `<button class="dialog-btn ${c.class || ''}" data-value="${c.value}">${c.label}</button>`
                ).join('');
            } else if (options.type === 'alert') {
                actionsHtml = `
                        <button class="dialog-btn accept primary">${options.acceptText || window.I18n.t('dialog.ok')}</button>
                    `;
            } else {
                actionsHtml = `
                        <button class="dialog-btn cancel">${options.cancelText || window.I18n.t('dialog.cancel')}</button>
                        <button class="dialog-btn accept primary">${options.acceptText || window.I18n.t('dialog.ok')}</button>
                    `;
            }
            overlay.innerHTML = `
                    <div class="system-dialog glass-panel">
                        <div class="dialog-content">
                            <p class="dialog-message"></p>
                        </div>
                        <div class="dialog-actions">
                            ${actionsHtml}
                        </div>
                    </div>
                `;
            overlay.querySelector('.dialog-message').textContent = options.message;
            if (options.type === 'prompt') {
                const inputField = document.createElement('input');
                inputField.type = 'text';
                inputField.className = 'dialog-input';
                inputField.value = options.defaultValue || '';
                overlay.querySelector('.dialog-content').appendChild(inputField);
            }
            document.body.appendChild(overlay);

            const item = {
                overlay,
                options,
                cleanup: () => {
                    overlay.remove();
                    this._dialogStack = this._dialogStack.filter(d => d !== item);
                }
            };
            this._dialogStack.push(item);
            SysLog.log('DEBUG', `Show Dialog: ${options.type || 'alert'}`, 'WebOS.ui', { message: options.message });

            if (!this._keyHandlerInitialized) {
                document.addEventListener('keydown', (e) => {
                    if (this._dialogStack.length === 0) return;
                    const top = this._dialogStack[this._dialogStack.length - 1];
                    if (e.key === 'Enter') {
                        const acceptBtn = top.overlay.querySelector('.accept');
                        if (acceptBtn) acceptBtn.click();
                    }
                    if (e.key === 'Escape') {
                        const cancelBtn = top.overlay.querySelector('.cancel');
                        if (cancelBtn) cancelBtn.click();
                        else if (top.options.type === 'choice') {
                            top.cleanup();
                            if (top.options.onChoice) top.options.onChoice(null);
                        }
                    }
                });
                this._keyHandlerInitialized = true;
            }

            const input = overlay.querySelector('.dialog-input');
            if (input) {
                setTimeout(() => input.focus(), 100);
            }

            overlay.onmousedown = (e) => {
                if (e.target === overlay) {
                    const cancelBtn = overlay.querySelector('.cancel');
                    if (cancelBtn) cancelBtn.click();
                    else {
                        item.cleanup();
                        if (options.onCancel) options.onCancel();
                        if (options.onChoice) options.onChoice(null);
                    }
                }
            };
            if (options.type === 'choice') {
                overlay.querySelectorAll('.dialog-btn').forEach(btn => {
                    btn.onclick = () => {
                        item.cleanup();
                        if (options.onChoice) options.onChoice(btn.dataset.value);
                    };
                });
            } else {
                const cancelBtn = overlay.querySelector('.cancel');
                if (cancelBtn) {
                    cancelBtn.onclick = () => {
                        item.cleanup();
                        if (options.onCancel) options.onCancel();
                    };
                }
                const acceptBtn = overlay.querySelector('.accept');
                if (acceptBtn) {
                    acceptBtn.onclick = () => {
                        const val = input ? input.value : true;
                        item.cleanup();
                        if (options.onAccept) options.onAccept(val);
                    };
                }
            }
        }
    },
};
