    window.state = {
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
