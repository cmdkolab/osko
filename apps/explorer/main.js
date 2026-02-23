WebOS.registerApp({
    id: "explorer",
    name: "Explorer",
    icon: "📂",
    manifest: {
        name: "Explorer",
        icon: "📂",
        permissions: ["fs.read", "fs.write", "notifications"]
    },
    version: "1.3.0",
    width: "500px",
    height: "400px",
    mount(container, api) {
        this.api = api;
        this.currentPath = '/home/user';
        this.searchQuery = '';
        this.watcherUnsub = null;
        this._pendingFocus = null;
        this._renderId = 0;
        this._subscribeWatcher(container);
        this.render(container);
    },
    _subscribeWatcher(container) {
        if (this.watcherUnsub) this.watcherUnsub();
        this.watcherUnsub = this.api.fs.watch(this.currentPath, (changedPath) => {
            if (this.currentPath === changedPath || this.api.fs.dirname(changedPath) === this.currentPath) {
                this.render(container);
            }
        });
    },
    unmount() {
        if (this.watcherUnsub) this.watcherUnsub();
        this.api = null;
    },
    async render(container) {
        const rid = ++this._renderId;
        if (!container.querySelector('.explorer-toolbar')) {
            container.innerHTML = `
                <div class="explorer-toolbar">
                    <button class="explorer-back" title="Wstecz">⬅</button>
                    <div class="explorer-breadcrumbs"></div>
                    <input type="text" class="explorer-search" placeholder="Szukaj...">
                </div>
                <div class="explorer-grid"></div>
            `;
            const backBtn = container.querySelector('.explorer-back');
            backBtn.onclick = () => {
                if (this.currentPath === '/') return;
                const parent = this.api.fs.dirname(this.currentPath);
                this.currentPath = parent;
                this._subscribeWatcher(container);
                this.render(container);
            };
            const searchInput = container.querySelector('.explorer-search');
            searchInput.value = this.searchQuery;
            searchInput.oninput = (e) => {
                this.searchQuery = e.target.value.toLowerCase();
                this.render(container);
            };
        }
        const grid = container.querySelector('.explorer-grid');
        const breadcrumbs = container.querySelector('.explorer-breadcrumbs');
        let items = (await this.api.fs.list(this.currentPath)) || [];
        if (rid !== this._renderId) return;

        if (this.searchQuery) {
            items = items.filter(item => item.name.toLowerCase().includes(this.searchQuery));
        }

        items.sort((a, b) => {
            if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
            return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
        });

        grid.innerHTML = items.length === 0 ? '<div class="explorer-empty">Ten folder jest pusty</div>' : '';
        const fragment = document.createDocumentFragment();

        items.forEach((item, index) => {
            const el = document.createElement('div');
            el.className = 'explorer-item';
            el.tabIndex = 0;
            el.dataset.index = index;
            el.innerHTML = `
                <div class="item-icon"></div>
                <div class="item-name"></div>
            `;
            el.querySelector('.item-name').textContent = item.name;

            const getIcon = (item) => {
                if (item.type === 'dir') return '📁';
                const ext = item.name.split('.').pop()?.toLowerCase();
                const icons = {
                    'js': '📜',
                    'css': '🎨',
                    'html': '🌐',
                    'json': '⚙️',
                    'png': '🖼️',
                    'jpg': '🖼️',
                    'jpeg': '🖼️',
                    'svg': '📐',
                    'txt': '📄',
                    'md': '📝'
                };
                return icons[ext] || '📄';
            };
            el.querySelector('.item-icon').textContent = getIcon(item);

            el.onclick = () => {
                const nextPath = this.api.fs.join(this.currentPath, item.name);
                if (item.type === 'dir') {
                    this.currentPath = nextPath;
                    this._subscribeWatcher(container);
                    this.render(container);
                } else {
                    const ext = item.name.split('.').pop()?.toLowerCase();
                    const app = this.api.system.getAssociation(ext);
                    if (app) WebOS.launchApp(app, { filePath: nextPath });
                    else this.api.notifications.show({ title: 'Explorer', message: `Nieznany typ pliku: ${item.name} ` });
                }
            };
            el.oncontextmenu = async (e) => {
                e.preventDefault();
                e.stopPropagation();
                const fullPath = this.api.fs.join(this.currentPath, item.name);
                const menuItems = [
                    { label: 'Otwórz', action: () => el.onclick() },
                    {
                        label: 'Zmień nazwę',
                        action: () => {
                            this.api.ui.prompt('Nowa nazwa:', item.name, async (newName) => {
                                if (!newName || newName === item.name) return;
                                const newPath = this.api.fs.join(this.currentPath, newName);
                                if (await this.api.fs.exists(newPath)) {
                                    this.api.ui.fileConflict(newName, async (choice) => {
                                        if (choice === 'replace') {
                                            await this.api.fs.remove(newPath);
                                            await this.api.fs.rename(fullPath, newPath);
                                            this.render(container);
                                        } else if (choice === 'copy') {
                                            let finalName = newName;
                                            const ext = newName.includes('.') ? `.${newName.split('.').pop()} ` : '';
                                            const base = newName.replace(ext, '');
                                            let counter = 1;
                                            while (await this.api.fs.exists(this.api.fs.join(this.currentPath, `${base} (kopia${counter > 1 ? ' ' + counter : ''})${ext} `))) {
                                                counter++;
                                            }
                                            finalName = `${base} (kopia${counter > 1 ? ' ' + counter : ''})${ext} `;
                                            await this.api.fs.rename(fullPath, this.api.fs.join(this.currentPath, finalName));
                                            this.render(container);
                                        }
                                    });
                                } else {
                                    await this.api.fs.rename(fullPath, newPath);
                                    this.render(container);
                                }
                            });
                        }
                    }
                ];
                if (item.type === 'file') {
                    const ext = item.name.split('.').pop()?.toLowerCase();
                    if (['txt', 'jpg', 'jpeg', 'png', 'svg'].includes(ext)) {
                        menuItems.push({
                            label: 'Ustaw jako tapetę',
                            action: async () => {
                                const content = await this.api.fs.read(fullPath);
                                if (content && typeof content === 'string' && (content.startsWith('#') || content.startsWith('linear-gradient') || content.startsWith('url') || content.startsWith('http') || (content.length > 50 && content.length < 2000))) {
                                    await this.api.system.setWallpaper(content);
                                    this.api.notifications.show({ title: 'System', message: 'Tapeta została zaktualizowana.' });
                                } else {
                                    this.api.notifications.show({ title: 'System', message: 'Ten plik nie może być tapetą.' });
                                }
                            }
                        });
                    }
                }
                menuItems.push({
                    label: 'Usuń',
                    action: () => {
                        this.api.ui.confirm(`Czy na pewno usunąć ${item.name}?`, async (confirmed) => {
                            if (confirmed) {
                                await this.api.fs.remove(fullPath);
                                this.render(container);
                            }
                        });
                    }
                });
                this.api.system.showContextMenu(e, menuItems);
            };
            fragment.appendChild(el);
            if (this._pendingFocus === item.name) {
                this.api.system.setTimeout(() => el.focus(), 50);
                this._pendingFocus = null;
            }
        });
        grid.appendChild(fragment);

        breadcrumbs.innerHTML = '';
        const parts = this.api.fs.split(this.currentPath);
        let pathAcc = '/';
        const rootCrumb = document.createElement('span');
        rootCrumb.className = 'breadcrumb-item';
        rootCrumb.innerText = 'OS(KO)';
        rootCrumb.onclick = () => { this.currentPath = '/'; this._subscribeWatcher(container); this.render(container); };
        breadcrumbs.appendChild(rootCrumb);
        parts.forEach((part, i) => {
            const sep = document.createElement('span');
            sep.className = 'breadcrumb-sep';
            sep.innerText = '❯';
            breadcrumbs.appendChild(sep);
            pathAcc = this.api.fs.join(pathAcc, part);
            const crumb = document.createElement('span');
            crumb.className = 'breadcrumb-item' + (i === parts.length - 1 ? ' active' : '');
            crumb.textContent = part;
            const targetPath = pathAcc;
            crumb.onclick = () => { this.currentPath = targetPath; this._subscribeWatcher(container); this.render(container); };
            breadcrumbs.appendChild(crumb);
        });

        grid.oncontextmenu = (e) => {
            if (e.target.closest('.explorer-item')) return;
            e.preventDefault();
            e.stopPropagation();
            this.api.system.showContextMenu(e, [
                {
                    label: 'Nowy plik (.txt)',
                    action: () => {
                        this.api.ui.prompt('Nazwa pliku:', 'nowy_plik', async (name) => {
                            if (!name) return;
                            const filename = name.endsWith('.txt') ? name : name + '.txt';
                            const path = this.api.fs.join(this.currentPath, filename);
                            if (await this.api.fs.exists(path)) {
                                this.api.ui.fileConflict(filename, async (choice) => {
                                    if (choice === 'replace') {
                                        await this.api.fs.write(path, '');
                                        this.render(container);
                                    } else if (choice === 'copy') {
                                        const base = filename.replace('.txt', '');
                                        let newName = `${base} (kopia).txt`;
                                        let counter = 1;
                                        while (await this.api.fs.exists(this.api.fs.join(this.currentPath, newName))) {
                                            newName = `${base} (kopia ${++counter}).txt`;
                                        }
                                        await this.api.fs.write(this.api.fs.join(this.currentPath, newName), '');
                                        this._pendingFocus = newName;
                                        this.render(container);
                                    }
                                });
                            } else {
                                await this.api.fs.write(path, '');
                                this._pendingFocus = filename;
                                this.render(container);
                            }
                        });
                    }
                },
                {
                    label: 'Nowy folder',
                    action: () => {
                        this.api.ui.prompt('Nazwa folderu:', 'nowy_folder', async (name) => {
                            if (!name) return;
                            const path = this.api.fs.join(this.currentPath, name);
                            if (await this.api.fs.exists(path)) {
                                this.api.ui.fileConflict(name, async (choice) => {
                                    if (choice === 'replace') {
                                        await this.api.fs.mkdir(path);
                                        this.render(container);
                                    } else if (choice === 'copy') {
                                        let newName = `${name} (kopia)`;
                                        let counter = 1;
                                        while (await this.api.fs.exists(this.api.fs.join(this.currentPath, newName))) {
                                            newName = `${name} (kopia ${++counter})`;
                                        }
                                        await this.api.fs.mkdir(this.api.fs.join(this.currentPath, newName));
                                        this._pendingFocus = newName;
                                        this.render(container);
                                    }
                                });
                            } else {
                                await this.api.fs.mkdir(path);
                                this._pendingFocus = name;
                                this.render(container);
                            }
                        });
                    }
                }
            ]);
        };
        container.onkeydown = (e) => {
            const active = document.activeElement;
            if (!active || !active.classList.contains('explorer-item')) return;
            const index = parseInt(active.dataset.index);
            if (e.key === 'ArrowRight') items[index + 1] && grid.children[index + 1].focus();
            if (e.key === 'ArrowLeft') items[index - 1] && grid.children[index - 1].focus();
            if (e.key === 'Delete') {
                const item = items[index];
                const fullPath = this.api.fs.join(this.currentPath, item.name);
                this.api.ui.confirm(`Czy na pewno usunąć ${item.name}?`, async (confirmed) => {
                    if (confirmed) {
                        await this.api.fs.remove(fullPath);
                        this.render(container);
                    }
                });
            }
            if (e.key === 'Enter') active.click();
        };
    }
});
