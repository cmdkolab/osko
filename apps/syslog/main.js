WebOS.registerApp({
    id: "syslog",
    get name() { return window.I18n.t('syslog.title'); },
    icon: "📜",
    version: "4.9.0",
    manifest: {
        get name() { return window.I18n.t('syslog.title'); },
        icon: "📜",
        permissions: ["fs.read", "fs.write", "notifications"]
    },
    width: "800px",
    height: "550px",
    async mount(container, api) {
        this.container = container;
        this.api = api;
        this.filter = 'ALL';
        this.searchQuery = '';
        this.autoScroll = true;
        this._maxLines = 1000;
        const renderFrame = () => {
            container.innerHTML = `
                <div class="syslog-app">
                    <div class="syslog-toolbar">
                        <div class="toolbar-left">
                            <button class="sys-btn filter-btn active" data-filter="ALL">${window.I18n.t('syslog.filter_all')}</button>
                            <button class="sys-btn filter-btn" data-filter="INFO">INFO</button>
                            <button class="sys-btn filter-btn" data-filter="WARN">WARN</button>
                            <button class="sys-btn filter-btn" data-filter="ERR">ERR</button>
                            <select class="source-select">
                                <option value="ALL">${window.I18n.t('syslog.source_all')}</option>
                            </select>
                        </div>
                        <div class="toolbar-right">
                            <input type="text" class="syslog-search" placeholder="${window.I18n.t('syslog.search')}">
                            <button class="sys-btn autoscroll-btn active" title="Auto-scroll">⬇️</button>
                            <button class="sys-btn save-btn" title="Save to File">💾</button>
                            <button class="sys-btn clear-btn danger" title="${window.I18n.t('syslog.confirm_clear')}">🗑️</button>
                        </div>
                    </div>
                    <div class="syslog-viewer"></div>
                    <div class="syslog-status">
                         <span class="log-info">v${this.version}</span>
                         <span class="log-count">0 ${window.I18n.t('syslog.lines')}</span>
                    </div>
                </div>
            `;
            this.viewer = container.querySelector('.syslog-viewer');
            this.setupListeners(container);
            this.refresh();
        };
        this.renderFrame = renderFrame;
        renderFrame();
        this._i18nListener = () => renderFrame();
        window.addEventListener('i18n:changed', this._i18nListener);
    },
    setupListeners(container) {
        const api = this.api;
        container.querySelectorAll('.filter-btn').forEach(btn => {
            btn.onclick = () => {
                container.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.filter = btn.dataset.filter;
                this._forceRefresh = true;
                this.refresh();
            };
        });
        const searchInput = container.querySelector('.syslog-search');
        searchInput.oninput = (e) => {
            this.searchQuery = e.target.value.toLowerCase();
            this.refresh();
        };
        const autoscrollBtn = container.querySelector('.autoscroll-btn');
        autoscrollBtn.onclick = () => {
            this.autoScroll = !this.autoScroll;
            autoscrollBtn.classList.toggle('active', this.autoScroll);
        };
        container.querySelector('.save-btn').onclick = async () => {
            const logs = await api.fs.read('/var/log/syslog');
            if (logs) {
                const path = `/home/user/log_export_${new Date().getTime()}.txt`;
                await api.fs.write(path, logs);
                api.notifications.show({ title: window.I18n.t('syslog.app_title'), message: window.I18n.t('syslog.saved_to', path) });
            }
        };
        container.querySelector('.clear-btn').onclick = () => {
            api.ui.confirm(window.I18n.t('syslog.confirm_clear'), async (ok) => {
                if (ok) {
                    await api.fs.write('/var/log/syslog', `[${new Date().toISOString()}] [SYSTEM] [INFO] [Kernel] Log cleared by user\n`);
                    this.refresh();
                }
            });
        };
        this._vfsWatcher = (e) => {
            if (e?.data?.path === '/var/log/syslog') this.refresh();
        };
        api.system.subscribe('vfs:changed', this._vfsWatcher);
    },
    _parsedCache: [],
    _cacheVersion: 0,
    async refresh() {
        if (!this.viewer || this._refreshing) return;
        this._refreshing = true;
        try {
            let logs = null;
            if (window.SysLog) logs = window.SysLog.getBuffer();
            if (!logs) {
                try { logs = await this.api.fs.read('/var/log/syslog'); } catch(e) { logs = null; }
            }
            if (!logs) {
                this.viewer.innerHTML = `<div class="log-empty">${window.I18n.t('syslog.no_logs')}</div>`;
                this._lastLineCount = 0;
                this._parsedCache = [];
                this._refreshing = false;
                return;
            }
            const rawLines = logs.split('\n').filter(l => l.trim());
            if (rawLines.length > this._maxLines) rawLines.length = this._maxLines;
            const totalLines = rawLines.length;
            if (this._lastLineCount === totalLines && !this._forceRefresh && this._cacheVersion === rawLines.length) {
                this._refreshing = false;
                return;
            }
            const sourceSelect = this.container.querySelector('.source-select');
            const sourceFilter = sourceSelect ? sourceSelect.value : 'ALL';
            const isFullRefresh = this.filter !== 'ALL' || !!this.searchQuery || sourceFilter !== 'ALL' || this._forceRefresh;
            if (isFullRefresh || this._cacheVersion !== rawLines.length) {
                this._parsedCache = [];
                this._cacheVersion = rawLines.length;
                for (let i = 0; i < rawLines.length; i++) {
                    const match = rawLines[i].match(/^\[(.*?)\] \[(.*?)\] \[([A-Z]+)\] \[(.*?)\] (.*)$/);
                    if (match) {
                        this._parsedCache.push({ time: match[1], session: match[2], level: match[3], source: match[4], message: match[5], raw: rawLines[i] });
                    }
                }
            }
            const filtered = this._parsedCache.filter(p => {
                if (this.filter !== 'ALL' && p.level !== this.filter) return false;
                if (sourceFilter !== 'ALL' && p.source !== sourceFilter) return false;
                if (this.searchQuery && !p.raw.toLowerCase().includes(this.searchQuery)) return false;
                return true;
            });
            const displayLines = filtered.slice(-500);
            this.viewer.innerHTML = '';
            const fragment = document.createDocumentFragment();
            const batchSize = 100;
            let idx = 0;
            const renderBatch = () => {
                const end = Math.min(idx + batchSize, displayLines.length);
                for (let i = idx; i < end; i++) {
                    const p = displayLines[i];
                    const entry = document.createElement('div');
                    entry.className = `log-entry level-${p.level.toLowerCase()} reveal`;
                    entry.innerHTML = `<span class="log-time">${p.time.includes('T') ? p.time.split('T')[1].split('.')[0] : p.time}</span><span class="log-session">${p.session.slice(0, 8)}</span><span class="log-level">${p.level}</span><span class="log-source">${p.source}</span><span class="log-msg">${this.highlight(p.message)}</span>`;
                    entry.onclick = () => { this.api.system.setClipboard(p.raw); this.api.notifications.show({ title: window.I18n.t('syslog.app_title'), message: window.I18n.t('syslog.copied_to_clipboard') }); };
                    fragment.appendChild(entry);
                }
                idx = end;
                if (idx < displayLines.length) {
                    requestAnimationFrame(renderBatch);
                } else {
                    this.viewer.appendChild(fragment);
                    this._lastLineCount = totalLines;
                    this.viewer.scrollTop = this.autoScroll ? this.viewer.scrollHeight : this.viewer.scrollTop;
                    const status = this.container.querySelector('.log-count');
                    if (status) status.innerText = `${totalLines} ${window.I18n.t('syslog.lines')}`;
                    this._updateSources(rawLines);
                    this._forceRefresh = false;
                    this._refreshing = false;
                }
            };
            requestAnimationFrame(renderBatch);
        } catch (e) {
            this._refreshing = false;
        }
    },
    _updateSources(lines) {
        const sourceSelect = this.container.querySelector('.source-select');
        if (!sourceSelect) return;
        const currentSources = new Set();
        lines.forEach(line => {
            const match = line.match(/\[(.*?)\] \[(.*?)\] \[([A-Z]+)\] \[(.*?)\]/);
            if (match && match[4]) currentSources.add(match[4]);
        });
        const existing = Array.from(sourceSelect.options).map(o => o.value);
        let changed = false;
        currentSources.forEach(src => {
            if (!existing.includes(src)) {
                const opt = document.createElement('option');
                opt.value = src;
                opt.innerText = src;
                sourceSelect.appendChild(opt);
                changed = true;
            }
        });
        if (changed) {
            const sorted = Array.from(sourceSelect.options).sort((a,b) => a.value === 'ALL' ? -1 : a.innerText.localeCompare(b.innerText));
            sourceSelect.innerHTML = '';
            sorted.forEach(o => sourceSelect.appendChild(o));
        }
    },
    highlight(msg) {
        if (!this.searchQuery) return msg;
        const regex = new RegExp(`(${this.searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        return msg.replace(regex, '<mark>$1</mark>');
    },
    unmount() {
        if (this._vfsWatcher) this.api.system.unsubscribe('vfs:changed', this._vfsWatcher);
        window.removeEventListener('i18n:changed', this._i18nListener);
    }
});
