window.SESSION_ID = window.crypto.getRandomValues(new Uint32Array(1))[0].toString(36).toUpperCase().padStart(4, '0').substring(0, 4);
window.SysLog = {
    _buffer: null,
    _writeTimer: null,
    _isWriting: false,
    _retryCount: 0,
    _heartbeatTimer: null,
    _lastProcCount: 0,
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
        let counter = 0;
        this._heartbeatTimer = setInterval(() => {
            counter++;
            const procCount = state.processes.length;
            const hasChanged = procCount !== this._lastProcCount;
            if (hasChanged || counter % 5 === 0) {
                this._lastProcCount = procCount;
                const stats = {
                    procs: procCount,
                    vfs: VFS.getTotalUsage()
                };
                this.log('DEBUG', `Heartbeat [${hasChanged ? 'CHANGED' : 'PERIODIC'}]: ${state.processes.map(p => p.appDef.name).join(', ') || 'Idle'}`, 'Kernel', stats);
            }
        }, 60000);
    },
    _serializeMetadata(metadata) {
        if (!metadata) return '';
        try {
            const seen = new WeakSet();
            return ` | META: ${JSON.stringify(metadata, (key, value) => {
                if (typeof value === 'object' && value !== null) {
                    if (seen.has(value)) return '[Circular]';
                    seen.add(value);
                }
                if (value instanceof HTMLElement) return `[HTMLElement ${value.tagName}${value.id ? '#' + value.id : ''}]`;
                if (value instanceof Error) return `[Error ${value.message}]`;
                return value;
            })}`;
        } catch (e) {
            return ' | META: [Unserializable]';
        }
    },
    log(level, msg, source = 'Kernel', metadata = null) {
        const time = new Date().toLocaleTimeString();
        level = level.toUpperCase();
        const metadataStr = this._serializeMetadata(metadata);
        const prefix = `[${time}] [${this.SESSION_ID}] [${level}] [${source}]`;
        let entry;
        if (msg instanceof Error) {
            entry = `${prefix} ${msg.message}${metadataStr}\nStack: ${msg.stack}\n`;
        } else if (typeof msg === 'object') {
            try { entry = `${prefix} ${JSON.stringify(msg, null, 2)}${metadataStr}\n`; } catch (e) { entry = `${prefix} [Object]${metadataStr}\n`; }
        } else {
            entry = `${prefix} ${msg}${metadataStr}\n`;
        }
        const colors = { DEBUG: '#94a3b8', INFO: '#3b82f6', WARN: '#f59e0b', ERR: '#ef4444' };
        const style = `color: ${colors[level] || 'inherit'};`;
        console.log(`%c OS(KO) %c ${entry.trim()}`, 'background: #3b82f6; color: white; font-weight: bold; border-radius: 2px; padding: 0 2px;', style);
        if (this._buffer === null) {
            this._buffer = '';
            try {
                const savedLog = VFS.read('/var/log/syslog', 'system');
                if (savedLog) this._buffer = savedLog;
            } catch (e) { }
        }
        this._buffer += entry;
        if (this._buffer.length > 50000) {
            this._buffer = '... (truncated)\n' + this._buffer.slice(-40000);
        }
        this._scheduleWrite(level === 'ERR');
    },
    _scheduleWrite(isEmergency = false) {
        if (this._writeTimer) clearTimeout(this._writeTimer);
        const delay = isEmergency ? 200 : 1000;
        this._writeTimer = setTimeout(async () => {
            if (this._buffer === null || this._isWriting) return;
            this._isWriting = true;
            try {
                await VFS.write('/var/log/syslog', this._buffer, 'system');
                await VFS.saveImmediate();
                this._retryCount = 0;
            } catch (e) {
                this._retryCount++;
                console.error(`[Kernel] SysLog Persistence Failed (Attempt ${this._retryCount})`, e);
                if (this._retryCount < 5) {
                    this._scheduleWrite(false);
                }
            } finally {
                this._isWriting = false;
            }
            this._writeTimer = null;
        }, delay);
    },
    getBuffer() {
        if (this._buffer === null) {
            this._buffer = '';
            try {
                const savedLog = VFS.read('/var/log/syslog', 'system');
                if (savedLog) this._buffer = savedLog;
            } catch (e) { }
        }
        return this._buffer;
    }
};
