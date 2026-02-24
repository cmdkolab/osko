(function (global) {
    'use strict';
    if (!window.I18n) { window.I18n = { t: (key, ...args) => args[0] || key, current: 'en' }; }
    const DBWrapper = {
        dbName: 'OSKO_DB',
        storeName: 'vfs_nodes',
        version: 1,
        _db: null,
        _memory: {},
        _isFallback: false,
        init() {
            return new Promise((resolve) => {
                if (!window.indexedDB) {
                    this._isFallback = true;
                    console.warn('[DBWrapper] IndexedDB not supported. Switching to in-memory storage.');
                    return resolve();
                }
                const request = indexedDB.open(this.dbName, this.version);
                request.onerror = (e) => {
                    this._isFallback = true;
                    e.preventDefault(); // Prevent bubbling up to unhandled error
                    SysLog.log('WARN', 'IndexedDB access denied. Falling back to memory.', 'DBWrapper', { error: e.target.error?.message });
                    resolve();
                };
                request.onblocked = () => {
                    SysLog.log('WARN', 'Database blocked by another tab.', 'DBWrapper');
                };
                request.onsuccess = (e) => {
                    this._db = e.target.result;
                    SysLog.log('DEBUG', 'Database connection established.', 'DBWrapper');
                    this._db.onversionchange = () => {
                        this._db.close();
                        this._db = null;
                        console.warn('[DBWrapper] Database version changed externally, connection closed.');
                        WebOS.ui.showDialog({
                            message: 'Baza danych została zaktualizowana w innej karcie. Aby uniknąć błędów, strona zostanie odświeżona.',
                            type: 'alert',
                            acceptText: 'Odśwież teraz',
                            onAccept: () => window.location.reload()
                        });
                    };
                    resolve();
                };
                request.onupgradeneeded = (e) => {
                    const db = e.target.result;
                    if (!db.objectStoreNames.contains(this.storeName)) {
                        db.createObjectStore(this.storeName);
                    }
                };
            });
        },
        async get(key) {
            if (this._isFallback) return this._memory[key] !== undefined ? this._memory[key] : null;
            if (!this._db) throw new Error('DBWrapper: database not initialized');
            return new Promise((resolve, reject) => {
                const tx = this._db.transaction([this.storeName], 'readonly');
                tx.onerror = () => reject(tx.error);
                tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
                const store = tx.objectStore(this.storeName);
                const req = store.get(key);
                req.onsuccess = () => resolve(req.result !== undefined ? req.result : null);
                req.onerror = (e) => { e.stopPropagation(); reject(req.error); };
            });
        },
        async set(key, val) {
            if (this._isFallback) {
                this._memory[key] = val;
                return Promise.resolve();
            }
            if (!this._db) throw new Error('DBWrapper: database not initialized');
            return new Promise((resolve, reject) => {
                const tx = this._db.transaction([this.storeName], 'readwrite');
                tx.onerror = () => reject(tx.error);
                tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
                const store = tx.objectStore(this.storeName);
                const req = store.put(val, key);
                req.onsuccess = () => resolve();
                req.onerror = (e) => { e.stopPropagation(); reject(req.error); };
            });
        },
        async remove(key) {
            if (this._isFallback) {
                delete this._memory[key];
                return Promise.resolve();
            }
            if (!this._db) throw new Error('DBWrapper: database not initialized');
            return new Promise((resolve, reject) => {
                const tx = this._db.transaction([this.storeName], 'readwrite');
                tx.onerror = () => reject(tx.error);
                tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
                const store = tx.objectStore(this.storeName);
                const req = store.delete(key);
                req.onsuccess = () => resolve();
                req.onerror = (e) => { e.stopPropagation(); reject(req.error); };
            });
        }
    };
    const PersistenceManager = {
        PREFIX: 'OSKO:',
        SYSTEM_DIR: '/sys',
        TEMP_DIR: '/tmp',
        START_TIME: Date.now(),
        VERSION: '2.7.7',
        async get(key) {
            try { return await DBWrapper.get(this.PREFIX + key); } catch (e) { return null; }
        },
        async set(key, value) {
            try {
                await DBWrapper.set(this.PREFIX + key, value);
            } catch (e) {
                console.error("[Kernel] Persistence Error:", e);
                if (!key.startsWith('VFS:ROOT')) SysLog.log('ERR', `Persistence Failure: ${e.message}`);
            }
        },
        async remove(key) {
            try { await DBWrapper.remove(this.PREFIX + key); } catch (e) { console.error("[Kernel] Removal Error:", e); }
        }
    };
    const state = {
        apps: {},
        processes: [],
        windows: [],
        nextPid: 1000,
        focusedWindow: null,
        isLocked: false,
        persistenceKey: 'SYSTEM_STATE',
        deferredRestoration: null,
        windowStack: [],
        viewport: { w: window.innerWidth, h: window.innerHeight },
        positionsLoaded: false
    };
    const deepMerge = (target, source) => {
        for (const key in source) {
            if (key === '__proto__' || key === 'constructor') continue;
            if (source[key] && typeof source[key] === 'object' && source[key].content === undefined) {
                if (Array.isArray(source[key])) {
                    target[key] = [...source[key]];
                } else {
                    if (!target[key] || Array.isArray(target[key])) target[key] = {};
                    deepMerge(target[key], source[key]);
                }
            } else {
                target[key] = source[key];
            }
        }
    };
    const deepMergeSync = (target, source) => {
        for (const key in target) {
            if (key === '__proto__' || key === 'constructor') continue;
            if (!(key in source)) {
                delete target[key];
            }
        }
        for (const key in source) {
            if (key === '__proto__' || key === 'constructor') continue;
            const sourceVal = source[key];
            if (sourceVal && typeof sourceVal === 'object' && sourceVal.content === undefined) {
                if (Array.isArray(sourceVal)) {
                    target[key] = [...sourceVal];
                } else {
                    if (!target[key] || typeof target[key] !== 'object' || Array.isArray(target[key]) || target[key].content !== undefined) {
                        target[key] = {};
                    }
                    deepMergeSync(target[key], sourceVal);
                }
            } else {
                target[key] = sourceVal;
            }
        }
    };
    const VFS = {
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
                        'theme.txt': { content: 'default', owner: 'system', size: 7, mtime: Date.now() }
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
            const parts = path.split('/').filter(p => p);
            parts.pop();
            return '/' + parts.join('/');
        },
        basename(path) {
            return path.split('/').filter(p => p).pop() || '';
        },
        split(path) {
            return path.split('/').filter(p => p);
        },

        async init() {
            await DBWrapper.init();
            const saved = await PersistenceManager.get(this.persistenceKey);
            if (saved) {
                SysLog.log('DEBUG', 'Loaded VFS from persistence.', 'VFS');
                if (saved.home !== undefined || saved.sys !== undefined) {
                    deepMerge(this.root, saved);
                }
            } else {
                SysLog.log('WARN', 'Brak danych w IndexedDB, używam domyślnego systemu plików', 'VFS');
            }
            this._recalculateUsage();
            if (!DBWrapper._isFallback) {
                await this.saveImmediate();
            }

            this.syncChannel = new BroadcastChannel('osko-vfs-sync');
            this.syncChannel.onmessage = async (e) => {
                if (e.data === 'sync') {
                    const newRoot = await PersistenceManager.get(this.persistenceKey);
                    if (newRoot && typeof newRoot === 'object') {
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
            const queue = [this.root];
            while (queue.length > 0) {
                const node = queue.shift();
                if (!node || typeof node === 'string') continue;
                if (node.content !== undefined) {
                    const owner = node.owner || 'system';
                    newUsage[owner] = (newUsage[owner] || 0) + (node.size || 0);
                    continue;
                }
                queue.push(...Object.values(node));
            }
            this._usage = newUsage;
        },

        async transaction(fn) {
            SysLog.log('DEBUG', 'Starting VFS Transaction', 'VFS');

            const callerPromise = this._transactionQueue.then(async () => {
                this._isTransaction = true;
                const startTime = Date.now();
                try {
                    await fn();
                } finally {
                    this._isTransaction = false;
                    await this.saveImmediate();
                    SysLog.log('DEBUG', 'VFS Transaction Completed', 'VFS', { duration: Date.now() - startTime });
                }
            });

            this._transactionQueue = callerPromise.catch(e => {
                SysLog.log('ERR', 'VFS Transaction Failed', 'VFS', { error: e.message });
            });

            return callerPromise;
        },

        async save() {
            if (this._isTransaction) return;
            if (this._saveTimer) clearTimeout(this._saveTimer);

            // Background timer
            this._saveTimer = setTimeout(async () => {
                try {
                    await PersistenceManager.set(this.persistenceKey, this.root);
                    if (this.syncChannel) this.syncChannel.postMessage('sync');
                } catch (e) {
                    console.error('[Kernel] VFS save error:', e);
                } finally {
                    this._saveTimer = null;
                    const resolves = this._pendingSaveResolves.splice(0);
                    resolves.forEach(r => r());
                }
            }, 500);

            // Return immediately, don't block the UI
            return Promise.resolve();
        },

        async sync() {
            if (!this._saveTimer) return Promise.resolve();
            return new Promise(resolve => this._pendingSaveResolves.push(resolve));
        },

        async saveImmediate() {
            if (this._saveTimer) clearTimeout(this._saveTimer);
            await PersistenceManager.set(this.persistenceKey, this.root);
            if (this.syncChannel) this.syncChannel.postMessage('sync');
            this._saveTimer = null;
            const resolves = this._pendingSaveResolves.splice(0);
            resolves.forEach(r => r());
        },

        _resolveInternal(path) {
            const normalized = this.join(path);
            let node = this._resolveCache.get(normalized);
            if (node !== undefined) {
                this._resolveCache.delete(normalized);
                this._resolveCache.set(normalized, node);
                return node;
            }
            if (normalized === '/') {
                node = this.root;
            } else {
                const parts = normalized.split('/').filter(Boolean);
                let current = this.root;
                for (const part of parts) {
                    current = current[part];
                    if (current === undefined) return null;
                }
                node = current;
            }
            this._resolveCache.set(normalized, node);
            if (this._resolveCache.size > 200) {
                const firstKey = this._resolveCache.keys().next().value;
                this._resolveCache.delete(firstKey);
            }
            return node;
        },

        _resolve(path, noClone = false) {
            const node = this._resolveInternal(path);
            if (node === null) return null;
            if (noClone) return node;
            try {
                if (typeof structuredClone === 'function') {
                    return structuredClone(node);
                }
                return JSON.parse(JSON.stringify(node));
            } catch (e) {
                return node;
            }
        },

        checkAccess(path, appId, mode, manifest) {
            path = this.join(path);
            if (appId === 'kernel' || appId === 'system') return true;
            if (manifest?.permissions?.includes('fs.root')) return true;
            const parts = path.split('/').filter(Boolean);
            const firstPart = parts[0];
            if (!firstPart) return mode === 'r';

            if (manifest?.sandbox) {
                if (path.startsWith(`/var/apps/${appId}`)) return true;
                if (path.startsWith(`/home/user/settings/${appId}`)) return true;
                if (path.startsWith('/home/user/documents') && manifest.permissions?.includes('fs.shared')) return true;
                return false;
            }

            if (firstPart === 'sys' || (firstPart === 'var' && path.startsWith('/var/log/'))) {
                if (mode === 'w') {
                    if (path === '/var/log/syslog') return true;
                    if (manifest?.permissions?.includes('system.manage')) return true;
                    return false;
                }
                return true;
            }

            const node = this._resolve(path, true);
            if (node && node.mode !== undefined) {
                const m = node.mode;
                if (mode === 'r' && !(m & 0o444)) return false;
                if (mode === 'w' && !(m & 0o222) && appId !== 'system') return false;
            }

            if (path.startsWith('/var/apps/')) {
                return path.startsWith(`/var/apps/${appId}`);
            }
            if (path.startsWith('/home/user/documents')) {
                return true;
            }
            if (path.startsWith('/home/user/settings/')) {
                if (appId === 'settings' || appId === 'system') return true;
                return path.startsWith(`/home/user/settings/${appId}`);
            }
            if (firstPart === 'home') return true;
            return false;
        },

        read(path, appId, manifest) {
            path = this.join(path);
            if (!this.checkAccess(path, appId, 'r', manifest)) {
                SysLog.log('ERR', `Permission Denied (read): ${path}`, appId);
                return null;
            }
            const node = this._resolve(path);
            if (node === null) return null;
            if (typeof node === 'string') return node;
            if (node && typeof node === 'object' && node.content !== undefined) return node.content;
            return null;
        },

        async write(path, data, appId, manifest) {
            path = this.join(path);
            if (!this.checkAccess(path, appId, 'w', manifest)) {
                SysLog.log('ERR', `Permission Denied (write): ${path}`, appId);
                return false;
            }

            const dataStr = typeof data === 'string' ? data : JSON.stringify(data);
            const newSize = dataStr.length;
            const existingNode = this._resolve(path);
            const oldSize = existingNode?.size || 0;
            const oldOwner = existingNode?.owner || 'system';
            const owner = appId || 'system';
            const usageDelta = (owner === oldOwner) ? (newSize - oldSize) : newSize;

            if (owner !== 'system') {
                const currentUsage = this.calculateUsage(owner);
                // If the app is overwriting its OWN file, net change is newSize - oldSize.
                // If it's overwriting SOMEONE ELSE'S file, its usage increases by full newSize.

                if (currentUsage + usageDelta > this.QUOTA_PER_APP) {
                    SysLog.log('ERR', `Quota Exceeded: ${owner} tried to write ${newSize} bytes`, owner);
                    Notifications.show({ title: 'System', message: window.I18n.t('dialog.quota_exceeded', owner) });
                    return false;
                }
            }

            // Refund the old owner for the space if the file is being completely overwritten by someone else
            if (existingNode && oldOwner !== owner && oldOwner !== 'system') {
                this._usage[oldOwner] = Math.max(0, (this._usage[oldOwner] || 0) - oldSize);
            }

            const parts = path.split('/').filter(p => p);
            let current = this.root;
            for (let i = 0; i < parts.length - 1; i++) {
                const part = parts[i];
                if (!current[part]) {
                    current[part] = { owner: appId || 'system', mtime: Date.now(), mode: 0o755 };
                } else if (current[part].content !== undefined || typeof current[part] === 'string') {
                    SysLog.log('ERR', `Structural Integrity Violation: ${part} is a file`, appId);
                    return false;
                }
                current = current[part];
            }

            const nameInDir = parts[parts.length - 1];
            if (current[nameInDir] && current[nameInDir].content === undefined && typeof current[nameInDir] === 'object') {
                SysLog.log('ERR', `Structural Integrity Violation: ${nameInDir} is a directory`, appId);
                return false;
            }

            current[nameInDir] = {
                content: dataStr,
                owner,
                size: newSize,
                mtime: Date.now(),
                mode: (current[nameInDir] && current[nameInDir].mode !== undefined) ? current[nameInDir].mode : 0o644
            };

            const sizeDiff = owner === 'system' ? 0 : usageDelta;
            if (sizeDiff !== 0) {
                this._usage[owner] = (this._usage[owner] || 0) + sizeDiff;
            }

            this._invalidateCache(path);
            this._invalidateCache(this.dirname(path));
            void this.save();
            if (path !== '/var/log/syslog') {
                SysLog.log('DEBUG', `File Written: ${path}`, 'VFS', { appId, size: newSize });
            }
            EventBus.publish('vfs:changed', { from: 'kernel', data: { path, appId } });
            this._notifyWatchers(path);
            return true;
        },

        list(path, appId, manifest) {
            path = this.join(path);
            if (!this.checkAccess(path, appId, 'r', manifest)) return [];
            const node = this._resolve(path);
            if (node && typeof node === 'object' && node.content === undefined) {
                return Object.keys(node)
                    .filter(name => name !== 'owner' && name !== 'mtime' && name !== 'size')
                    .map(name => {
                        const child = node[name];
                        const isFile = typeof child === 'string' || (child && child.content !== undefined);
                        return { name, type: isFile ? 'file' : 'dir' };
                    });
            }
            return [];
        },

        calculateUsage(owner) {
            return this._usage[owner] || 0;
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

        chmod(path, mode, appId) {
            path = this.join(path);
            const node = this._resolve(path, true);
            if (!node) return false;
            if (appId !== 'system' && appId !== 'kernel' && node.owner !== appId) return false;
            node.mode = parseInt(mode);
            this.save();
            return true;
        },

        async mkdir(path, appId, manifest) {
            path = this.join(path);
            if (!this.checkAccess(path, appId, 'w', manifest)) {
                SysLog.log('ERR', `Permission Denied (mkdir): ${path}`, appId);
                return false;
            }
            if (this.exists(path)) {
                const node = this._resolve(path, true);
                if (node && (typeof node === 'string' || node.content !== undefined)) return false;
                return true;
            }
            const parts = path.split('/').filter(p => p);
            let current = this.root;
            for (const part of parts) {
                if (!current[part]) {
                    current[part] = { owner: appId || 'system', mtime: Date.now(), mode: 0o755 };
                } else if (current[part].content !== undefined || typeof current[part] === 'string') {
                    SysLog.log('ERR', `Structural Integrity Violation: ${part} is a file`, appId);
                    return false;
                }
                current = current[part];
            }
            this._invalidateCache(path);
            this._invalidateCache(this.dirname(path));
            void this.save();
            SysLog.log('DEBUG', `Directory Created: ${path}`, 'VFS', { appId });
            EventBus.publish('vfs:changed', { from: appId || 'system', data: { path, type: 'mkdir' } });
            this._notifyWatchers(path);
            return true;
        },

        find(query, appId, manifest) {
            const results = [];
            const q = (query || '').toLowerCase();
            if (!q) return [];
            const scan = (node, currentPath) => {
                if (!node || typeof node !== 'object') return;
                for (const name in node) {
                    if (['owner', 'mtime', 'size', 'content'].includes(name)) continue;
                    const path = this.join(currentPath, name);
                    if (!this.checkAccess(path, appId, 'r', manifest)) continue;
                    if (name.toLowerCase().includes(q)) {
                        const isFile = typeof node[name] === 'string' || (node[name] && node[name].content !== undefined);
                        results.push({ name, path, type: isFile ? 'file' : 'dir' });
                    }
                    if (typeof node[name] === 'object' && node[name].content === undefined) {
                        scan(node[name], path);
                    }
                }
            };
            scan(this.root, '/');
            return results;
        },

        async remove(path, appId, manifest) {
            path = this.join(path);
            if (!this.checkAccess(path, appId, 'w', manifest)) {
                SysLog.log('ERR', `Permission Denied (remove): ${path}`, appId);
                return false;
            }
            const parts = path.split('/').filter(p => p);
            if (parts.length === 0) return false;
            let current = this.root;
            for (let i = 0; i < parts.length - 1; i++) {
                if (!current[parts[i]]) return false;
                current = current[parts[i]];
            }
            const target = current[parts[parts.length - 1]];
            if (!target) return false;

            const traverseDelete = (node) => {
                if (!node || typeof node === 'string') return;
                if (node.content !== undefined) {
                    const owner = node.owner || 'system';
                    this._usage[owner] = Math.max(0, (this._usage[owner] || 0) - (node.size || 0));
                    return;
                }
                Object.values(node).forEach(v => traverseDelete(v));
            };
            traverseDelete(target);
            delete current[parts[parts.length - 1]];
            this._invalidateCache(path);
            this._invalidateCache(this.dirname(path));
            void this.save();
            SysLog.log('DEBUG', `Path Removed: ${path}`, 'VFS', { appId });
            EventBus.publish('vfs:changed', { from: appId || 'system', data: { path, type: 'remove' } });
            this._notifyWatchers(path);
            return true;
        },

        async rename(oldPath, newPath, appId, manifest) {
            oldPath = this.join(oldPath);
            newPath = this.join(newPath);
            if (!this.checkAccess(oldPath, appId, 'w', manifest) || !this.checkAccess(newPath, appId, 'w', manifest)) {
                SysLog.log('ERR', `Permission Denied (rename): ${oldPath} -> ${newPath}`, appId);
                return false;
            }
            const oldParts = oldPath.split('/').filter(p => p);
            const newParts = newPath.split('/').filter(p => p);
            if (oldParts.length === 0 || newParts.length === 0) return false;
            if (newPath === oldPath || newPath.startsWith(oldPath + '/')) {
                SysLog.log('ERR', `Circular rename blocked: ${oldPath} -> ${newPath}`, appId);
                return false;
            }

            let oldParent = this.root;
            for (let i = 0; i < oldParts.length - 1; i++) {
                if (!oldParent[oldParts[i]]) return false;
                oldParent = oldParent[oldParts[i]];
            }
            const oldName = oldParts[oldParts.length - 1];
            if (!oldParent[oldName]) return false;

            let newParent = this.root;
            for (let i = 0; i < newParts.length - 1; i++) {
                const part = newParts[i];
                if (!newParent[part]) {
                    newParent[part] = { owner: appId || 'system', mtime: Date.now() };
                }
                newParent = newParent[part];
            }
            const newName = newParts[newParts.length - 1];

            if (newParent[newName] && typeof newParent[newName] === 'object' && newParent[newName].content === undefined) {
                SysLog.log('ERR', `Rename failed: Target ${newPath} is a directory`, appId);
                return false;
            }

            // Fix Quota leak: if overwriting a file, subtract its size from its owner's usage
            if (newParent[newName] !== undefined && newParent[newName].content !== undefined) {
                const targetSize = newParent[newName].size || 0;
                const targetOwner = newParent[newName].owner || 'system';
                this._usage[targetOwner] = Math.max(0, (this._usage[targetOwner] || 0) - targetSize);
            }

            newParent[newName] = oldParent[oldName];
            delete oldParent[oldName];

            this._invalidateCache(oldPath);
            this._invalidateCache(newPath);
            this._invalidateCache(this.dirname(oldPath));
            this._invalidateCache(this.dirname(newPath));


            void this.save();
            SysLog.log('DEBUG', `Renamed: ${oldPath} -> ${newPath}`, 'VFS', { appId });
            EventBus.publish('vfs:changed', { from: appId || 'system', data: { path: oldPath, type: 'rename', newPath } });
            this._notifyWatchers(oldPath);
            this._notifyWatchers(newPath);
            return true;
        },

        async copy(srcPath, dstPath, appId, manifest) {
            srcPath = this.join(srcPath);
            dstPath = this.join(dstPath);
            if (!this.checkAccess(srcPath, appId, 'r', manifest) || !this.checkAccess(dstPath, appId, 'w', manifest)) {
                SysLog.log('ERR', `Permission Denied (copy): ${srcPath} -> ${dstPath}`, appId);
                return false;
            }
            if (dstPath === srcPath || dstPath.startsWith(srcPath + '/')) {
                SysLog.log('ERR', `Invalid copy destination: ${srcPath} -> ${dstPath}`, appId);
                return false;
            }

            const srcNode = this._resolve(srcPath, true);
            if (!srcNode) return false;

            const owner = appId || 'system';
            if (owner !== 'system') {
                const calculateNodeSize = (node) => {
                    if (!node || typeof node === 'string') return 0;
                    if (node.content !== undefined) return node.size || 0;
                    return Object.values(node).reduce((sum, child) => sum + calculateNodeSize(child), 0);
                };
                const totalSrcSize = calculateNodeSize(srcNode);
                if (this.calculateUsage(owner) + totalSrcSize > this.QUOTA_PER_APP) {
                    SysLog.log('ERR', `Quota Exceeded: ${owner} tried to copy ${totalSrcSize} bytes`, owner);
                    Notifications.show({ title: 'System', message: window.I18n.t('dialog.quota_exceeded', owner) });
                    return false;
                }
            }

            // Optional: parse destination
            const dstParts = dstPath.split('/').filter(p => p);
            if (dstParts.length === 0) return false;

            let dstParent = this.root;
            for (let i = 0; i < dstParts.length - 1; i++) {
                const part = dstParts[i];
                if (!dstParent[part]) {
                    dstParent[part] = { owner: appId || 'system', mtime: Date.now() };
                }
                dstParent = dstParent[part];
            }
            const dstName = dstParts[dstParts.length - 1];

            const cloneAndMerge = (src, destParent, destName) => {
                if (!src) return;
                if (typeof src === 'string' || src.content !== undefined) {
                    if (destParent[destName] && destParent[destName].content !== undefined) {
                        const oldSize = destParent[destName].size || 0;
                        const oldOwner = destParent[destName].owner || 'system';
                        this._usage[oldOwner] = Math.max(0, (this._usage[oldOwner] || 0) - oldSize);
                    }
                    const owner = appId || 'system';
                    const newSize = typeof src === 'string' ? src.length : src.content.length;
                    this._usage[owner] = (this._usage[owner] || 0) + newSize;
                    destParent[destName] = {
                        content: typeof src === 'string' ? src : src.content,
                        mtime: Date.now(),
                        owner: owner,
                        mode: src.mode || 0o644,
                        size: newSize
                    };
                } else {
                    if (!destParent[destName] || destParent[destName].content !== undefined || typeof destParent[destName] === 'string') {
                        destParent[destName] = { owner: appId || 'system', mtime: Date.now(), mode: src.mode || 0o755 };
                    }
                    for (const k in src) {
                        if (['owner', 'mtime', 'mode', 'size'].includes(k)) continue;
                        cloneAndMerge(src[k], destParent[destName], k);
                    }
                }
            };

            cloneAndMerge(srcNode, dstParent, dstName);

            this._invalidateCache(dstPath);
            this._invalidateCache(this.dirname(dstPath));
            void this.save();

            SysLog.log('DEBUG', `Copied: ${srcPath} -> ${dstPath}`, 'VFS', { appId });
            EventBus.publish('vfs:changed', { from: appId || 'system', data: { path: dstPath, type: 'copy', srcPath } });
            this._notifyWatchers(dstPath);
            this._notifyWatchers(this.dirname(dstPath));
            return true;
        },

        exists(path) {
            return this._resolveInternal(path) !== null;
        },

        watch(path, callback) {
            this._watchers.push({ path, callback });
            return () => {
                this._watchers = this._watchers.filter(w => w.callback !== callback);
            };
        },

        _notifyWatchers(path) {
            this._watchers.forEach(w => {
                if (path === w.path || path.startsWith(w.path + '/')) {
                    try { w.callback(path); } catch (e) { console.error("Watcher error:", e); }
                }
            });
        }
    };
    const SESSION_ID = window.crypto.getRandomValues(new Uint32Array(1))[0].toString(36).toUpperCase().padStart(4, '0').substring(0, 4);
    const SysLog = {
        _buffer: null,
        _writeTimer: null,
        _isWriting: false,
        _failedOnce: false,
        _heartbeatTimer: null,
        SESSION_ID,
        init() {
            EventBus.subscribe('vfs:changed', (e) => {
                if (e.data && e.data.path === '/var/log/syslog') {
                    if (e.data.appId || e.data.type === 'remove') this._buffer = null;
                }
            });
            this.startHeartbeat();
        },
        startHeartbeat() {
            if (this._heartbeatTimer) clearInterval(this._heartbeatTimer);
            this._heartbeatTimer = setInterval(() => {
                const stats = {
                    procs: state.processes.length,
                    vfs: VFS.getTotalUsage()
                };
                this.log('DEBUG', `System Heartbeat: ${state.processes.map(p => p.appDef.name).join(', ') || 'Idle'}`, 'Kernel', stats);
            }, 30000);
        },
        log(level, msg, source = 'Kernel', metadata = null) {
            const time = new Date().toLocaleTimeString();
            level = level.toUpperCase();

            let metadataStr = '';
            if (metadata) {
                try {
                    const seen = new WeakSet();
                    metadataStr = ` | META: ${JSON.stringify(metadata, (key, value) => {
                        if (typeof value === 'object' && value !== null) {
                            if (seen.has(value)) return '[Circular]';
                            seen.add(value);
                        }
                        if (value instanceof HTMLElement) return `[HTMLElement ${value.tagName}${value.id ? '#' + value.id : ''}]`;
                        if (value instanceof Error) return `[Error ${value.message}]`;
                        return value;
                    })}`;
                } catch (e) { metadataStr = ' | META: [Unserializable]'; }
            }

            let entry;
            const prefix = `[${time}] [${this.SESSION_ID}] [${level}] [${source}]`;

            if (msg instanceof Error) {
                entry = `${prefix} ${msg.message}${metadataStr}\nStack: ${msg.stack}\n`;
            } else if (typeof msg === 'object') {
                try { entry = `${prefix} ${JSON.stringify(msg, null, 2)}${metadataStr}\n`; } catch (e) { entry = `${prefix} [Object]${metadataStr}\n`; }
            } else {
                entry = `${prefix} ${msg}${metadataStr}\n`;
            }

            const colors = {
                DEBUG: 'color: #94a3b8;',
                INFO: 'color: #3b82f6;',
                WARN: 'color: #f59e0b;',
                ERR: 'color: #ef4444;'
            };
            const style = colors[level] || 'color: inherit;';
            console.log(`%c OS(KO) %c ${entry.trim()}`, 'background: #3b82f6; color: white; font-weight: bold; border-radius: 2px; padding: 0 2px;', style);

            if (this._buffer === null) {
                this._buffer = '';
                try {
                    const savedLog = VFS.read('/var/log/syslog', 'system');
                    if (savedLog) this._buffer = savedLog + this._buffer;
                } catch (e) { }
            }
            this._buffer += entry;
            if (this._buffer.length > 50000) {
                this._buffer = '... (truncated)\n' + this._buffer.slice(-40000);
            }
            if (this._writeTimer) clearTimeout(this._writeTimer);
            const delay = level === 'ERR' ? 500 : 5000;
            this._writeTimer = setTimeout(async () => {
                if (this._buffer !== null && !this._isWriting && !this._failedOnce) {
                    this._isWriting = true;
                    try {
                        await VFS.write('/var/log/syslog', this._buffer, 'system');
                    } catch (e) {
                        console.error("[Kernel] SysLog Persistence Failed.", e);
                        this._failedOnce = true;
                    } finally {
                        this._isWriting = false;
                    }
                }
                this._writeTimer = null;
            }, delay);
        }
    };
    const SessionManager = {
        async init() {
            const locked = await PersistenceManager.get('SYS:LOCKED');
            if (locked) this.lock();
        },
        lock() {
            state.isLocked = true;
            PersistenceManager.set('SYS:LOCKED', true);
            document.body.classList.add('system-locked');
            this.showLockScreen();
            SysLog.log('INFO', 'System locked');
        },
        async unlock() {
            state.isLocked = false;
            await PersistenceManager.set('SYS:LOCKED', false);
            document.body.classList.remove('system-locked');
            const ls = document.getElementById('lock-screen');
            if (ls) ls.remove();
            if (this._lockKeydown) {
                document.removeEventListener('keydown', this._lockKeydown);
                this._lockKeydown = null;
            }
            SysLog.log('INFO', 'System unlocked');
            if (state.deferredRestoration) {
                WebOS.flushDeferredRestoration();
            }
        },
        async logout() {
            SysLog.log('INFO', 'User logout initiated');
            await WebOS.killAll();
            await VFS.saveImmediate();
            state.isLocked = true;
            document.body.classList.add('system-locked');
            location.reload();
        },
        showLockScreen() {
            if (document.getElementById('lock-screen')) return;
            const ls = document.createElement('div');
            ls.id = 'lock-screen';
            ls.innerHTML = `
                <div class="lock-panel">
                    <div class="lock-avatar">👤</div>
                    <div class="lock-user">OS(KO)</div>
                    <button class="lock-btn">Odblokuj</button>
                </div>
            `;
            document.body.appendChild(ls);
            const btn = ls.querySelector('.lock-btn');
            btn.onclick = () => {
                this.unlock();
            };
            this._lockKeydown = (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.unlock();
                }
            };
            document.addEventListener('keydown', this._lockKeydown);
        }
    };

    const EventBus = {
        listeners: {},
        subscribe(event, callback) {
            if (!this.listeners[event]) this.listeners[event] = [];

            // Generate a unique secure token
            const secureId = window.crypto.getRandomValues(new Uint32Array(1))[0].toString(36) + Date.now().toString(36);
            const token = { id: secureId, cb: callback };
            this.listeners[event].push(token);
            return token;
        },
        unsubscribe(event, token) {
            if (!this.listeners[event]) return;
            this.listeners[event] = this.listeners[event].filter(t => t !== token && t.id !== token.id);
            if (this.listeners[event].length === 0) {
                delete this.listeners[event];
            }
        },
        publish(event, data) {
            if (this.listeners[event]) {
                [...this.listeners[event]].forEach(t => {
                    try {
                        t.cb(data);
                    } catch (e) {
                        console.error(`EventBus error [${event}]:`, e);
                    }
                });
            }
        }
    };
    let _toastCounter = 0;
    const Notifications = {
        show(options) {
            const id = 'toast_' + Date.now() + '_' + (++_toastCounter);
            const container = document.getElementById('notification-center');
            if (!container) return;
            const toast = document.createElement('div');
            toast.className = 'toast';
            toast.id = id;
            const titleEl = document.createElement('div');
            titleEl.className = 'toast-title';
            titleEl.innerText = options.title || 'System';
            const bodyEl = document.createElement('div');
            bodyEl.className = 'toast-body';
            bodyEl.innerText = options.message || '';
            toast.appendChild(titleEl);
            toast.appendChild(bodyEl);
            if (container.childElementCount >= 5) {
                const oldest = container.firstElementChild;
                if (oldest) oldest.remove();
            }
            container.appendChild(toast);
            setTimeout(() => {
                if (!toast.isConnected) return;
                toast.classList.add('fade-out');
                setTimeout(() => {
                    if (toast.isConnected) toast.remove();
                }, 500);
            }, 3000);
        }
    };
    const AudioEngine = {
        ctx: null,
        enabled: true,
        async init() {
            try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { }
            try {
                const audioSet = await VFS.read('/home/user/settings/audio.json', 'system');
                if (audioSet) {
                    const parsed = JSON.parse(audioSet);
                    this.enabled = !!parsed.enabled;
                }
            } catch (e) {
                SysLog.log('WARN', 'Failed to parse audio.json, defaulting to enabled.', 'AudioEngine');
                this.enabled = true;
            }

            EventBus.subscribe('app:settings:audio_changed', (msg) => {
                if (msg && msg.data !== undefined) {
                    this.enabled = !!msg.data.enabled;
                }
            });
        },
        async play(type) {
            if (!this.enabled || !this.ctx) return;
            if (this.ctx.state === 'suspended') {
                try { await this.ctx.resume(); } catch (e) { return; }
            }

            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.connect(gain);
            gain.connect(this.ctx.destination);

            const now = this.ctx.currentTime;

            if (type === 'startup') {
                osc.type = 'sine';
                osc.frequency.setValueAtTime(440, now);
                osc.frequency.exponentialRampToValueAtTime(880, now + 0.5);
                osc.start(now);
                osc.stop(now + 0.5);
                osc.onended = () => { osc.disconnect(); gain.disconnect(); };
            } else if (type === 'click') {
                osc.type = 'sine';
                osc.frequency.setValueAtTime(600, now);
                gain.gain.setValueAtTime(0.05, now);
                osc.start(now);
                osc.stop(now + 0.05);
                osc.onended = () => { osc.disconnect(); gain.disconnect(); };
            } else if (type === 'error') {
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(200, now);
                osc.frequency.linearRampToValueAtTime(100, now + 0.3);
                gain.gain.setValueAtTime(0.1, now);
                osc.start(now);
                osc.stop(now + 0.3);
                osc.onended = () => { osc.disconnect(); gain.disconnect(); };
            } else if (type === 'notify') {
                osc.type = 'sine';
                osc.frequency.setValueAtTime(880, now);
                osc.frequency.setValueAtTime(1100, now + 0.1);
                gain.gain.setValueAtTime(0.05, now);
                gain.gain.linearRampToValueAtTime(0, now + 0.3);
                osc.start(now);
                osc.stop(now + 0.3);
                osc.onended = () => { osc.disconnect(); gain.disconnect(); };
            }
        }
    };
    const Permissions = {
        check(manifest, permission) {
            if (!manifest.permissions) return false;
            return manifest.permissions.includes(permission);
        },
        createScopedAPI(appDef) {
            const appId = appDef.id;
            const manifest = appDef.manifest || {};
            const check = (perm) => {
                const granted = this.check(manifest, perm);
                if (!granted) {
                    Notifications.show({
                        title: 'Security',
                        message: `App "${appDef.name}" tried to use "${perm}" without permission.`
                    });
                }
                return granted;
            };
            let _cachedProc = null;
            const _getProc = () => {
                if (_cachedProc && state.processes.includes(_cachedProc)) return _cachedProc;
                _cachedProc = state.processes.find(p => p.appId === appId);
                return _cachedProc;
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
                                appId: p.appId,
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
                    lock: () => SessionManager.lock(),
                    getAssociation: (ext) => VFS.read(`/sys/associations/${ext}`, 'system'),
                    setTheme: (name) => ThemeEngine.setTheme(name),
                    setWallpaper: (val) => ThemeEngine.setWallpaper(val),
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
    const ContextMenu = {
        _activeListener: null,
        _timeout: null,
        show(e, items) {
            if (e) {
                e.preventDefault();
                e.stopPropagation();
            }
            this.hide();
            const menu = document.createElement('div');
            menu.className = 'context-menu';
            items.forEach(item => {
                if (item.type === 'separator') {
                    const sep = document.createElement('div');
                    sep.className = 'context-menu-separator';
                    menu.appendChild(sep);
                    return;
                }
                const el = document.createElement('div');
                el.className = 'context-menu-item';
                el.innerText = item.label;
                el.onclick = (event) => {
                    event.stopPropagation();
                    item.action();
                    this.hide();
                };
                menu.appendChild(el);
            });
            document.body.appendChild(menu);
            menu.style.display = 'block';
            menu.classList.add('active');
            const rect = menu.getBoundingClientRect();
            const MathMax = Math.max;
            let menuWidth = rect.width || 180;
            let menuHeight = rect.height || (items.length * 36);
            let x = e ? e.clientX : 0;
            let y = e ? e.clientY : 0;
            if (x + menuWidth > window.innerWidth) x = MathMax(0, window.innerWidth - menuWidth - 10);
            if (y + menuHeight > window.innerHeight) y = MathMax(0, window.innerHeight - menuHeight - 10);
            menu.style.left = x + 'px';
            menu.style.top = y + 'px';
            this._activeListener = (evt) => {
                if (!menu.contains(evt.target)) this.hide();
            };
            if (this._timeout) clearTimeout(this._timeout);
            this._timeout = setTimeout(() => {
                document.addEventListener('mousedown', this._activeListener);
                document.addEventListener('contextmenu', this._activeListener);
                this._timeout = null;
            }, 10);
        },
        hide() {
            if (this._timeout) {
                clearTimeout(this._timeout);
                this._timeout = null;
            }
            if (this._activeListener) {
                document.removeEventListener('mousedown', this._activeListener);
                document.removeEventListener('contextmenu', this._activeListener);
                this._activeListener = null;
            }
            const existings = document.querySelectorAll('.context-menu');
            existings.forEach(existing => existing.remove());
        }
    };
    const events = {
        on: (evt, cb) => EventBus.subscribe(evt, cb),
        emit: (evt, data) => EventBus.publish(evt, data)
    };
    const WindowManager = {
        create(options, appId) {
            const secureId = window.crypto.getRandomValues(new Uint32Array(1))[0].toString(36);
            const id = `win_${secureId}`;
            const winEl = document.createElement('div');
            winEl.className = 'window';
            winEl.id = id;
            winEl.style.width = options.width || '400px';
            winEl.style.height = options.height || '300px';
            const cascadeOffset = (state.windows.length * 22) % (window.innerHeight / 3);
            let baseX = parseInt(options.x !== undefined ? options.x : (100 + cascadeOffset));
            let baseY = parseInt(options.y !== undefined ? options.y : (80 + cascadeOffset));
            const maxW = window.innerWidth - 60;
            const maxH = window.innerHeight - 60;
            if (baseX > maxW || baseX < 0) baseX = 20;
            if (baseY > maxH || baseY < 0) baseY = 20;
            winEl.style.left = baseX + 'px';
            winEl.style.top = baseY + 'px';
            winEl.innerHTML = `
                <div class="window-header">
                    <div class="window-title"></div>
                    <div class="window-controls">
                        <button class="control-btn minimize" title="Minimalizuj">−</button>
                        <button class="control-btn maximize" title="Maksymalizuj">□</button>
                        <button class="control-btn close" title="Zamknij">×</button>
                    </div>
                </div>
                <div class="window-content"></div>
                <div class="window-resizer"></div>
            `;
            winEl.querySelector('.window-title').textContent = `${options.icon || ''} ${options.title || 'App'}`;
            document.getElementById('window-layer').appendChild(winEl);
            const win = { id, element: winEl, appId, state: 'normal' };
            state.windows.push(win);
            this.makeDraggable(winEl);
            this.makeResizable(winEl);
            this.setupFocus(winEl);
            this.focus(id);
            winEl.querySelector('.close').onclick = () => WebOS.killApp(appId);
            winEl.querySelector('.minimize').onclick = () => this.minimize(id);
            winEl.querySelector('.maximize').onclick = () => this.toggleMaximize(id);
            return {
                id,
                container: winEl.querySelector('.window-content'),
                close: () => this.destroy(id)
            };
        },
        minimize(id) {
            const win = state.windows.find(w => w.id === id);
            if (win) {
                win.element.style.display = 'none';
                win.state = 'minimized';
                if (state.focusedWindow === id) {
                    state.focusedWindow = null;
                    if (state.windowStack) {
                        const nextWinId = [...state.windowStack].reverse().find(
                            wid => wid !== id && state.windows.find(w => w.id === wid && w.state !== 'minimized' && !w.element.classList.contains('window-closing'))
                        );
                        if (nextWinId) this.focus(nextWinId);
                    }
                }
                WebOS.updateTaskbar();
            }
        },
        toggleMaximize(id) {
            const win = state.windows.find(w => w.id === id);
            if (!win) return;
            if (win.state === 'maximized') {
                win.element.style.width = win.oldWidth || '400px';
                win.element.style.height = win.oldHeight || '300px';
                win.element.style.top = win.oldTop || '100px';
                win.element.style.left = win.oldLeft || '100px';
                win.element.classList.remove('window-snapped');
                win.state = 'normal';
            } else {
                if (!win.element.classList.contains('window-snapped')) {
                    win.oldWidth = win.element.style.width;
                    win.oldHeight = win.element.style.height;
                    win.oldTop = win.element.style.top;
                    win.oldLeft = win.element.style.left;
                }
                win.element.style.width = '100%';
                win.element.style.height = 'calc(100% - 40px)';
                win.element.style.top = '0';
                win.element.style.left = '0';
                win.state = 'maximized';
                win.element.classList.remove('window-snapped');
            }
        },
        destroy(id) {
            const win = state.windows.find(w => w.id === id);
            if (!win || win._destroying) return;
            win._destroying = true;
            win.element.classList.add('window-closing');

            if (state.windowStack) {
                state.windowStack = state.windowStack.filter(winId => winId !== id);
            }

            if (state.focusedWindow === id) {
                state.focusedWindow = null;
                if (state.windowStack) {
                    const nextWinId = [...state.windowStack].reverse().find(
                        wid => wid !== id && state.windows.find(w => w.id === wid && w.state !== 'minimized' && !w.element.classList.contains('window-closing'))
                    );
                    if (nextWinId) this.focus(nextWinId);
                }
            }

            setTimeout(() => {
                win.element.remove();
                const currentIndex = state.windows.findIndex(w => w.id === id);
                if (currentIndex > -1) state.windows.splice(currentIndex, 1);
                events.emit('window:closed', id);
            }, 200);
        },
        focus(id) {
            const win = state.windows.find(w => w.id === id);
            if (!win) return;
            if (state.focusedWindow === id) return;
            SysLog.log('DEBUG', `Focus Window: ${id}`, 'WindowManager');
            if (state.focusedWindow) {
                const prevFocus = state.windows.find(w => w.id === state.focusedWindow);
                if (prevFocus) prevFocus.element.classList.remove('focused');
            }
            win.element.classList.add('focused');
            state.focusedWindow = id;
            const proc = state.processes.find(p => p.windowId === id);
            if (proc && proc.appDef.onFocus) {
                try { proc.appDef.onFocus(); } catch (e) {
                    console.error(`[Kernel] App "${proc.appDef.name}" onFocus error:`, e);
                    SysLog.log('ERR', `onFocus error in ${proc.appDef.name}: ${e.message}`);
                }
            }
            if (proc) {
                EventBus.publish('window:focus', { appId: proc.appId, windowId: id });
            }
            if (!state.windowStack) state.windowStack = [];
            state.windowStack = state.windowStack.filter(winId => winId !== id);
            state.windowStack.push(id);
            const winMap = {};
            state.windows.forEach(w => winMap[w.id] = w);
            state.windowStack.forEach((winId, index) => {
                const w = winMap[winId];
                if (w) {
                    const zIndex = 100 + index;
                    if (w.element.style.zIndex != zIndex) {
                        w.element.style.zIndex = zIndex;
                    }
                }
            });
        },
        createSnapPreview() {
            let preview = document.getElementById('snap-preview');
            if (!preview) {
                preview = document.createElement('div');
                preview.id = 'snap-preview';
                document.body.appendChild(preview);
            }
            return preview;
        },
        setupFocus(el) {
            el.onmousedown = () => this.focus(el.id);
        },
        makeDraggable(el) {
            const header = el.querySelector('.window-header');
            let dragging = false;
            let currentX, currentY, initialX, initialY;
            let snapPreview = null;

            header.onmousedown = (e) => {
                if (e.button !== 0) return;
                dragging = true;
                initialX = e.clientX;
                initialY = e.clientY;
                if (!snapPreview) snapPreview = WindowManager.createSnapPreview();

                let animationQueued = false;
                const onMouseMove = (moveEvent) => {
                    if (!dragging) return;
                    currentX = moveEvent.clientX;
                    currentY = moveEvent.clientY;

                    if (!animationQueued) {
                        animationQueued = true;
                        requestAnimationFrame(() => {
                            animationQueued = false;
                            const win = state.windows.find(w => w.element === el);
                            if (win && (win.state === 'maximized' || el.classList.contains('window-snapped'))) {
                                const ratio = (currentX - el.offsetLeft) / el.offsetWidth;
                                if (win.state === 'maximized') {
                                    WindowManager.toggleMaximize(win.id);
                                } else {
                                    el.classList.remove('window-snapped');
                                    if (win.oldWidth) el.style.width = win.oldWidth;
                                    if (win.oldHeight) el.style.height = win.oldHeight;
                                }
                                const newWidth = parseInt(el.style.width) || el.offsetWidth;
                                initialX = currentX;
                                el.style.left = (currentX - (newWidth * ratio)) + 'px';
                            }
                            updatePosition();
                        });
                    }
                };
                const onMouseUp = () => {
                    if (dragging) {
                        dragging = false;
                        closeDragElement();
                    }
                    document.removeEventListener('mousemove', onMouseMove);
                    document.removeEventListener('mouseup', onMouseUp);
                };
                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);
            };
            const updatePosition = () => {
                if (!dragging) return;
                const dx = initialX - currentX;
                const dy = initialY - currentY;
                initialX = currentX;
                initialY = currentY;
                const top = Math.max(0, Math.min(state.viewport.h - 40, el.offsetTop - dy));
                const left = Math.max(-el.offsetWidth + 40, Math.min(state.viewport.w - 40, el.offsetLeft - dx));
                el.style.top = top + "px";
                el.style.left = left + "px";

                const edge = 30;
                const corner = 60;
                snapPreview.style.display = 'block';
                if (currentY < corner && currentX < corner) {
                    snapPreview.dataset.snap = 'top-left';
                    Object.assign(snapPreview.style, { top: '0', left: '0', width: '50%', height: '50vh' });
                } else if (currentY < corner && currentX > state.viewport.w - corner) {
                    snapPreview.dataset.snap = 'top-right';
                    Object.assign(snapPreview.style, { top: '0', left: '50%', width: '50%', height: '50vh' });
                } else if (currentY > state.viewport.h - corner - 40 && currentX < corner) {
                    snapPreview.dataset.snap = 'bottom-left';
                    Object.assign(snapPreview.style, { top: '50vh', left: '0', width: '50%', height: 'calc(50vh - 40px)' });
                } else if (currentY > state.viewport.h - corner - 40 && currentX > state.viewport.w - corner) {
                    snapPreview.dataset.snap = 'bottom-right';
                    Object.assign(snapPreview.style, { top: '50vh', left: '50%', width: '50%', height: 'calc(50vh - 40px)' });
                } else if (currentY < edge) {
                    snapPreview.dataset.snap = 'top';
                    Object.assign(snapPreview.style, { top: '0', left: '0', width: '100%', height: '50vh' });
                } else if (currentY > state.viewport.h - edge - 40) {
                    snapPreview.dataset.snap = 'bottom';
                    Object.assign(snapPreview.style, { top: '50vh', left: '0', width: '100%', height: 'calc(50vh - 40px)' });
                } else if (currentX < edge) {
                    snapPreview.dataset.snap = 'left';
                    Object.assign(snapPreview.style, { top: '0', left: '0', width: '50%', height: 'calc(100% - 40px)' });
                } else if (currentX > state.viewport.w - edge) {
                    snapPreview.dataset.snap = 'right';
                    Object.assign(snapPreview.style, { top: '0', left: '50%', width: '50%', height: 'calc(100% - 40px)' });
                } else {
                    snapPreview.classList.remove('visible');
                    setTimeout(() => { if (!snapPreview.classList.contains('visible')) snapPreview.style.display = 'none'; }, 200);
                    return;
                }
                snapPreview.style.display = 'block';
                requestAnimationFrame(() => snapPreview.classList.add('visible'));
            };
            const closeDragElement = () => {
                const preview = document.getElementById('snap-preview');
                if (preview && preview.classList.contains('visible')) {
                    const snap = preview.dataset.snap;
                    const win = state.windows.find(w => w.element === el);
                    if (win && win.state !== 'maximized' && snap !== 'top') {
                        win.oldWidth = el.style.width;
                        win.oldHeight = el.style.height;
                        win.oldTop = el.style.top;
                        win.oldLeft = el.style.left;
                    }
                    el.classList.add('window-snapping');
                    el.classList.add('window-snapped');
                    SysLog.log('DEBUG', `Window Snapped: ${snap}`, 'WindowManager', { winId: win.id, snap });
                    if (snap === 'left' || snap === 'right') {
                        Object.assign(el.style, { top: '0', height: 'calc(100vh - 40px)', width: '50%', left: snap === 'left' ? '0' : '50%' });
                    } else if (snap === 'top') {
                        Object.assign(el.style, { top: '0', left: '0', height: '50vh', width: '100%' });
                    } else if (snap === 'bottom') {
                        Object.assign(el.style, { left: '0', width: '100%', height: 'calc(50vh - 40px)', top: '50vh' });
                    } else if (snap === 'top-left') {
                        Object.assign(el.style, { top: '0', left: '0', width: '50%', height: '50vh' });
                    } else if (snap === 'top-right') {
                        Object.assign(el.style, { top: '0', left: '50%', width: '50%', height: '50vh' });
                    } else if (snap === 'bottom-left') {
                        Object.assign(el.style, { top: '50vh', left: '0', width: '50%', height: 'calc(50vh - 40px)' });
                    } else if (snap === 'bottom-right') {
                        Object.assign(el.style, { top: '50vh', left: '50%', width: '50%', height: 'calc(50vh - 40px)' });
                    }
                    preview.style.display = 'none';
                    setTimeout(() => el.classList.remove('window-snapping'), 300);
                } else if (preview) {
                    preview.style.display = 'none';
                    el.classList.remove('window-snapped');
                }
                WebOS.saveState();
            };
        },
        makeResizable(el) {
            const resizer = el.querySelector('.window-resizer');
            if (!resizer) return;
            let isResizing = false;
            let startWidth, startHeight, startX, startY;
            resizer.addEventListener('mousedown', (e) => {
                const win = state.windows.find(w => w.element === el);
                if (win && win.state === 'maximized') return;
                isResizing = true;
                this.focus(win ? win.id : el.id);
                startWidth = el.offsetWidth;
                startHeight = el.offsetHeight;
                startX = e.clientX;
                startY = e.clientY;
                e.stopPropagation();
                e.preventDefault();

                let rAFQueued = false;
                let dX, dY;
                const onMouseMove = (moveEvent) => {
                    if (!isResizing) return;
                    dX = moveEvent.clientX - startX;
                    dY = moveEvent.clientY - startY;
                    if (!rAFQueued) {
                        rAFQueued = true;
                        requestAnimationFrame(() => {
                            rAFQueued = false;
                            const newWidth = Math.max(320, startWidth + dX);
                            const newHeight = Math.max(200, startHeight + dY);
                            el.style.width = newWidth + 'px';
                            el.style.height = newHeight + 'px';
                            if (el.classList.contains('window-snapped')) {
                                el.classList.remove('window-snapped');
                                if (win) {
                                    win.oldWidth = null;
                                    win.oldHeight = null;
                                }
                            }
                        });
                    }
                };

                const onMouseUp = () => {
                    isResizing = false;
                    document.removeEventListener('mousemove', onMouseMove);
                    document.removeEventListener('mouseup', onMouseUp);
                    WebOS.saveState();
                };

                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);
            });
        }
    };
    global.WebOS = {
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

                        // Constraint boundaries
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
    const ThemeEngine = {
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
                if (e.target.closest('.taskbar-item')) return; // Ignore clicks directly on app icons
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
})(window);
