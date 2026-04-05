window.deepMerge = (target, source) => {
    for (const key in source) {
        if (key === '__proto__' || key === 'constructor') continue;
        const val = source[key];
        if (val && typeof val === 'object' && val.content === undefined) {
            if (Array.isArray(val)) {
                target[key] = [...val];
            } else {
                if (!target[key] || typeof target[key] !== 'object' || Array.isArray(target[key])) {
                    target[key] = {};
                }
                deepMerge(target[key], val);
            }
        } else {
            target[key] = val;
        }
    }
};
window.deepMergeSync = (target, source) => {
    for (const key in target) {
        if (!(key in source) && key !== '__proto__' && key !== 'constructor') {
            delete target[key];
        }
    }
    for (const key in source) {
        if (key === '__proto__' || key === 'constructor') continue;
        const val = source[key];
        if (val && typeof val === 'object' && val.content === undefined) {
            if (Array.isArray(val)) {
                target[key] = [...val];
            } else {
                if (!target[key] || typeof target[key] !== 'object' || Array.isArray(target[key]) || target[key].content !== undefined) {
                    target[key] = {};
                }
                deepMergeSync(target[key], val);
            }
        } else {
            target[key] = val;
        }
    }
};
window.deepClone = (obj) => {
    if (!obj || typeof obj !== 'object') return obj;
    try {
        if (typeof structuredClone === 'function') return structuredClone(obj);
        return JSON.parse(JSON.stringify(obj));
    } catch (e) {
        console.warn('[Utils] deepClone failed, returning null:', e);
        return null;
    }
};
