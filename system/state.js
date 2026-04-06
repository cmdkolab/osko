    globalThis.state = {
        apps: {},
        processes: [],
        windows: [],
        nextPid: 1000,
        focusedWindow: null,
        isLocked: false,
        persistenceKey: 'SYSTEM_STATE',
        deferredRestoration: null,
        windowStack: [],
        viewport: { w: globalThis.innerWidth, h: globalThis.innerHeight },
        positionsLoaded: false,
        addProcess(proc) {
            this.processes.push(proc);
            return proc;
        },
        removeProcess(pid) {
            const index = this.processes.findIndex(p => p.pid === pid);
            if (index !== -1) {
                return this.processes.splice(index, 1)[0];
            }
            return null;
        },
        getWindowByAppId(appId) {
            return this.windows.find(w => w.appId === appId);
        },
        getProcessByAppId(appId) {
            return this.processes.find(p => p.appId === appId);
        }
    };
