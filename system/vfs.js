    window.VFS = {
        QUOTA_PER_APP: 10 * 1024 * 1024,
        persistenceKey: 'VFS:ROOT',
        root: {
            'home': {
                'user': {
                    'Desktop': {},
                    'Documents': {},
                    'Pictures': {},
                    'Music': {},
                    'Videos': {},
                    'settings': {
                        'wallpaper.txt': { content: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)', owner: 'system', size: 48, mtime: Date.now() },
                        'theme.txt': { content: 'default', owner: 'system', size: 7, mtime: Date.now() },
                    }
                }
            },
            'sys': {
                'associations': {
                    'txt': 'notes',
                    'log': 'syslog',
                    'json': 'notes'
                },
                'startup.json': { content: '[]', owner: 'system', size: 2, mtime: Date.now() }
            },
            'var': {
                'log': {
                    'syslog': { content: 'SYSTEM STARTUP\n', owner: 'system', size: 15, mtime: Date.now() }
                }
            }
        },
        _usage: {},
        _resolveCache: new Map(),
        _watchers: [],
        _saveTimer: null,
        _transactionQueue: Promise.resolve(),
        _isTransaction: false,
        _pendingSaveResolves: [],
        join(...parts) {
            if (parts.length === 0) return '/';
            const joined = parts.map(p => p.startsWith('/') ? p.slice(1) : p).filter(x => x).join('/');
            const resolvedParts = [];
            const segments = joined.split('/');
            for (const segment of segments) {
                if (segment === '.' || segment === '') continue;
                if (segment === '..') {
                    if (resolvedParts.length > 0) resolvedParts.pop();
                } else {
                    resolvedParts.push(segment);
                }
            }
            return '/' + resolvedParts.join('/');
        },
        dirname(path) {
            const lastSlash = path.lastIndexOf('/');
            if (lastSlash <= 0) return '/';
            return path.slice(0, lastSlash);
        },
        basename(path) {
            const lastSlash = path.lastIndexOf('/');
            return lastSlash === -1 ? path : path.slice(lastSlash + 1);
        },
        split(path) {
            return this.join(path).split('/').filter(Boolean);
        },
        async init() {
            await DBWrapper.init();
            const saved = await PersistenceManager.get(this.persistenceKey);
            if (saved && typeof saved === 'object') {
                SysLog.log('DEBUG', 'Loaded VFS from persistence.', 'VFS');
                deepMerge(this.root, saved);
            }
            this._recalculateUsage();
            if (!DBWrapper._isFallback) await this.saveImmediate();
            this.syncChannel = new BroadcastChannel('osko-vfs-sync');
            this.syncChannel.onmessage = async (e) => {
                if (e.data === 'sync' && !this._isTransaction) {
                    const newRoot = await PersistenceManager.get(this.persistenceKey);
                    if (newRoot) {
                        deepMergeSync(this.root, newRoot);
                        this._invalidateCache();
                        this._recalculateUsage();
                        EventBus.publish('vfs:changed', { from: 'system', data: { path: '/', type: 'sync' } });
                    }
                }
            };
        },
        _recalculateUsage() {
            const newUsage = {};
            const scan = (node) => {
                if (!node || typeof node !== 'object') return;
                if (node.content !== undefined) {
                    const owner = node.owner || 'system';
                    newUsage[owner] = (newUsage[owner] || 0) + (node.size || 0);
                    return;
                }
                for (const key in node) {
                    if (['owner', 'mtime', 'size', 'mode'].includes(key)) continue;
                    scan(node[key]);
                }
            };
            scan(this.root);
            this._usage = newUsage;
        },
        async transaction(fn) {
            return this._enqueue(async () => {
                this._isTransaction = true;
                try {
                    await fn();
                    await this.saveImmediate();
                } finally {
                    this._isTransaction = false;
                }
            });
        },
        async _enqueue(operation) {
            const prev = this._transactionQueue;
            let resolveQueue;
            this._transactionQueue = new Promise(res => resolveQueue = res);
            await prev;
            try {
                return await operation();
            } finally {
                resolveQueue();
            }
        },
        async save() {
            if (this._isTransaction) return;
            if (this._saveTimer) clearTimeout(this._saveTimer);
            this._saveTimer = setTimeout(async () => {
                try {
                    await PersistenceManager.set(this.persistenceKey, this.root);
                    if (this.syncChannel) this.syncChannel.postMessage('sync');
                } finally {
                    this._saveTimer = null;
                    this._pendingSaveResolves.splice(0).forEach(r => r());
                }
            }, 500);
        },
        async saveImmediate() {
            if (this._saveTimer) clearTimeout(this._saveTimer);
            return this._enqueue(async () => {
                try {
                    await PersistenceManager.set(this.persistenceKey, this.root);
                    if (this.syncChannel) this.syncChannel.postMessage('sync');
                } finally {
                    this._saveTimer = null;
                    this._pendingSaveResolves.splice(0).forEach(r => r());
                }
            });
        },
        _resolveInternal(path) {
            const normalized = this.join(path);
            let node = this._resolveCache.get(normalized);
            if (node !== undefined) return node;
            if (normalized === '/') return this.root;
            const parts = normalized.split('/').filter(Boolean);
            let current = this.root;
            for (const part of parts) {
                current = current[part];
                if (current === undefined) {
                    current = null;
                    break;
                }
            }
            this._resolveCache.set(normalized, current);
            if (this._resolveCache.size > 500) {
                const firstKey = this._resolveCache.keys().next().value;
                this._resolveCache.delete(firstKey);
            }
            return current;
        },
        _resolve(path, noClone = false) {
            const node = this._resolveInternal(path);
            if (node === null || noClone) return node;
            return window.deepClone(node);
        },
        checkAccess(path, appId, mode, manifest) {
            path = this.join(path);
            if (appId === 'kernel' || appId === 'system') return true;
            if (manifest?.permissions?.includes('fs.root')) return true;
            const parts = path.split('/').filter(Boolean);
            if (parts.length === 0) return mode === 'r';
            const firstPart = parts[0];
            if (manifest?.sandbox) {
                if (path.startsWith(`/var/apps/${appId}`)) return true;
                if (path.startsWith(`/home/user/settings/${appId}`)) return true;
                if (path.startsWith('/home/user/Documents') && manifest.permissions?.includes('fs.shared')) return true;
                return false;
            }
            if (firstPart === 'sys' || (firstPart === 'var' && path.startsWith('/var/log/'))) {
                if (mode === 'w') {
                    if (path === '/var/log/syslog') return true;
                    return !!manifest?.permissions?.includes('system.manage');
                }
                return true;
            }
            const node = this._resolve(path, true);
            if (node && node.mode !== undefined) {
                const m = node.mode;
                if (mode === 'r' && !(m & 0o444)) return false;
                if (mode === 'w' && !(m & 0o222) && appId !== 'system') return false;
            }
            if (path.startsWith('/var/apps/')) return path.startsWith(`/var/apps/${appId}`);
            if (path.startsWith('/home/user/Documents')) return true;
            if (path.startsWith('/home/user/settings/')) {
                return appId === 'settings' || appId === 'system' || path.startsWith(`/home/user/settings/${appId}`);
            }
            return firstPart === 'home';
        },
        read(path, appId, manifest) {
            path = this.join(path);
            if (!this.checkAccess(path, appId, 'r', manifest)) return null;
            const node = this._resolve(path);
            if (node === null) return null;
            if (typeof node === 'string') return node;
            if (node && typeof node === 'object' && node.content !== undefined) return node.content;
            return null;
        },
        async write(path, data, appId, manifest) {
            return this._enqueue(async () => {
                path = this.join(path);
                if (!this.checkAccess(path, appId, 'w', manifest)) return false;
                const dataStr = typeof data === 'string' ? data : JSON.stringify(data);
                const newSize = dataStr.length;
                const existingNode = this._resolve(path, true);
                const oldSize = existingNode?.size || 0;
                const oldOwner = existingNode?.owner || 'system';
                const owner = appId || 'system';
                const usageDelta = (owner === oldOwner) ? (newSize - oldSize) : newSize;
                if (owner !== 'system') {
                    const currentUsage = this._usage[owner] || 0;
                    if (currentUsage + usageDelta > this.QUOTA_PER_APP) {
                        Notifications.show({ title: window.I18n.t('system.notification_title'), message: window.I18n.t('dialog.quota_exceeded', owner) });
                        return false;
                    }
                }
                if (existingNode && oldOwner !== owner && oldOwner !== 'system') {
                    this._usage[oldOwner] = Math.max(0, (this._usage[oldOwner] || 0) - oldSize);
                }
                const parts = path.split('/').filter(Boolean);
                let current = this.root;
                for (let i = 0; i < parts.length - 1; i++) {
                    const part = parts[i];
                    if (!current[part]) {
                        current[part] = { owner: appId || 'system', mtime: Date.now(), mode: 0o755 };
                    } else if (current[part].content !== undefined) {
                        return false;
                    }
                    current = current[part];
                }
                const nameInDir = parts[parts.length - 1];
                if (current[nameInDir] && current[nameInDir].content === undefined && typeof current[nameInDir] === 'object' && !['owner', 'mtime', 'size', 'mode'].includes(nameInDir)) {
                    return false;
                }
                current[nameInDir] = {
                    content: dataStr,
                    owner,
                    size: newSize,
                    mtime: Date.now(),
                    mode: (current[nameInDir] && current[nameInDir].mode !== undefined) ? current[nameInDir].mode : 0o644
                };
                if (owner !== 'system') this._usage[owner] = (this._usage[owner] || 0) + usageDelta;
                this._invalidateCache(path);
                this._invalidateCache(this.dirname(path));
                this.save();
                EventBus.publish('vfs:changed', { from: appId || 'system', data: { path, appId } });
                this._notifyWatchers(path);
                return true;
            });
        },
        list(path, appId, manifest) {
            path = this.join(path);
            if (!this.checkAccess(path, appId, 'r', manifest)) return null;
            const node = this._resolve(path);
            if (node && typeof node === 'object' && node.content === undefined) {
                return Object.keys(node)
                    .filter(name => !['owner', 'mtime', 'size', 'mode'].includes(name))
                    .map(name => {
                        const child = node[name];
                        const isFile = typeof child === 'string' || (child && child.content !== undefined);
                        return {
                            name,
                            type: isFile ? 'file' : 'dir',
                            size: child.size || 0,
                            mtime: child.mtime || Date.now(),
                            owner: child.owner || 'system',
                            mode: child.mode || (isFile ? 0o644 : 0o755)
                        };
                    });
            }
            return null;
        },
        stat(path, appId, manifest) {
            path = this.join(path);
            if (!this.checkAccess(path, appId, 'r', manifest)) return null;
            const node = this._resolve(path, true);
            if (!node) return null;
            return {
                size: node.size || 0,
                mtime: node.mtime || Date.now(),
                owner: node.owner || 'system',
                mode: node.mode || 0o644,
                type: (typeof node === 'string' || node.content !== undefined) ? 'file' : 'dir'
            };
        },
        calculateUsage(appId) {
            if (!appId || appId === 'system' || appId === 'kernel') {
                return this.getTotalUsage();
            }
            return this._usage[appId] || 0;
        },
        getTotalUsage() {
            return Object.values(this._usage).reduce((a, b) => a + b, 0);
        },
        _invalidateCache(changedPath) {
            if (changedPath) {
                for (const path of this._resolveCache.keys()) {
                    if (path === changedPath || path.startsWith(changedPath + '/')) this._resolveCache.delete(path);
                }
            } else {
                this._resolveCache.clear();
            }
        },
        async mkdir(path, appId, manifest) {
            return this._enqueue(async () => {
                path = this.join(path);
                if (!this.checkAccess(path, appId, 'w', manifest)) return false;
                if (this.exists(path)) return true;
                const parts = path.split('/').filter(Boolean);
                let current = this.root;
                for (const part of parts) {
                    if (!current[part]) {
                        current[part] = { owner: appId || 'system', mtime: Date.now(), mode: 0o755 };
                    } else if (current[part].content !== undefined) {
                        return false;
                    }
                    current = current[part];
                }
                this._invalidateCache(path);
                this._invalidateCache(this.dirname(path));
                this.save();
                EventBus.publish('vfs:changed', { from: appId || 'system', data: { path, type: 'mkdir' } });
                this._notifyWatchers(path);
                return true;
            });
        },
        async find(query, appId, manifest) {
            const results = [];
            const q = (query || '').toLowerCase();
            if (!q) return [];
            const generator = function* (node, currentPath) {
                if (!node || typeof node !== 'object') return;
                for (const name in node) {
                    if (['owner', 'mtime', 'size', 'content', 'mode'].includes(name)) continue;
                    const path = VFS.join(currentPath, name);
                    if (!VFS.checkAccess(path, appId, 'r', manifest)) continue;
                    if (name.toLowerCase().includes(q)) {
                        const isFile = typeof node[name] === 'string' || (node[name] && node[name].content !== undefined);
                        results.push({ name, path, type: isFile ? 'file' : 'dir' });
                    }
                    if (typeof node[name] === 'object' && node[name].content === undefined) {
                        yield* generator(node[name], path);
                    }
                }
            };
            const gen = generator(this.root, '/');
            return new Promise(resolve => {
                const step = () => {
                    const start = performance.now();
                    while (performance.now() - start < 8) {
                        if (gen.next().done) {
                            resolve(results);
                            return;
                        }
                    }
                    if (window.requestIdleCallback) window.requestIdleCallback(step);
                    else setTimeout(step, 1);
                };
                step();
            });
        },
        async remove(path, appId, manifest) {
            return this._enqueue(async () => {
                path = this.join(path);
                if (!this.checkAccess(path, appId, 'w', manifest)) return false;
                const parts = path.split('/').filter(Boolean);
                if (parts.length === 0) return false;
                let current = this.root;
                for (let i = 0; i < parts.length - 1; i++) {
                    if (!current[parts[i]]) return false;
                    current = current[parts[i]];
                }
                const name = parts[parts.length - 1];
                const target = current[name];
                if (!target) return false;
                const traverseDelete = (node) => {
                    if (!node || typeof node !== 'object') return;
                    if (node.content !== undefined) {
                        const owner = node.owner || 'system';
                        this._usage[owner] = Math.max(0, (this._usage[owner] || 0) - (node.size || 0));
                        return;
                    }
                    for (const k in node) {
                        if (['owner', 'mtime', 'size', 'mode'].includes(k)) continue;
                        traverseDelete(node[k]);
                    }
                };
                traverseDelete(target);
                delete current[name];
                this._invalidateCache(path);
                this._invalidateCache(this.dirname(path));
                this.save();
                EventBus.publish('vfs:changed', { from: appId || 'system', data: { path, type: 'remove' } });
                this._notifyWatchers(path);
                return true;
            });
        },
        async rename(oldPath, newPath, appId, manifest) {
            return this._enqueue(async () => {
                oldPath = this.join(oldPath);
                newPath = this.join(newPath);
                if (!this.checkAccess(oldPath, appId, 'w', manifest) || !this.checkAccess(newPath, appId, 'w', manifest)) return false;
                if (newPath === oldPath || newPath.startsWith(oldPath + '/')) return false;
                const oldNode = this._resolve(oldPath, true);
                if (!oldNode) return false;
                const oldParent = this._resolve(this.dirname(oldPath), true);
                const oldName = this.basename(oldPath);
                const newParent = this._resolve(this.dirname(newPath), true);
                if (!newParent) await this.mkdir(this.dirname(newPath), 'system');
                const newParentFinal = this._resolve(this.dirname(newPath), true);
                const newName = this.basename(newPath);
                if (newParentFinal[newName]) {
                    if (newParentFinal[newName].content === undefined) return false;
                    const targetSize = newParentFinal[newName].size || 0;
                    const targetOwner = newParentFinal[newName].owner || 'system';
                    this._usage[targetOwner] = Math.max(0, (this._usage[targetOwner] || 0) - targetSize);
                }
                newParentFinal[newName] = oldNode;
                delete oldParent[oldName];
                this._invalidateCache(oldPath);
                this._invalidateCache(newPath);
                this.save();
                EventBus.publish('vfs:changed', { from: appId || 'system', data: { path: oldPath, type: 'rename', newPath } });
                this._notifyWatchers(oldPath);
                this._notifyWatchers(newPath);
                return true;
            });
        },
        async copy(srcPath, dstPath, appId, manifest) {
            return this._enqueue(async () => {
                srcPath = this.join(srcPath);
                dstPath = this.join(dstPath);
                if (!this.checkAccess(srcPath, appId, 'r', manifest) || !this.checkAccess(dstPath, appId, 'w', manifest)) return false;
                const srcNode = this._resolve(srcPath, true);
                if (!srcNode) return false;
                const cloneNode = (node) => {
                    if (node.content !== undefined) {
                        const owner = appId || 'system';
                        this._usage[owner] = (this._usage[owner] || 0) + (node.size || 0);
                        return { ...node, owner, mtime: Date.now() };
                    }
                    const newNode = { owner: appId || 'system', mtime: Date.now(), mode: node.mode };
                    for (const k in node) {
                        if (['owner', 'mtime', 'size', 'mode'].includes(k)) continue;
                        newNode[k] = cloneNode(node[k]);
                    }
                    return newNode;
                };
                const newNode = cloneNode(srcNode);
                const dstParent = this._resolve(this.dirname(dstPath), true);
                const dstName = this.basename(dstPath);
                if (dstParent[dstName] && dstParent[dstName].content !== undefined) {
                    const oldSize = dstParent[dstName].size || 0;
                    const oldOwner = dstParent[dstName].owner || 'system';
                    this._usage[oldOwner] = Math.max(0, (this._usage[oldOwner] || 0) - oldSize);
                }
                dstParent[dstName] = newNode;
                this._invalidateCache(dstPath);
                this.save();
                EventBus.publish('vfs:changed', { from: appId || 'system', data: { path: dstPath, type: 'copy', srcPath } });
                this._notifyWatchers(dstPath);
                return true;
            });
        },
        exists(path) {
            return this._resolveInternal(path) !== null;
        },
        watch(path, callback) {
            const watcher = { path: this.join(path), callback };
            this._watchers.push(watcher);
            return () => this._watchers = this._watchers.filter(w => w !== watcher);
        },
        _notifyWatchers(path) {
            const p = this.join(path);
            this._watchers.forEach(w => {
                if (p === w.path || p.startsWith(w.path + '/')) {
                    try { w.callback(p); } catch (e) { }
                }
            });
        }
    };
