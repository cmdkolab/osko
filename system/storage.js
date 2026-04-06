globalThis.PersistenceManager = {
    PREFIX: 'OSKO:',
    storeName: 'vfs_nodes',
    SYSTEM_DIR: '/sys',
    TEMP_DIR: '/tmp',
    START_TIME: Date.now(),
    VERSION: '5.4.1',
    async get(key) {
        try { return await DBWrapper.get(this.PREFIX + key); } catch (e) { return null; }
    },
    async set(key, value) {
        try {
            await DBWrapper.set(this.PREFIX + key, value);
        } catch (e) {
            console.error("[Kernel] Persistence Error:", e);
            if (!key.startsWith('VFS:ROOT')) SysLog.log('ERR', `Persistence Failure: ${e.message}`, 'PersistenceManager');
        }
    },
    async remove(key) {
        try {
            await DBWrapper.remove(this.PREFIX + key);
        } catch (e) {
            console.error("[Kernel] Removal Error:", e);
            SysLog.log('ERR', `Removal Failure: ${e.message}`, 'PersistenceManager');
        }
    },
    async clear() {
        try {
            await DBWrapper.clear();
            SysLog.log('INFO', 'All persistence data cleared', 'PersistenceManager');
        } catch (e) {
            console.error("[Kernel] Clear Error:", e);
            SysLog.log('ERR', `Clear Failure: ${e.message}`, 'PersistenceManager');
        }
    }
};