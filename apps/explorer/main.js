WebOS.registerApp({
    id: "explorer",
    get name() { return window.I18n.t('explorer.title'); },
    icon: "📂",
    version: "4.1.17",
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
        this.sortBy = await api.system.storage.get('explorer:sort') || 'name';
        this.sortOrder = 1;
        const render = async () => {
            if (!container.querySelector('.explorer-toolbar')) {
                container.innerHTML = `
                    <div class="explorer-app">
                        <div class="explorer-toolbar">
                            <button class="sys-btn home-btn" title="${window.I18n.t('explorer.home') || '🏠'}">🏠</button>
                            <button class="sys-btn back-btn" title="${window.I18n.t('explorer.back')}">⬅</button>
                            <div class="explorer-breadcrumbs"></div>
                            <button class="sys-btn sort-btn" title="${window.I18n.t('explorer.sort')}">↕️</button>
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
        const search = container.querySelector('.explorer-search');
        search.oninput = (e) => {
            this.searchQuery = e.target.value.toLowerCase();
            this.refresh(container);
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
        grid.innerHTML = items.length ? '' : `<div class="explorer-empty">${window.I18n.t('explorer.empty')}</div>`;
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
            el.className = 'explorer-item';
            el.tabIndex = 0;
            const icon = item.type === 'dir' ? '📁' : this.getIcon(item.name);
            el.innerHTML = `<div class="item-icon">${icon}</div><div class="item-name">${item.name}</div>`;
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
                    { label: window.I18n.t('explorer.delete'), action: () => this.deleteFile(item, container) }
                ];
                this.api.system.showContextMenu(e, menuItems);
            };
            frag.appendChild(el);
        });
        grid.appendChild(frag);
        status.innerText = `${items.length} ${window.I18n.t('explorer.items')}`;
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
        createCrumb('OS(KO)', '/', this.currentPath === '/');
        parts.forEach((p, i) => {
            if (!p) return;
            const sep = document.createElement('span');
            sep.className = 'breadcrumb-sep';
            sep.innerText = '❯';
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
                WebOS.ui.showChoiceDialog({
                    title: window.I18n.t('explorer.title'),
                    message: window.I18n.t('explorer.conflict_msg', destName),
                    choices: [
                        { label: window.I18n.t('explorer.conflict_overwrite'), value: 'overwrite', type: 'danger' },
                        { label: window.I18n.t('explorer.conflict_keep_both'), value: 'keep', type: 'primary' },
                        { label: window.I18n.t('dialog.cancel'), value: 'cancel' }
                    ],
                    callback: resolve
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
