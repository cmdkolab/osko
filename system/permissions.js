    window.Permissions = {
        check(manifest, permission) {
            if (!manifest.permissions) return false;
            return manifest.permissions.includes(permission);
        },
        createScopedAPI(appDef) {
            const appId = appDef.id;
            const manifest = appDef.manifest || {};
            let _procInstance = null;
            const _getProc = () => {
                if (_procInstance && state.processes.includes(_procInstance)) return _procInstance;
                _procInstance = state.processes.find(p => p.appId === appId);
                return _procInstance;
            };
            const check = (perm) => {
                const granted = this.check(manifest, perm);
                if (!granted) {
                    Notifications.show({
                        title: 'Security',
                        message: `App "${appDef.name}" tried to use "${perm}" without permission.`,
                        type: 'warning'
                    });
                }
                return granted;
            };
            const _untrack = (handle) => {
                const proc = _getProc();
                if (proc && proc._resources) {
                    proc._resources = proc._resources.filter(r => r.handle !== handle);
                }
            };
            const track = (handle, type) => {
                const proc = _getProc();
                if (proc) {
                    if (!proc._resources) proc._resources = [];
                    proc._resources.push({ handle, type });
                }
                return handle;
            };
            return {
                system: {
                    VERSION: PersistenceManager.VERSION,
                    START_TIME: PersistenceManager.START_TIME,
                    getUptime: () => {
                        const seconds = Math.floor((Date.now() - PersistenceManager.START_TIME) / 1000);
                        if (seconds < 60) return `${seconds}s`;
                        if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
                        return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
                    },
                    log: (level, msg, metadata = {}) => {
                        const proc = _getProc();
                        const ctx = {
                            appId,
                            appName: appDef.name,
                            pid: proc ? proc.pid : 'N/A',
                            ...metadata
                        };
                        SysLog.log(level, msg, appDef.name, ctx);
                    },
                    addEventListener: (target, type, fn, options) => {
                        if (!target || typeof target.addEventListener !== 'function') return;
                        target.addEventListener(type, fn, options);
                        track({ target: typeof WeakRef !== 'undefined' ? new WeakRef(target) : target, type, fn, options }, 'event_listener');
                    },
                    removeEventListener: (target, type, fn, options) => {
                        if (!target || typeof target.removeEventListener !== 'function') return;
                        target.removeEventListener(type, fn, options);
                        const proc = _getProc();
                        if (proc && proc._resources) {
                            proc._resources = proc._resources.filter(r => {
                                if (r.type === 'event_listener') {
                                    const t = typeof WeakRef !== 'undefined' && r.handle.target instanceof WeakRef ? r.handle.target.deref() : r.handle.target;
                                    if (t === target && r.handle.type === type && r.handle.fn === fn) return false;
                                }
                                return true;
                            });
                        }
                    },
                    publish: (event, data) => EventBus.publish(`app:${event}`, { from: appId, data }),
                    setTimeout: (fn, delay) => {
                        let handle;
                        const wrappedFn = () => {
                            _untrack(handle);
                            fn();
                        };
                        handle = setTimeout(wrappedFn, delay);
                        return track(handle, 'timeout');
                    },
                    clearTimeout: (handle) => {
                        clearTimeout(handle);
                        _untrack(handle);
                    },
                    setInterval: (fn, delay) => track(setInterval(fn, delay), 'interval'),
                    clearInterval: (handle) => {
                        clearInterval(handle);
                        _untrack(handle);
                    },
                    subscribe: (event, cb) => {
                        const token = EventBus.subscribe(event, cb);
                        track({ event, token }, 'eventbus');
                        return token;
                    },
                    unsubscribe: (event, token) => {
                        EventBus.unsubscribe(event, token);
                        const proc = _getProc();
                        if (proc && proc._resources) {
                            proc._resources = proc._resources.filter(r =>
                                !(r.type === 'eventbus' && r.handle.token === token)
                            );
                        }
                    },
                    setClipboard: (data) => WebOS.clipboard = data,
                    getClipboard: () => WebOS.clipboard,
                    window: {
                        focus: () => {
                            const proc = _getProc();
                            if (proc && proc.windowId) {
                                WindowManager.focus(proc.windowId);
                            }
                        }
                    },
                    getStats: () => {
                        const win = state.windows.find(w => w.appId === appId);
                        const proc = _getProc();
                        return {
                            uptime: Math.floor((Date.now() - (proc?.startTime || Date.now())) / 1000),
                            nodeCount: win ? win.element.getElementsByTagName('*').length : 0,
                            storage: VFS.calculateUsage(appId)
                        };
                    },
                    getProcesses: () => {
                        if (!check('system.manage')) return [];
                        return state.processes.map(p => {
                            const win = state.windows.find(w => w.id === p.windowId);
                            const nodeCount = win ? win.element.getElementsByTagName('*').length : 0;
                            const uptime = Math.floor((Date.now() - p.startTime) / 1000);
                            const storageBytes = VFS.calculateUsage(p.appId);
                            const storageStr = storageBytes > 1024 * 1024
                                ? (storageBytes / (1024 * 1024)).toFixed(2) + 'MB'
                                : (storageBytes / 1024).toFixed(1) + 'KB';
                            const limitStr = (VFS.QUOTA_PER_APP / (1024 * 1024)).toFixed(0) + 'MB';
                            return {
                                pid: p.pid,
                                name: p.appDef.name,
                                icon: p.appDef.icon,
                                appId: p.appId,
                                startTime: p.startTime,
                                uptime: `${uptime}s`,
                                storage: `${storageStr} / ${limitStr}`,
                                nodes: nodeCount
                            };
                        });
                    },
                    getAllApps: () => {
                        return Object.entries(state.apps).map(([id, app]) => ({
                            id,
                            name: app.name || (app.manifest && app.manifest.name) || id,
                            icon: app.icon || (app.manifest && app.manifest.icon) || '❓'
                        }));
                    },
                    showContextMenu: (e, items) => ContextMenu.show(e, items),
                    lock: () => check('system.session') ? SessionManager.lock() : null,
                    getAssociation: (ext) => VFS.read(`/sys/associations/${ext}`, 'system'),
                    setTheme: (name) => check('system.ui') ? ThemeEngine.setTheme(name) : null,
                    setWallpaper: (val) => check('system.ui') ? ThemeEngine.setWallpaper(val) : null,
                    killApp: async (targetAppId) => {
                        if (check('system.manage')) {
                            if (targetAppId !== appId) {
                                SysLog.log('INFO', `App ${appId} killing ${targetAppId} via Scoped API`);
                            }
                            await WebOS.killApp(targetAppId);
                        }
                    }
                },
                fs: {
                    read(path) { return check('fs.read') ? VFS.read(path, appId, manifest) : null; },
                    async write(path, data) { return check('fs.write') ? await VFS.write(path, data, appId, manifest) : null; },
                    list(path) { return check('fs.read') ? VFS.list(path, appId, manifest) : []; },
                    async mkdir(path) { return check('fs.write') ? await VFS.mkdir(path, appId, manifest) : null; },
                    async remove(path) { return check('fs.write') ? await VFS.remove(path, appId, manifest) : null; },
                    async rename(oldPath, newPath) { return check('fs.write') ? await VFS.rename(oldPath, newPath, appId, manifest) : null; },
                    async copy(srcPath, dstPath) { return check('fs.write') && check('fs.read') ? await VFS.copy(srcPath, dstPath, appId, manifest) : null; },
                    find(query) { return VFS.find(query, appId, manifest); },
                    join: (...args) => VFS.join(...args),
                    dirname: (path) => VFS.dirname(path),
                    basename: (path) => VFS.basename(path),
                    split: (path) => VFS.split(path),
                    exists(path) { return VFS.exists(path, appId, manifest); },
                    QUOTA_PER_APP: VFS.QUOTA_PER_APP,
                    watch: (path, cb) => {
                        const unsub = VFS.watch(path, cb);
                        const handle = () => {
                            unsub();
                            _untrack(handle);
                        };
                        track(handle, 'vfs_watch');
                        return handle;
                    }
                },
                notifications: {
                    show: (options) => check('notifications') ? Notifications.show(options) : null
                },
                audio: {
                    play: (type) => AudioEngine.play(type)
                },
                ui: WebOS.ui,
                window: {
                    setTitle: (title) => {
                        const proc = _getProc();
                        if (proc) {
                            const winEl = document.getElementById(proc.windowId);
                            if (winEl) {
                                const titleEl = winEl.querySelector('.window-title');
                                if (titleEl) titleEl.innerText = title;
                            }
                        }
                    }
                }
            };
        }
    };
