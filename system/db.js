    globalThis.DBWrapper = {
        dbName: 'OSKO_DB',
        storeName: 'vfs_nodes',
        version: 1,
        _db: null,
        _memory: new Map(),
        _isFallback: false,
        _isReady: false,
        _readyPromise: null,
        init() {
            if (this._readyPromise) return this._readyPromise;
            this._readyPromise = new Promise((resolve) => {
                if (!globalThis.indexedDB) {
                    this._isFallback = true;
                    this._isReady = true;
                    console.warn('[DBWrapper] IndexedDB not supported. Switching to in-memory storage.');
                    return resolve();
                }
                const request = indexedDB.open(this.dbName, this.version);
                request.onerror = (e) => {
                    this._isFallback = true;
                    this._isReady = true;
                    e.preventDefault();
                    SysLog.log('WARN', 'IndexedDB access denied. Falling back to memory.', 'DBWrapper', { error: e.target.error?.message });
                    resolve();
                };
                request.onblocked = () => {
                    SysLog.log('WARN', 'Database blocked by another tab.', 'DBWrapper');
                };
                request.onsuccess = (e) => {
                    this._db = e.target.result;
                    this._isReady = true;
                    SysLog.log('DEBUG', 'Database connection established.', 'DBWrapper');
                    this._db.onversionchange = () => {
                        this._db.close();
                        this._db = null;
                        this._isReady = false;
                        WebOS.ui.showDialog({
                            message: globalThis.I18n.t('dialog.db_upgrade'),
                            type: 'alert',
                            acceptText: globalThis.I18n.t('dialog.db_upgrade_btn'),
                            onAccept: () => globalThis.location.reload()
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
            return this._readyPromise;
        },
        async waitReady() {
            if (this._isReady) return;
            await this.init();
        },
        async get(key) {
            if (this._isFallback) return this._memory.get(key) ?? null;
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
                this._memory.set(key, val);
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
                this._memory.delete(key);
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
        },
        async clear() {
            if (this._isFallback) {
                this._memory.clear();
                return Promise.resolve();
            }
            if (!this._db) throw new Error('DBWrapper: database not initialized');
            return new Promise((resolve, reject) => {
                const tx = this._db.transaction([this.storeName], 'readwrite');
                tx.onerror = () => reject(tx.error);
                const store = tx.objectStore(this.storeName);
                const req = store.clear();
                req.onsuccess = () => resolve();
                req.onerror = (e) => { e.stopPropagation(); reject(req.error); };
            });
        }
    };
