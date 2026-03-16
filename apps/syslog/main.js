WebOS.registerApp({
    id: "syslog",
    get name() { return window.I18n.t('syslog.title'); },
    icon: "📜",
    version: "4.1.16",
    manifest: {
        get name() { return window.I18n.t('syslog.title'); },
        icon: "📜",
        permissions: ["fs.read", "fs.write", "notifications"]
    },
    width: "700px",
    height: "500px",
    async mount(container, api) {
        this.container = container;
        this.api = api;
        this.filter = 'ALL';
        this.searchQuery = '';
        const renderFrame = () => {
            container.innerHTML = `
                <div class="syslog-app">
                    <div class="syslog-toolbar">
                        <div class="toolbar-left">
                            <button class="sys-btn filter-btn active" data-filter="ALL">${window.I18n.t('syslog.filter_all')}</button>
                            <button class="sys-btn filter-btn" data-filter="INFO">${window.I18n.t('syslog.filter_info')}</button>
                            <button class="sys-btn filter-btn" data-filter="WARN">${window.I18n.t('syslog.filter_warn')}</button>
                            <button class="sys-btn filter-btn" data-filter="ERR">${window.I18n.t('syslog.filter_err')}</button>
                            <select class="sys-btn source-select">
                                <option value="ALL">${window.I18n.t('syslog.source_all')}</option>
                            </select>
                        </div>
                        <div class="toolbar-right">
                            <input type="text" class="syslog-search" placeholder="${window.I18n.t('syslog.search')}">
                            <button class="sys-btn refresh-btn">🔄</button>
                            <button class="sys-btn clear-btn danger">🗑️</button>
                        </div>
                    </div>
                    <div class="syslog-viewer"></div>
                    <div class="syslog-status">
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
                this.refresh();
            };
        });
        const searchInput = container.querySelector('.syslog-search');
        searchInput.oninput = (e) => {
            this.searchQuery = e.target.value.toLowerCase();
            this.refresh();
        };
        container.querySelector('.refresh-btn').onclick = () => this.refresh();
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
            return;
        }
        const lines = logs.split('\n').filter(l => l.trim());
        const sources = new Set(['ALL']);
        lines.forEach(line => {
             const m = line.match(/\[(.*?)\] \[(.*?)\] \[([A-Z]+)\] \[(.*?)\]/);
             if (m) sources.add(m[4]);
        });
        const sourceSelect = this.container.querySelector('.source-select');
        if (sourceSelect && sourceSelect.options.length <= 1) {
            const currentSource = sourceSelect.value;
            sourceSelect.innerHTML = '';
            Array.from(sources).sort().forEach(s => {
                const opt = document.createElement('option');
                opt.value = opt.innerText = s === 'ALL' ? window.I18n.t('syslog.source_all') : s;
                if (s === 'ALL') opt.value = 'ALL';
                sourceSelect.appendChild(opt);
            });
            sourceSelect.value = currentSource;
            sourceSelect.onchange = () => this.refresh();
        }

        const fragment = document.createDocumentFragment();
        let visibleCount = 0;
        const renderLines = lines.slice(-1000);
        renderLines.forEach(line => {
            const match = line.match(/^\[(.*?)\] \[(.*?)\] \[([A-Z]+)\] \[(.*?)\] (.*)$/);
            if (!match) return;
            const [_, time, session, level, source, message] = match;
            if (this.filter !== 'ALL' && level !== this.filter) return;
            if (sourceSelect && sourceSelect.value !== 'ALL' && source !== sourceSelect.value) return;
            if (this.searchQuery && !line.toLowerCase().includes(this.searchQuery)) return;
            visibleCount++;
            const entry = document.createElement('div');
            entry.className = `log-entry level-${level.toLowerCase()}`;
            entry.innerHTML = `
                <span class="log-time">[${time.includes('T') ? time.split('T')[1].split('.')[0] : time}]</span>
                <span class="log-session">[${session.slice(0, 8)}]</span>
                <span class="log-level">[${level}]</span>
                <span class="log-source">[${source}]</span>
                <span class="log-msg">${this.highlight(message)}</span>
            `;
            entry.onclick = () => {
                this.api.system.setClipboard(line);
                this.api.notifications.show({ title: window.I18n.t('syslog.title'), message: window.I18n.t('syslog.copied_to_clipboard') });
            };
            fragment.appendChild(entry);
        });
        this.viewer.innerHTML = '';
        this.viewer.appendChild(fragment);
        this.viewer.scrollTop = this.viewer.scrollHeight;
        const status = this.container.querySelector('.log-count');
        if (status) status.innerText = `${visibleCount} / ${lines.length} ${window.I18n.t('syslog.lines')}`;
    },
    highlight(msg) {
        if (!this.searchQuery) return msg;
        const regex = new RegExp(`(${this.searchQuery})`, 'gi');
        return msg.replace(regex, '<mark>$1</mark>');
    },
    unmount() {
        if (this._vfsWatcher) this.api.system.unsubscribe('vfs:changed', this._vfsWatcher);
        window.removeEventListener('i18n:changed', this._i18nListener);
    }
});
