WebOS.registerApp({
    id: "explorer",
    get name() { return window.I18n.t('explorer.title'); },
    icon: "📂",
    version: "4.8.0",
    manifest: {
        get name() { return window.I18n.t('explorer.title'); },
        icon: "📂",
        permissions: ["fs.read", "fs.write", "notifications"]
    },
    width: "600px",
    height: "450px",
    async mount(container, api, params) {
        this.container = container;
        this.api = api;
        this.currentPath = params.path || '/home/user';
        this.searchQuery = '';
        this.selectedItem = null;
        this.selectedFiles = new Set();
        this.clipboard = null;
        this.viewMode = await api.system.storage.get('explorer:view') || 'grid';
        this.sortBy = await api.system.storage.get('explorer:sort') || 'name';
        const render = async () => {
            if (!container.querySelector('.explorer-toolbar')) {
                container.innerHTML = `
                    <div class="explorer-app">
                        <div class="explorer-toolbar">
                            <button class="sys-btn home-btn" title="${window.I18n.t('explorer.home') || '🏠'}">🏠</button>
                            <button class="sys-btn back-btn" title="${window.I18n.t('explorer.back')}">⬅</button>
                            <div class="explorer-breadcrumbs"></div>
                            <button class="sys-btn sort-btn" title="${window.I18n.t('explorer.sort')}">↕️</button>
                            <button class="sys-btn view-btn" title="${window.I18n.t('explorer.view')}">${this.viewMode === 'grid' ? '☰' : '▦'}</button>
                            <input type="text" class="explorer-search" placeholder="${window.I18n.t('system.search_placeholder')}">
                        </div>
                        <div class="explorer-main">
                            <div class="explorer-grid" tabindex="0"></div>
                        </div>
                        <div class="explorer-statusbar">
                            <span class="status-info"></span>
                        </div>
                    </div>
                `;
                this.setupToolbar(container);
            }
            await this.refresh(container);
        };
        this.render = render;
        await render();
        this._i18nListener = () => render();
        window.addEventListener('i18n:changed', this._i18nListener);
    },
    setupToolbar(container) {
        container.querySelector('.home-btn').onclick = () => {
            this.currentPath = '/home/user';
            this.render(container);
        };
        container.querySelector('.back-btn').onclick = () => {
            if (this.currentPath === '/') return;
            this.currentPath = this.api.fs.dirname(this.currentPath);
            this.render(container);
        };
        container.querySelector('.sort-btn').onclick = (e) => {
            this.api.system.showContextMenu(e, [
                { label: `${window.I18n.t('explorer.sort_name')} ${this.sortBy === 'name' ? '✓' : ''}`, action: async () => { this.sortBy = 'name'; await this.api.system.storage.set('explorer:sort', this.sortBy); this.render(container); } },
                { label: `${window.I18n.t('explorer.sort_size')} ${this.sortBy === 'size' ? '✓' : ''}`, action: async () => { this.sortBy = 'size'; await this.api.system.storage.set('explorer:sort', this.sortBy); this.render(container); } },
                { label: `${window.I18n.t('explorer.sort_date')} ${this.sortBy === 'date' ? '✓' : ''}`, action: async () => { this.sortBy = 'date'; await this.api.system.storage.set('explorer:sort', this.sortBy); this.render(container); } }
            ]);
        };
        container.querySelector('.view-btn').onclick = async () => {
            this.viewMode = this.viewMode === 'grid' ? 'list' : 'grid';
            await this.api.system.storage.set('explorer:view', this.viewMode);
            this.render(container);
        };
        const search = container.querySelector('.explorer-search');
        search.oninput = (e) => {
            if (this._searchTimer) clearTimeout(this._searchTimer);
            this._searchTimer = setTimeout(() => {
                this.searchQuery = e.target.value.toLowerCase();
                this.refresh(container);
            }, 300);
        };
        this._vfsWatcher = (e) => {
            if (this.api.fs.dirname(e?.data?.path) === this.currentPath || e?.data?.path === this.currentPath) {
                this.refresh(container);
            }
        };
        this.api.system.subscribe('vfs:changed', this._vfsWatcher);
    },
    async refresh(container) {
        const grid = container.querySelector('.explorer-grid');
        const breadcrumbs = container.querySelector('.explorer-breadcrumbs');
        const status = container.querySelector('.status-info');
        if (!grid) return;
        this.updateBreadcrumbs(breadcrumbs);
        let items = await this.api.fs.list(this.currentPath) || [];
        if (this.searchQuery) {
            items = items.filter(i => i.name.toLowerCase().includes(this.searchQuery));
        }
        items.sort((a, b) => {
            if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
            const sort = this.sortBy;
            if (sort === 'size') return (b.size || 0) - (a.size || 0);
            if (sort === 'date') return (b.mtime || 0) - (a.mtime || 0);
            return a.name.localeCompare(b.name, undefined, { numeric: true });
        });
        grid.classList.toggle('view-list', this.viewMode === 'list');
        grid.innerHTML = items.length ? '' : `<div class="explorer-empty">${window.I18n.t('explorer.empty')}</div>`;
        if (this.viewMode === 'list' && items.length) {
            const header = document.createElement('div');
            header.className = 'explorer-list-header';
            header.innerHTML = `
                <div class="header-name">${window.I18n.t('explorer.prop_name')}</div>
                <div class="header-type">${window.I18n.t('explorer.prop_type')}</div>
                <div class="header-size">${window.I18n.t('explorer.prop_size')}</div>
            `;
            grid.appendChild(header);
        }
        grid.oncontextmenu = (e) => {
            if (e.target !== grid && !e.target.classList.contains('explorer-empty')) return;
            e.preventDefault();
            const clip = this.api.system.getClipboard();
            const menuItems = [
                { label: window.I18n.t('explorer.new_folder'), action: () => this.createFolder(container) },
                { label: window.I18n.t('explorer.new_file'), action: () => this.createFile(container) },
                { type: 'separator' }
            ];
            if (clip && clip.type === 'file') {
                menuItems.push({ label: window.I18n.t('explorer.paste'), action: () => this.pasteFile() });
                menuItems.push({ type: 'separator' });
            }
            menuItems.push({ label: window.I18n.t('menu.refresh'), action: () => this.refresh(container) });
            this.api.system.showContextMenu(e, menuItems);
        };
        const frag = document.createDocumentFragment();
        items.forEach(item => {
            const el = document.createElement('div');
            el.className = `explorer-item reveal ${this.viewMode === 'list' ? 'item-list' : ''}`;
            el.tabIndex = 0;
            const icon = item.type === 'dir' ? '📁' : this.getIcon(item.name);
            if (this.viewMode === 'list') {
                const size = item.type === 'dir' ? '---' : this.formatSize(item.size);
                const type = item.type === 'dir' ? (window.I18n.t('system.type_dir') || 'Folder') : (window.I18n.t('system.type_file') || 'File');
                el.innerHTML = `
                    <div class="item-icon">${icon}</div>
                    <div class="item-name">${item.name}</div>
                    <div class="item-type">${type}</div>
                    <div class="item-size">${size}</div>
                `;
            } else {
                el.innerHTML = `<div class="item-icon">${icon}</div><div class="item-name">${item.name}</div>`;
            }
            el.onclick = () => {
                if (item.type === 'dir') {
                    this.currentPath = this.api.fs.join(this.currentPath, item.name);
                    this.render(container);
                } else {
                    this.openFile(item);
                }
            };
            el.oncontextmenu = (e) => {
                e.preventDefault();
                e.stopPropagation();
                const menuItems = [
                    { label: window.I18n.t('explorer.open'), action: () => el.onclick() },
                    { label: window.I18n.t('explorer.copy'), action: () => this.copyFile(item) },
                    { label: window.I18n.t('explorer.rename'), action: () => this.renameFile(item, container) },
                    { label: window.I18n.t('explorer.delete'), action: () => this.deleteFile(item, container) },
                    { type: 'separator' },
                    { label: window.I18n.t('explorer.properties') || 'Properties', action: () => this.showProperties(item) }
                ];
                this.api.system.showContextMenu(e, menuItems);
            };
            frag.appendChild(el);
        });
        grid.appendChild(frag);
        status.innerText = `${items.length} ${window.I18n.t('explorer.items')}`;
    },
    formatSize(bytes) {
        if (!bytes) return '0 B';
        if (bytes > 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
        if (bytes > 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return bytes + ' B';
    },
    updateBreadcrumbs(el) {
        el.innerHTML = '';
        const parts = this.api.fs.split(this.currentPath);
        let acc = '/';
        const createCrumb = (label, path, active) => {
            const span = document.createElement('span');
            span.className = `breadcrumb-item ${active ? 'active' : ''}`;
            span.innerText = label;
            if (!active) span.onclick = () => { this.currentPath = path; this.render(this.container); };
            el.appendChild(span);
        };
        createCrumb(window.I18n.t('about.title'), '/', this.currentPath === '/');
        parts.forEach((p, i) => {
            if (!p) return;
            const sep = document.createElement('span');
            sep.className = 'breadcrumb-sep';
            sep.innerText = window.I18n.t('explorer.breadcrumb_sep');
            el.appendChild(sep);
            acc = this.api.fs.join(acc, p);
            createCrumb(p, acc, i === parts.length - 1);
        });
    },
    copyFile(item) {
        const fullPath = this.api.fs.join(this.currentPath, item.name);
        this.api.system.setClipboard({ type: 'file', path: fullPath, name: item.name });
        this.api.notifications.show({ title: window.I18n.t('explorer.title'), message: window.I18n.t('explorer.copied', item.name) });
    },
    async pasteFile() {
        const clip = this.api.system.getClipboard();
        if (!clip || clip.type !== 'file') return;
        let destName = clip.name;
        let destPath = this.api.fs.join(this.currentPath, destName);
        if (await this.api.fs.exists(destPath)) {
            const conflictChoice = await new Promise(resolve => {
                this.api.ui.showDialog({
                    title: window.I18n.t('explorer.title'),
                    message: window.I18n.t('explorer.conflict_msg', destName),
                    type: 'choice',
                    choices: [
                        { label: window.I18n.t('explorer.conflict_overwrite'), value: 'overwrite', class: 'danger' },
                        { label: window.I18n.t('explorer.conflict_keep_both'), value: 'keep' },
                        { label: window.I18n.t('dialog.cancel'), value: 'cancel' }
                    ],
                    onChoice: resolve
                });
            });
            if (conflictChoice === 'cancel') return;
            if (conflictChoice === 'keep') {
                const parts = destName.split('.');
                const ext = parts.length > 1 ? parts.pop() : '';
                const base = parts.join('.');
                destName = `${base} - ${Date.now()}${ext ? '.' + ext : ''}`;
                destPath = this.api.fs.join(this.currentPath, destName);
            }
        }
        await this.api.fs.copy(clip.path, destPath);
        this.api.system.setClipboard(null);
        this.refresh(this.container);
    },
    async createFolder(container) {
        this.api.ui.prompt(window.I18n.t('explorer.prompt_folder_name'), window.I18n.t('explorer.new_folder'), async (name) => {
            if (name) {
                let path = this.api.fs.join(this.currentPath, name);
                if (await this.api.fs.exists(path)) {
                    path = this.api.fs.join(this.currentPath, name + ' (2)');
                }
                await this.api.fs.mkdir(path);
                this.refresh(container);
            }
        });
    },
    async createFile(container) {
        const defaultName = window.I18n.t('explorer.new_file') + '.txt';
        let path = this.api.fs.join(this.currentPath, defaultName);
        if (await this.api.fs.exists(path)) {
            path = this.api.fs.join(this.currentPath, window.I18n.t('explorer.new_file') + ' (2).txt');
        }
        await this.api.fs.write(path, '');
        this.refresh(container);
    },
    getIcon(name) {
        const ext = name.split('.').pop().toLowerCase();
        const map = { js: '📜', css: '🎨', html: '🌐', json: '⚙️', png: '🖼️', jpg: '🖼️', txt: '📄', md: '📝', mp3: '🎵' };
        return map[ext] || '📄';
    },
    async openFile(item) {
        const fullPath = this.api.fs.join(this.currentPath, item.name);
        const ext = item.name.split('.').pop().toLowerCase();
        const app = await this.api.system.getAssociation(ext);
        if (app) WebOS.launchApp(app, { filePath: fullPath });
    },
    async deleteFile(item, container) {
        this.api.ui.confirm(window.I18n.t('explorer.confirm_delete', item.name), async (ok) => {
            if (ok) {
                await this.api.fs.remove(this.api.fs.join(this.currentPath, item.name));
                this.refresh(container);
            }
        });
    },
    async showProperties(item) {
        if (!item) return;
        const path = this.api.fs.join(this.currentPath, item.name);
        const stat = await this.api.fs.stat(path);
        if (!stat) {
            this.api.notifications.show({ 
                title: window.I18n.t('explorer.title'), 
                message: window.I18n.t('explorer.error_read_properties') || 'Could not read properties',
                type: 'error' 
            });
            return;
        }
        const size = (item.type === 'dir' || stat.type === 'dir') ? '---' : (stat.size > 1024 * 1024 ? (stat.size / (1024 * 1024)).toFixed(2) + ' MB' : (stat.size / 1024).toFixed(1) + ' KB');
        const date = stat.mtime ? new Date(stat.mtime).toLocaleString() : '---';
        const typeLabel = stat.type === 'dir' ? (window.I18n.t('system.type_dir') || 'Folder') : (window.I18n.t('system.type_file') || 'File');
        const content = `
            <div class="properties-dialog">
                <div class="prop-row"><b>${window.I18n.t('explorer.prop_name') || 'Name'}:</b> <span>${item.name || '---'}</span></div>
                <div class="prop-row"><b>${window.I18n.t('explorer.prop_path') || 'Path'}:</b> <span>${path || '---'}</span></div>
                <div class="prop-row"><b>${window.I18n.t('explorer.prop_type') || 'Type'}:</b> <span>${typeLabel}</span></div>
                <div class="prop-row"><b>${window.I18n.t('explorer.prop_size') || 'Size'}:</b> <span>${size || '---'}</span></div>
                <div class="prop-row"><b>${window.I18n.t('explorer.prop_mtime') || 'Modified'}:</b> <span>${date}</span></div>
            </div>
        `;
        this.api.ui.showDialog({ 
            title: item.name || window.I18n.t('explorer.properties'), 
            message: content 
        });
    },
    renameFile(item, container) {
        this.api.ui.prompt(window.I18n.t('explorer.prompt_rename', item.name), item.name, async (name) => {
            if (name && name !== item.name) {
                await this.api.fs.rename(this.api.fs.join(this.currentPath, item.name), this.api.fs.join(this.currentPath, name));
                this.refresh(container);
            }
        });
    },
    unmount() {
        if (this._vfsWatcher) this.api.system.unsubscribe('vfs:changed', this._vfsWatcher);
        window.removeEventListener('i18n:changed', this._i18nListener);
    }
});
