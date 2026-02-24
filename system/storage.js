window.PersistenceManager = {
    PREFIX: 'OSKO:',
    SYSTEM_DIR: '/sys',
    TEMP_DIR: '/tmp',
    START_TIME: Date.now(),
    VERSION: '3.5.0',
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
