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
                if (path.startsWith('/home/user/Documents') && manifest.permissions?.includes('fs.shared')) return true;
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
            if (path.startsWith('/home/user/Documents')) {
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
                if (currentUsage + usageDelta > this.QUOTA_PER_APP) {
                    SysLog.log('ERR', `Quota Exceeded: ${owner} tried to write ${newSize} bytes`, owner);
                    Notifications.show({ title: 'System', message: window.I18n.t('dialog.quota_exceeded', owner) });
                    return false;
                }
            }

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
            if (!this.checkAccess(path, appId, 'r', manifest)) return null;
            const node = this._resolve(path);
            if (node && typeof node === 'object' && node.content === undefined) {
                return Object.keys(node)
                    .filter(name => !['owner', 'mtime', 'size', 'mode'].includes(name))
                    .map(name => {
                        const child = node[name];
                        const isFile = typeof child === 'string' || (child && child.content !== undefined);
                        return { name, type: isFile ? 'file' : 'dir' };
                    });
            }
            return null;
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
                    if (['owner', 'mtime', 'size', 'content', 'mode'].includes(name)) continue;
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
