WebOS.registerApp({
    id: "notes",
    name: "Notes",
    icon: "📝",
    version: "1.1.0",
    manifest: {
        name: "Notes",
        icon: "📝",
        permissions: ["fs.read", "fs.write", "notifications"]
    },
    width: "500px",
    height: "400px",
    mount(container, api, params) {
        this.api = api;
        this.currentPath = null;
        this.container = container;
        container.innerHTML = `
            <div class="notes-toolbar">
                <button class="notes-btn new-btn">Nowy</button>
                <button class="notes-btn save-btn">Zapisz</button>
                <button class="notes-btn export-btn">Eksportuj</button>
                <span class="notes-status">Niezapisany</span>
            </div>
            <textarea class="notes-editor" placeholder="Zacznij pisać..."></textarea>
        `;
        const textarea = container.querySelector('.notes-editor');
        const status = container.querySelector('.notes-status');
        const newBtn = container.querySelector('.new-btn');
        const saveBtn = container.querySelector('.save-btn');
        const exportBtn = container.querySelector('.export-btn');
        this._autoSaveTimer = null;
        textarea.oninput = () => {
            status.innerText = 'Zapisuję...';
            if (this._autoSaveTimer) this.api.system.clearTimeout(this._autoSaveTimer);
            this._autoSaveTimer = this.api.system.setTimeout(async () => {
                if (this.currentPath) {
                    await this.api.fs.write(this.currentPath, textarea.value);
                    status.innerText = this.api.fs.basename(this.currentPath);
                } else {
                    status.innerText = 'Zmodyfikowano (brak pliku)';
                }
                this._autoSaveTimer = null;
            }, 800);
        };
        textarea.onkeydown = (e) => {
            if (e.key === 'Tab') {
                e.preventDefault();
                const start = textarea.selectionStart;
                const end = textarea.selectionEnd;
                textarea.value = textarea.value.substring(0, start) + "\t" + textarea.value.substring(end);
                textarea.selectionStart = textarea.selectionEnd = start + 1;
            }
        };
        newBtn.onclick = async () => {
            if (await this.hasUnsavedChanges()) {
                this.api.ui.confirm('Masz niezapisane zmiany. Czy na pewno chcesz utworzyć nowy plik?', (confirmed) => {
                    if (confirmed) this.resetEditor();
                });
            } else {
                this.resetEditor();
            }
        };
        saveBtn.onclick = async () => {
            if (!this.currentPath) {
                this.api.ui.prompt('Podaj nazwę pliku:', 'notatka', async (name) => {
                    if (!name) return;
                    const filename = name.endsWith('.txt') ? name : name + '.txt';
                    const fullPath = `/home/user/documents/${filename}`;
                    if (await this.api.fs.exists(fullPath)) {
                        this.api.ui.fileConflict(filename, async (choice) => {
                            if (choice === 'replace') {
                                this.currentPath = fullPath;
                                await this.saveContent();
                            } else if (choice === 'copy') {
                                const base = filename.replace('.txt', '');
                                let newName = `${base} (kopia).txt`;
                                let counter = 1;
                                while (await this.api.fs.exists(`/home/user/documents/${newName}`)) {
                                    newName = `${base} (kopia ${++counter}).txt`;
                                }
                                this.currentPath = `/home/user/documents/${newName}`;
                                await this.saveContent();
                            }
                        });
                    } else {
                        this.currentPath = fullPath;
                        await this.saveContent();
                    }
                });
            } else {
                await this.saveContent();
            }
        };
        exportBtn.onclick = () => {
            const blob = new Blob([textarea.value], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = this.currentPath ? this.api.fs.basename(this.currentPath) : 'notatka.txt';
            a.click();
            URL.revokeObjectURL(url);
        };
        if (params && params.filePath) {
            this.openFile(params.filePath, textarea, status);
        } else {
            textarea.focus();
        }
    },
    resetEditor() {
        const textarea = this.container.querySelector('.notes-editor');
        const status = this.container.querySelector('.notes-status');
        textarea.value = '';
        this.currentPath = null;
        status.innerText = 'Nowy plik';
        this.api.window.setTitle('Notes - Nowy');
    },
    async saveContent() {
        const textarea = this.container.querySelector('.notes-editor');
        const status = this.container.querySelector('.notes-status');
        await this.api.fs.write(this.currentPath, textarea.value);
        status.innerText = this.api.fs.basename(this.currentPath);
        this.api.window.setTitle(`Notes - ${status.innerText}`);
    },
    async hasUnsavedChanges() {
        const current = this.container.querySelector('.notes-editor').value;
        if (!this.currentPath) return current.length > 0;
        const savedContent = await this.api.fs.read(this.currentPath);
        return (savedContent ?? '') !== current;
    },
    async onBeforeClose() {
        if (this._autoSaveTimer) {
            if (this.api) this.api.system.clearTimeout(this._autoSaveTimer);
            this._autoSaveTimer = null;
        }
        if (!this.container || !this.api) return;
        if (await this.hasUnsavedChanges()) {
            if (this.currentPath) {
                const editor = this.container.querySelector('.notes-editor');
                if (!editor) return;
                await this.api.fs.write(this.currentPath, editor.value);
                this.api.notifications.show({
                    title: 'Notatki',
                    message: 'Zmiany zostały automatycznie zapisane.'
                });
            } else {
                return new Promise(resolve => {
                    this.api.ui.confirm('Masz niezapisane zmiany. Zamknąć bez zapisywania?', confirmed => {
                        resolve(confirmed ? true : false);
                    });
                });
            }
        }
    },
    unmount() {
        this.container = null;
        this.api = null;
    },
    async onParamsChange(params) {
        if (params && params.filePath) {
            if (params.filePath === this.currentPath) return;
            const unsaved = await this.hasUnsavedChanges();
            if (unsaved) {
                if (this.currentPath) {
                    await this.onBeforeClose();
                } else {
                    this.api.ui.confirm('Masz niezapisane zmiany. Porzucić je i otworzyć plik?', (confirmed) => {
                        if (confirmed) {
                            this.openFile(params.filePath, this.container.querySelector('.notes-editor'), this.container.querySelector('.notes-status'));
                        }
                    });
                    return;
                }
            }
            this.openFile(params.filePath, this.container.querySelector('.notes-editor'), this.container.querySelector('.notes-status'));
        }
    },
    async openFile(path, textarea, status) {
        const content = await this.api.fs.read(path);
        if (content !== null) {
            textarea.value = content;
            this.currentPath = path;
            status.innerText = this.api.fs.basename(path);
            this.api.window.setTitle(`Notes - ${status.innerText}`);
            textarea.focus();
        }
    }
});
