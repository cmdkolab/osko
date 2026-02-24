window.SESSION_ID = window.crypto.getRandomValues(new Uint32Array(1))[0].toString(36).toUpperCase().padStart(4, '0').substring(0, 4);
window.SysLog = {
    _buffer: null,
    _writeTimer: null,
    _isWriting: false,
    _failedOnce: false,
    _heartbeatTimer: null,
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
        this._heartbeatTimer = setInterval(() => {
            const stats = {
                procs: state.processes.length,
                vfs: VFS.getTotalUsage()
            };
            this.log('DEBUG', `System Heartbeat: ${state.processes.map(p => p.appDef.name).join(', ') || 'Idle'}`, 'Kernel', stats);
        }, 30000);
    },
    log(level, msg, source = 'Kernel', metadata = null) {
        const time = new Date().toLocaleTimeString();
        level = level.toUpperCase();

        let metadataStr = '';
        if (metadata) {
            try {
                const seen = new WeakSet();
                metadataStr = ` | META: ${JSON.stringify(metadata, (key, value) => {
                    if (typeof value === 'object' && value !== null) {
                        if (seen.has(value)) return '[Circular]';
                        seen.add(value);
                    }
                    if (value instanceof HTMLElement) return `[HTMLElement ${value.tagName}${value.id ? '#' + value.id : ''}]`;
                    if (value instanceof Error) return `[Error ${value.message}]`;
                    return value;
                })}`;
            } catch (e) { metadataStr = ' | META: [Unserializable]'; }
        }

        let entry;
        const prefix = `[${time}] [${this.SESSION_ID}] [${level}] [${source}]`;

        if (msg instanceof Error) {
            entry = `${prefix} ${msg.message}${metadataStr}\nStack: ${msg.stack}\n`;
        } else if (typeof msg === 'object') {
            try { entry = `${prefix} ${JSON.stringify(msg, null, 2)}${metadataStr}\n`; } catch (e) { entry = `${prefix} [Object]${metadataStr}\n`; }
        } else {
            entry = `${prefix} ${msg}${metadataStr}\n`;
        }

        const colors = {
            DEBUG: 'color: #94a3b8;',
            INFO: 'color: #3b82f6;',
            WARN: 'color: #f59e0b;',
            ERR: 'color: #ef4444;'
        };
        const style = colors[level] || 'color: inherit;';
        console.log(`%c OS(KO) %c ${entry.trim()}`, 'background: #3b82f6; color: white; font-weight: bold; border-radius: 2px; padding: 0 2px;', style);

        if (this._buffer === null) {
            this._buffer = '';
            try {
                const savedLog = VFS.read('/var/log/syslog', 'system');
                if (savedLog) this._buffer = savedLog + this._buffer;
            } catch (e) { }
        }
        this._buffer += entry;
        if (this._buffer.length > 50000) {
            this._buffer = '... (truncated)\n' + this._buffer.slice(-40000);
        }
        if (this._writeTimer) clearTimeout(this._writeTimer);
        const delay = level === 'ERR' ? 500 : 5000;
        this._writeTimer = setTimeout(async () => {
            if (this._buffer !== null && !this._isWriting && !this._failedOnce) {
                this._isWriting = true;
                try {
                    await VFS.write('/var/log/syslog', this._buffer, 'system');
                } catch (e) {
                    console.error("[Kernel] SysLog Persistence Failed.", e);
                    this._failedOnce = true;
                } finally {
                    this._isWriting = false;
                }
            }
            this._writeTimer = null;
        }, delay);
    }
};
