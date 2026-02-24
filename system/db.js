    window.DBWrapper = {
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
                    e.preventDefault();
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
