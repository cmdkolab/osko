WebOS.registerApp({
    id: "explorer",
    name: "Explorer",
    icon: "📂",
    manifest: {
        name: "Explorer",
        icon: "📂",
        permissions: ["fs.read", "fs.write", "notifications"]
    },
    version: "2.3.0",
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
        this._loadSettings().then(() => this.render(container));
    },
    async _loadSettings() {
        try {
            const data = await this.api.fs.read('/home/user/settings/explorer.json');
            if (data) this.settings = JSON.parse(data);
        } catch (e) { }
        this.settings = this.settings || { sortBy: 'name' };
    },
    async _saveSettings() {
        try {
            await this.api.fs.write('/home/user/settings/explorer.json', JSON.stringify(this.settings));
        } catch (e) { }
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
                    <button class="explorer-sort" title="Sortuj">↕️</button>
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
            const sortBtn = container.querySelector('.explorer-sort');
            sortBtn.onclick = (e) => {
                this.api.system.showContextMenu(e, [
                    { label: 'Nazwa', action: () => { this.settings.sortBy = 'name'; this._saveSettings(); this.render(container); } },
                    { label: 'Rozmiar', action: () => { this.settings.sortBy = 'size'; this._saveSettings(); this.render(container); } },
                    { label: 'Data', action: () => { this.settings.sortBy = 'date'; this._saveSettings(); this.render(container); } }
                ]);
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
            const sortBy = this.settings.sortBy || 'name';
            if (sortBy === 'name') {
                if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
                return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
            } else if (sortBy === 'size') {
                return (b.size || 0) - (a.size || 0);
            } else if (sortBy === 'date') {
                return (b.mtime || 0) - (a.mtime || 0);
            }
            return 0;
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
                    label: 'Kopiuj',
                    action: () => {
                        this.api.system.setClipboard({
                            type: 'file',
                            path: fullPath,
                            name: item.name,
                            isDirectory: item.type === 'directory'
                        });
                        this.api.notifications.show({ title: 'Explorer', message: `Skopiowano: ${item.name}` });
                    }
                });
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

        grid.tabIndex = 0;
        grid.onkeydown = (e) => {
            const active = document.activeElement;
            const itemsNodeList = grid.querySelectorAll('.explorer-item');
            if (itemsNodeList.length === 0) return;
            const itemsArr = Array.from(itemsNodeList);
            let idx = itemsArr.indexOf(active);

            // Columns count estimation (approximate based on grid layout width ~500px / ~80px item)
            // A more robust way would be calculating offsetTop, but this is a simple fallback.
            // Let's use getBoundingClientRect for accurate row calculation
            const getCols = () => {
                if (itemsArr.length < 2) return 1;
                const top0 = itemsArr[0].getBoundingClientRect().top;
                for (let i = 1; i < itemsArr.length; i++) {
                    if (itemsArr[i].getBoundingClientRect().top > top0) return i;
                }
                return itemsArr.length;
            };

            if (e.key === 'ArrowRight') {
                e.preventDefault();
                idx = (idx + 1) % itemsArr.length;
                itemsArr[idx].focus();
            } else if (e.key === 'ArrowLeft') {
                e.preventDefault();
                idx = (idx - 1 + itemsArr.length) % itemsArr.length;
                itemsArr[idx].focus();
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                const cols = getCols();
                if (idx === -1) idx = 0;
                else idx = Math.min(idx + cols, itemsArr.length - 1);
                itemsArr[idx].focus();
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                const cols = getCols();
                if (idx === -1) idx = 0;
                else idx = Math.max(idx - cols, 0);
                itemsArr[idx].focus();
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (idx >= 0 && idx < itemsArr.length) {
                    itemsArr[idx].click();
                    // if it was a directory, clicking re-renders, so we blur
                    if (document.activeElement === itemsArr[idx]) {
                        // Try to maintain focus on grid if we didn't navigate away
                    }
                }
            } else if (e.key === 'Backspace') {
                // Navigate up
                e.preventDefault();
                container.querySelector('.explorer-back').click();
            }
        };

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

            const gridMenuItems = [
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
                                        this._pendingFocus = newName; // Added this line based on similar logic above
                                        this.render(container);
                                    }
                                });
                            } else {
                                await this.api.fs.mkdir(path);
                                this._pendingFocus = name; // Added this line based on similar logic above
                                this.render(container);
                            }
                        });
                    }
                }
            ];

            const clip = this.api.system.getClipboard();
            if (clip && clip.type === 'file' && clip.path) {
                gridMenuItems.push({
                    label: `Wklej (${clip.name})`,
                    action: async () => {
                        const src = clip.path;
                        let dstName = clip.name;
                        let dstPath = this.api.fs.join(this.currentPath, dstName);

                        if (await this.api.fs.exists(dstPath)) {
                            let counter = 1;
                            const extMatch = dstName.includes('.') && !clip.isDirectory ? dstName.match(/(\.[^.]+)$/) : null;
                            const ext = extMatch ? extMatch[1] : '';
                            const base = extMatch ? dstName.slice(0, dstName.lastIndexOf(ext)) : dstName;

                            let newName = `${base} (kopia)${ext}`;
                            while (await this.api.fs.exists(this.api.fs.join(this.currentPath, newName))) {
                                newName = `${base} (kopia ${++counter})${ext}`;
                            }
                            dstPath = this.api.fs.join(this.currentPath, newName);
                            dstName = newName;
                        }

                        await this.api.fs.copy(src, dstPath);
                        this._pendingFocus = dstName;
                        this.render(container);
                    }
                });
            }

            this.api.system.showContextMenu(e, gridMenuItems);
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
