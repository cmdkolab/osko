window.WebOS = {
    state,
    CONST: {
        DESKTOP_GRID: {
            CELL_W: 100,
            CELL_H: 120,
            OFFSET: 20,
            ICON_SIZE: 100
        },
        UI: {
            TASKBAR_H: 40,
            SAVE_DELAY: 500,
            STATS_DELAY: 200
        }
    },
    installApp(folderPath) {
        SysLog.log('DEBUG', `Installing app from ${folderPath}...`, 'WebOS');
        const ts = Date.now();
        const script = document.createElement('script');
        script.src = `${folderPath}/main.js?v=${ts}`;
        script.async = false;
        script.onerror = () => {
            Notifications.show({
                title: window.I18n.t('system.notification_title'),
                message: window.I18n.t('system.install_error', folderPath),
                type: 'error'
            });
        };
        document.body.appendChild(script);
    },
    registerApp(appDef) {
        SysLog.log('DEBUG', `Registering App: ${appDef.id}`, 'WebOS');
        if (!state.apps[appDef.id]) {
            state.apps[appDef.id] = { folderPath: '' };
        }
        Object.defineProperties(state.apps[appDef.id], Object.getOwnPropertyDescriptors(appDef));
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
        if (!app.allowMultiple) {
            const existingProc = state.processes.find(p => p.appId === appId);
            if (existingProc) {
                const win = state.windows.find(w => w.id === existingProc.windowId);
                if (win && (win.state === 'minimized' || win.element.style.display === 'none')) {
                    win.element.style.display = 'flex';
                    win.state = 'normal';
                }
                WindowManager.focus(existingProc.windowId);
                if (app.onParamsChange) app.onParamsChange(params);
                this.updateTaskbar();
                return;
            }
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
        const mountingTimeout = setTimeout(() => {
            if (state.processes.includes(process) && !process.mounted) {
                SysLog.log('ERR', `Mounting timeout for ${app.name}`, 'WebOS');
                Notifications.show({ title: window.I18n.t('system.notification_title'), message: window.I18n.t('system.app_load_timeout', app.name), type: 'error' });
                this.killApp(appId, pid);
            }
        }, 10000);
        try {
            SysLog.log('INFO', `Mounting App: ${app.name}`, 'WebOS', { appId, pid });
            await app.mount(winHandle.container, api, params);
            process.mounted = true;
            clearTimeout(mountingTimeout);
        } catch (e) {
            clearTimeout(mountingTimeout);
            console.error(`[Kernel] Failed to mount app "${app.name}":`, e);
            SysLog.log('ERR', `Mount error in ${app.name}`, 'WebOS', { appId, pid, error: e.message });
            Notifications.show({
                title: window.I18n.t('system.notification_title'),
                message: window.I18n.t('system.launch_error', app.name),
                type: 'error'
            });
            await this.killApp(appId, pid); 
            return;
        }
        this.updateTaskbar();
        this.saveState();
    },
    async killApp(appId, specificPid = null) {
        const index = state.processes.findIndex(p => p.appId === appId && (specificPid === null || p.pid === specificPid));
        if (index > -1) {
            const proc = state.processes[index];
            if (proc._terminated) return;
            proc._terminated = true;
            SysLog.log('INFO', `Terminating process: ${proc.appDef.name}`, 'WebOS', { appId, pid: proc.pid });
            try {
                if (proc.appDef.onBeforeClose && (await proc.appDef.onBeforeClose()) === false) {
                    proc._terminated = false;
                    return;
                }
                if (proc.appDef.unmount) proc.appDef.unmount();
            } catch (e) {
                SysLog.log('ERR', `Cleanup error in ${proc.appDef.name}`, 'WebOS', { error: e.message });
            }
            if (proc._resources) {
                proc._resources.forEach(res => {
                    try {
                        if (res.type === 'interval') clearInterval(res.handle);
                        if (res.type === 'timeout') clearTimeout(res.handle);
                        if (res.type === 'eventbus') EventBus.unsubscribe(res.handle.event, res.handle.token);
                        if (res.type === 'vfs_watch') res.handle();
                        if (res.type === 'event_listener') {
                            const t = (res.handle.target instanceof WeakRef) ? res.handle.target.deref() : res.handle.target;
                            if (t) t.removeEventListener(res.handle.type, res.handle.fn, res.handle.options);
                        }
                        if (res.type === 'vfs_unsubscribe' && res.handle) res.handle();
                    } catch (e) { }
                });
            }
            if (proc.windowId) WindowManager.destroy(proc.windowId);
            state.processes.splice(index, 1);
            if (window.events) events.emit('process:terminated', appId);
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
                    <h1>${window.I18n.t('system.shutdown_title')}</h1>
                    <p>${window.I18n.t('system.shutdown_msg')}</p>
                </div>
            `;
        document.body.appendChild(overlay);
        await this.killAll();
        await VFS.saveImmediate();
        overlay.innerHTML = `
                <div class="shutdown-content">
                    <div class="shutdown-icon">⏻</div>
                    <h1>${window.I18n.t('system.shutdown_done_title')}</h1>
                    <p>${window.I18n.t('system.shutdown_done_msg')}</p>
                    <button onclick="window.location.reload()" class="restart-btn">${window.I18n.t('system.restart')}</button>
                </div>
            `;
    },
    async killAll() {
        const procs = [...state.processes];
        for (const p of procs) {
            await this.killApp(p.appId, p.pid);
        }
        SysLog.log('INFO', 'All applications terminated');
    },
    async getAssociation(ext) {
        return await VFS.read(`/sys/associations/${ext}`, 'system');
    },
    _desktopPositions: {},
    async _loadDesktopPositions() {
        try {
            const data = await VFS.read('/home/user/settings/desktop.json', 'system');
            if (data) this._desktopPositions = JSON.parse(data);
        } catch (e) {
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
        if (!container) return;
        if (container.querySelector(`.desktop-icon[data-id="${app.id}"]`)) return;
        const name = app.name || (app.manifest && app.manifest.name) || window.I18n.t('system.default_app_name');
        const iconImg = app.icon || (app.manifest && app.manifest.icon) || '❓';
        const icon = document.createElement('div');
        icon.className = 'desktop-icon reveal';
        icon.setAttribute('data-id', app.id);
        const grid = this.CONST.DESKTOP_GRID;
        const pos = this._desktopPositions[app.id];
        if (pos) {
            icon.style.left = pos.x + 'px';
            icon.style.top = pos.y + 'px';
        } else {
            const count = container.querySelectorAll('.desktop-icon').length;
            const columns = Math.floor(container.clientWidth / grid.CELL_W) || 1;
            const col = count % columns;
            const row = Math.floor(count / columns);
            icon.style.left = (grid.OFFSET + col * grid.CELL_W) + 'px';
            icon.style.top = (grid.OFFSET + row * grid.CELL_H) + 'px';
        }
        icon.innerHTML = `<div class="icon">${iconImg}</div><div class="label">${name}</div>`;
        this._setupIconDrag(icon, app.id);
        icon.ondblclick = () => {
            AudioEngine.play('click');
            this.launchApp(app.id);
        };
        container.appendChild(icon);
    },
    _setupIconDrag(icon, appId) {
        const grid = this.CONST.DESKTOP_GRID;
        let dragging = false;
        let startX, startY, initialX, initialY;
        icon.onmousedown = (e) => {
            if (e.button !== 0) return;
            document.querySelectorAll('.desktop-icon.selected').forEach(el => el.classList.remove('selected'));
            icon.classList.add('selected');
            icon.style.zIndex = '1000';
            startX = e.clientX;
            startY = e.clientY;
            initialX = icon.offsetLeft;
            initialY = icon.offsetTop;
            const onMouseMove = (mE) => {
                const diffX = mE.clientX - startX;
                const diffY = mE.clientY - startY;
                if (!dragging && (Math.abs(diffX) > 3 || Math.abs(diffY) > 3)) {
                    dragging = true;
                    icon.classList.add('dragging');
                }
                if (dragging) {
                    icon.style.left = (initialX + diffX) + 'px';
                    icon.style.top = (initialY + diffY) + 'px';
                }
            };
            const onMouseUp = () => {
                if (dragging) {
                    dragging = false;
                    icon.classList.remove('dragging');
                    let sX = Math.max(grid.OFFSET, Math.min(Math.round((icon.offsetLeft - grid.OFFSET) / grid.CELL_W) * grid.CELL_W + grid.OFFSET, window.innerWidth - 80));
                    let sY = Math.max(grid.OFFSET, Math.min(Math.round((icon.offsetTop - grid.OFFSET) / grid.CELL_H) * grid.CELL_H + grid.OFFSET, window.innerHeight - 100));
                    icon.style.left = sX + 'px';
                    icon.style.top = sY + 'px';
                    this._desktopPositions[appId] = { x: sX, y: sY };
                    this._saveDesktopPositions();
                }
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
            };
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        };
    },
    _setupNotificationClearButton() {
        const container = document.getElementById('notification-center');
        if (container) {
            const observer = new MutationObserver(() => {
                let clearBtn = document.querySelector('.notification-clear-btn');
                if (container.childElementCount > 1) {
                    if (!clearBtn) {
                        const header = document.createElement('div');
                        header.className = 'notification-header';
                        header.innerHTML = `<button class="notification-clear-btn">${window.I18n.t('notifications.clear_all')}</button>`;
                        container.parentElement.insertBefore(header, container);
                        header.querySelector('.notification-clear-btn').onclick = () => window.Notifications.clearAll();
                    }
                } else {
                    if (clearBtn) clearBtn.parentElement.remove();
                }
            });
            observer.observe(container, { childList: true });
        }
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
            const name = proc.appDef.name || (proc.appDef.manifest && proc.appDef.manifest.name) || window.I18n.t('system.default_app_name');
            const icon = proc.appDef.icon || (proc.appDef.manifest && proc.appDef.manifest.icon) || '❓';
            if (!item) {
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
                item.onclick = () => {
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
                    ContextMenu.show(e, [{
                        label: window.I18n.t('menu.terminate'),
                        action: () => WebOS.killApp(proc.appId, proc.pid)
                    }]);
                };
                container.appendChild(item);
                this._taskbarCache[proc.pid] = item;
            }
            item.querySelector('.tb-icon').innerText = icon;
            item.querySelector('.tb-name').innerText = name;
            item.querySelector('.preview-thumbnail').innerText = icon;
            item.querySelector('.preview-info').innerText = name;
            item.classList.toggle('active', isActive);
        });
    },
    updateSystemStats() {
        const hddEl = document.getElementById('hdd-usage');
        if (!hddEl) return;
        const total = VFS.getTotalUsage();
        let display = (total > 1048576) ? (total / 1048576).toFixed(1) + ' MB' : (total > 1024 ? (total / 1024).toFixed(1) + ' KB' : total + ' B');
        hddEl.innerText = display;
    },
    saveState() {
        if (this._saveStateTimer) clearTimeout(this._saveStateTimer);
        this._saveStateTimer = setTimeout(async () => {
            const openApps = state.processes.reduce((acc, p) => {
                const win = state.windows.find(w => w.id === p.windowId);
                if (win) {
                    acc.push({
                        appId: p.appId,
                        params: p.params,
                        window: { left: win.element.style.left, top: win.element.style.top, width: win.element.style.width, height: win.element.style.height }
                    });
                }
                return acc;
            }, []);
            const sessionData = JSON.stringify({ openApps });
            await VFS.write('/sys/session.json', sessionData, 'system');
            await VFS.saveImmediate();
        }, this.CONST.UI.SAVE_DELAY);
    },
    async restoreState(deferredData) {
        let data = { openApps: [] };
        try {
            const raw = await VFS.read('/sys/session.json', 'system');
            if (raw) data = JSON.parse(raw);
            else {
                data = (await PersistenceManager.get(state.persistenceKey)) || { openApps: [] };
            }
        } catch (e) { }
        if (deferredData) {
            data.openApps = [...(data.openApps || []), ...deferredData];
            const seen = new Set();
            data.openApps = data.openApps.filter(a => {
                if (!a.appId || seen.has(a.appId)) return false;
                seen.add(a.appId);
                return true;
            });
        }
        if (!state.positionsLoaded) await new Promise(res => EventBus.subscribe('system:positions-ready', () => res()));
        if (data.openApps && Array.isArray(data.openApps)) {
            for (const appData of data.openApps) {
                if (!appData.appId) continue;
                if (state.processes.find(p => p.appId === appData.appId)) continue;
                await WebOS.launchApp(appData.appId, appData.params || {});
                const win = state.windows.find(w => w.appId === appData.appId && state.processes.some(p => p.windowId === w.id && p.appId === appData.appId));
                if (win && appData.window) {
                    Object.assign(win.element.style, appData.window);
                    win.element.style.transition = 'none';
                    setTimeout(() => win.element.style.transition = '', 100);
                }
            }
        }
        try {
            const startup = JSON.parse(await VFS.read('/sys/startup.json', 'system') || '[]');
            for (const appId of startup) {
                if (!state.processes.find(p => p.appId === appId)) await WebOS.launchApp(appId);
            }
        } catch (e) { }
        this.updateTaskbar();
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
        show(options) { Notifications.show(options); },
        confirm(msg, cb) { this.showDialog({ type: 'confirm', message: msg, onAccept: () => cb(true), onCancel: () => cb(false) }); },
        prompt(msg, defaultValue, cb) { this.showDialog({ type: 'prompt', message: msg, defaultValue, onAccept: cb, onCancel: () => cb(null) }); },
        fileConflict(filename, cb) {
            this.showDialog({
                message: window.I18n.t('dialog.file_exists', filename),
                type: 'choice',
                choices: [
                    { label: window.I18n.t('dialog.replace'), value: 'replace', class: 'danger' },
                    { label: window.I18n.t('dialog.copy'), value: 'copy' },
                    { label: window.I18n.t('dialog.cancel'), value: 'cancel' }
                ],
                onChoice: cb
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
                            <div class="card-icon">${proc.appDef.icon}</div>
                            <div class="card-title">${proc.appDef.name}</div>
                        </div>
                    `).join('');
                grid.querySelectorAll('.switcher-card').forEach(card => {
                    card.onclick = () => {
                        const pid = parseInt(card.dataset.pid);
                        const proc = state.processes.find(p => p.pid === pid);
                        if (proc) {
                            const win = state.windows.find(w => w.id === proc.windowId);
                            if (win) {
                                win.element.style.display = 'flex';
                                win.state = 'normal';
                                WindowManager.focus(proc.windowId);
                            }
                        }
                        this.toggleSwitcher(false);
                    };
                });
                overlay.style.display = 'flex';
                setTimeout(() => overlay.classList.add('active'), 10);
            } else {
                overlay.classList.remove('active');
                setTimeout(() => { if (!overlay.classList.contains('active')) overlay.style.display = 'none'; }, 300);
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
                input.oninput = async (e) => {
                    const query = e.target.value.trim();
                    const results = overlay.querySelector('.search-results');
                    if (!query) { results.innerHTML = ''; return; }
                    const appResults = Object.entries(state.apps)
                        .filter(([id, app]) => app.name.toLowerCase().includes(query.toLowerCase()))
                        .map(([id, app]) => ({ type: 'app', id, name: app.name, icon: app.icon }));
                    const fileResults = await VFS.find(query, 'system');
                    let allResults = [];
                    if (/^[0-9+\-*/().\s]+$/.test(query) && /[0-9]/.test(query)) {
                        try {
                            const unsafeEval = (str) => {
                                return (new Function(`"use strict"; return (${str})`))();
                            };
                            const res = unsafeEval(query);
                            if (typeof res === 'number') {
                                allResults.push({ type: 'math', name: `= ${res}`, id: res, icon: '🧮', path: window.I18n.t('system.search_result_math') });
                            }
                        } catch (e) { }
                    }
                    allResults = [...allResults, ...appResults, ...fileResults.slice(0, 10)];
                    results.innerHTML = allResults.map(res => `
                        <div class="search-item reveal" data-type="${res.type}" data-id="${res.id || res.path}">
                            <span class="res-icon">${res.icon || (res.type === 'dir' ? '📁' : '📄')}</span>
                            <div class="res-info">
                                <span class="res-name">${res.name}</span>
                                <span class="res-path">${res.path || window.I18n.t('taskmanager.app')}</span>
                            </div>
                            <span class="res-type-badge">${window.I18n.t('system.type_' + res.type)}</span>
                        </div>
                    `).join('');
                    results.querySelectorAll('.search-item').forEach(item => {
                        item.onclick = async () => {
                            const { type, id } = item.dataset;
                            if (type === 'app') WebOS.launchApp(id);
                            else if (type === 'file') {
                                const ext = id.split('.').pop().toLowerCase();
                                const assoc = await WebOS.getAssociation(ext);
                                if (assoc) WebOS.launchApp(assoc, { filePath: id });
                                else WebOS.launchApp('explorer', { filePath: VFS.dirname(id) });
                            } else if (type === 'math') { input.value = id; input.dispatchEvent(new Event('input')); return; }
                            this.toggleSearch(false);
                        };
                    });
                    const firstItem = results.querySelector('.search-item');
                    if (firstItem) firstItem.classList.add('selected');
                };
                input.onkeydown = (e) => {
                    const items = Array.from(overlay.querySelectorAll('.search-item'));
                    if (!items.length) return;
                    let idx = items.findIndex(item => item.classList.contains('selected'));
                    if (e.key === 'ArrowDown') idx = (idx + 1) % items.length;
                    else if (e.key === 'ArrowUp') idx = (idx - 1 + items.length) % items.length;
                    else if (e.key === 'Enter' && idx !== -1) items[idx].click();
                    else if (e.key === 'Escape') this.toggleSearch(false);
                    else return;
                    e.preventDefault();
                    items.forEach(it => it.classList.remove('selected'));
                    items[idx].classList.add('selected');
                    items[idx].scrollIntoView({ block: 'nearest' });
                };
                overlay.onclick = (e) => { if (e.target === overlay) this.toggleSearch(false); };
            }
            const isActive = force !== undefined ? force : !overlay.classList.contains('active');
            if (isActive) {
                overlay.style.display = 'flex';
                const input = overlay.querySelector('.search-input');
                input.value = '';
                overlay.querySelector('.search-results').innerHTML = '';
                setTimeout(() => { overlay.classList.add('active'); input.focus(); }, 10);
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
                for (let i = 1; i <= daysInMonth; i++) daysHtml += `<div class="cal-day ${i === now.getDate() ? 'today' : ''}">${i}</div>`;
                const weekdays = [
                    window.I18n.t('system.calendar_weekday_mo'),
                    window.I18n.t('system.calendar_weekday_tu'),
                    window.I18n.t('system.calendar_weekday_we'),
                    window.I18n.t('system.calendar_weekday_th'),
                    window.I18n.t('system.calendar_weekday_fr'),
                    window.I18n.t('system.calendar_weekday_sa'),
                    window.I18n.t('system.calendar_weekday_su')
                ];
                overlay.innerHTML = `<div class="cal-header reveal">${month} ${year}</div><div class="cal-grid reveal">${weekdays.map(w => `<div class="cal-weekday">${w}</div>`).join('')}${daysHtml}</div>`;
                overlay.style.display = 'block';
                setTimeout(() => overlay.classList.add('active'), 10);
            } else {
                overlay.classList.remove('active');
                setTimeout(() => { if (!overlay.classList.contains('active')) overlay.style.display = 'none'; }, 300);
            }
        },
        showDialog(options) {
            if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
            const overlay = document.createElement('div');
            overlay.className = 'system-dialog-overlay';
            overlay.style.zIndex = 21000 + this._dialogStack.length;
            let actionsHtml = options.type === 'choice' ? options.choices.map(c => `<button class="dialog-btn ${c.class || ''}" data-value="${c.value}">${c.label}</button>`).join('') :
                (options.type === 'alert' ? `<button class="dialog-btn accept primary">${options.acceptText || window.I18n.t('dialog.ok')}</button>` :
                `<button class="dialog-btn cancel">${options.cancelText || window.I18n.t('dialog.cancel')}</button><button class="dialog-btn accept primary">${options.acceptText || window.I18n.t('dialog.ok')}</button>`);
            overlay.innerHTML = `<div class="system-dialog glass-panel"><div class="dialog-content"><p class="dialog-message">${options.message}</p></div><div class="dialog-actions">${actionsHtml}</div></div>`;
            if (options.type === 'prompt') {
                const inp = document.createElement('input'); inp.type = 'text'; inp.className = 'dialog-input'; inp.value = options.defaultValue || '';
                overlay.querySelector('.dialog-content').appendChild(inp);
            }
            document.body.appendChild(overlay);
            const item = { overlay, options, cleanup: () => { overlay.remove(); this._dialogStack = this._dialogStack.filter(d => d !== item); } };
            this._dialogStack.push(item);
            if (!this._keyHandlerInitialized) {
                document.addEventListener('keydown', (e) => {
                    if (!this._dialogStack.length) return;
                    const top = this._dialogStack[this._dialogStack.length - 1];
                    if (e.key === 'Enter') { const b = top.overlay.querySelector('.accept'); if (b) b.click(); }
                    else if (e.key === 'Escape') { const b = top.overlay.querySelector('.cancel'); if (b) b.click(); else top.cleanup(); }
                });
                this._keyHandlerInitialized = true;
            }
            const input = overlay.querySelector('.dialog-input');
            if (input) setTimeout(() => input.focus(), 100);
            overlay.onclick = (e) => { if (e.target === overlay) { const b = overlay.querySelector('.cancel'); if (b) b.click(); else item.cleanup(); } };
            if (options.type === 'choice') {
                overlay.querySelectorAll('.dialog-btn').forEach(btn => btn.onclick = () => { item.cleanup(); if (options.onChoice) options.onChoice(btn.dataset.value); });
            } else {
                const acc = overlay.querySelector('.accept');
                if (acc) acc.onclick = () => { const val = input ? input.value : true; item.cleanup(); if (options.onAccept) options.onAccept(val); };
                const can = overlay.querySelector('.cancel');
                if (can) can.onclick = () => { item.cleanup(); if (options.onCancel) options.onCancel(); };
            }
        }
    },
    refreshDesktopIcons() {
        Object.entries(state.apps).forEach(([id, app]) => {
            const icon = document.querySelector(`.desktop-icon[data-id="${id}"]`);
            if (icon) {
                const label = icon.querySelector('.label');
                if (label) label.innerText = app.name || (app.manifest && app.manifest.name) || window.I18n.t('system.default_app_name');
            }
        });
    },
    refreshUI() {
        SysLog.log('DEBUG', 'Refreshing UI for language change...', 'WebOS');
        this.refreshDesktopIcons();
        this.updateTaskbar();
        state.processes.forEach(proc => {
            const winEl = document.getElementById(proc.windowId);
            if (winEl) {
                const titleEl = winEl.querySelector('.window-title');
                if (titleEl) titleEl.innerText = proc.appDef.name || (proc.appDef.manifest && proc.appDef.manifest.name) || window.I18n.t('system.default_app_name');
            }
        });
    },
    repositionDesktopIcons() {
        const container = document.getElementById('desktop-icons');
        if (!container) return;
        const icons = Array.from(container.querySelectorAll('.desktop-icon'));
        const grid = this.CONST.DESKTOP_GRID;
        const columns = Math.floor(container.clientWidth / grid.CELL_W) || 1;
        icons.forEach((icon, index) => {
            const appId = icon.dataset.id;
            if (!this._desktopPositions[appId]) {
                const col = index % columns;
                const row = Math.floor(index / columns);
                icon.style.left = (grid.OFFSET + col * grid.CELL_W) + 'px';
                icon.style.top = (grid.OFFSET + row * grid.CELL_H) + 'px';
            }
        });
    }
};
window.addEventListener('resize', () => {
    WebOS.repositionDesktopIcons();
});
