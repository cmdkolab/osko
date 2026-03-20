WebOS.registerApp({
    id: "syslog",
    get name() { return window.I18n.t('syslog.title'); },
    icon: "📜",
    version: "4.5.2",
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
                api.notifications.show({ title: 'SysLog', message: `Logs saved to ${path}` });
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
    async refresh() {
        if (!this.viewer) return;
        const logs = await this.api.fs.read('/var/log/syslog');
        if (!logs) {
            this.viewer.innerHTML = `<div class="log-empty">${window.I18n.t('syslog.no_logs')}</div>`;
            this._lastLineCount = 0;
            return;
        }
        const lines = logs.split('\n').filter(l => l.trim());
        const totalLines = lines.length;
        if (this._lastLineCount === totalLines && !this._forceRefresh) return;
        const isSearch = !!this.searchQuery || this.filter !== 'ALL';
        const sourceSelect = this.container.querySelector('.source-select');
        const sourceFilter = sourceSelect ? sourceSelect.value : 'ALL';
        if (isSearch || sourceFilter !== 'ALL' || this._forceRefresh) {
            this.viewer.innerHTML = '';
            this._lastLineCount = 0;
            this._forceRefresh = false;
        }
        const startIndex = this._lastLineCount || 0;
        const fragment = document.createDocumentFragment();
        const renderLines = lines.slice(Math.max(startIndex, totalLines - 2000));
        renderLines.forEach(line => {
            const match = line.match(/^\[(.*?)\] \[(.*?)\] \[([A-Z]+)\] \[(.*?)\] (.*)$/);
            if (!match) return;
            const [_, time, session, level, source, message] = match;
            if (this.filter !== 'ALL' && level !== this.filter) return;
            if (sourceFilter !== 'ALL' && source !== sourceFilter) return;
            if (this.searchQuery && !line.toLowerCase().includes(this.searchQuery)) return;
            const entry = document.createElement('div');
            entry.className = `log-entry level-${level.toLowerCase()} reveal`;
            entry.innerHTML = `
                <span class="log-time">${time.includes('T') ? time.split('T')[1].split('.')[0] : time}</span>
                <span class="log-session">${session.slice(0, 8)}</span>
                <span class="log-level">${level}</span>
                <span class="log-source">${source}</span>
                <span class="log-msg">${this.highlight(message)}</span>
            `;
            entry.onclick = () => {
                this.api.system.setClipboard(line);
                this.api.notifications.show({ title: 'SysLog', message: window.I18n.t('syslog.copied_to_clipboard') });
            };
            fragment.appendChild(entry);
        });
        this.viewer.appendChild(fragment);
        this._lastLineCount = totalLines;
        if (this.autoScroll) this.viewer.scrollTop = this.viewer.scrollHeight;
        const status = this.container.querySelector('.log-count');
        if (status) status.innerText = `${totalLines} ${window.I18n.t('syslog.lines')}`;
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
