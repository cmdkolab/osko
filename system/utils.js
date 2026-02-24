if (!window.I18n) { window.I18n = { t: (key, ...args) => { let res = key; args.forEach((a, i) => res = res.replace(`{${i}}`, a)); return res; }, current: 'en' }; }
window.deepMerge = (target, source) => {
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
window.deepMergeSync = (target, source) => {
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
