WebOS.registerApp({
    id: "notes",
    get name() { return window.I18n.t('notes.title'); },
    icon: "📝",
    version: "2.3.1",
    manifest: {
        get name() { return window.I18n.t('notes.title'); },
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
                <button class="notes-btn new-btn">${window.I18n.t('notes.new')}</button>
                <button class="notes-btn save-btn">${window.I18n.t('notes.save')}</button>
                <button class="notes-btn wrap-btn">${window.I18n.t('notes.wrap')}</button>
                <button class="notes-btn export-btn">${window.I18n.t('notes.export')}</button>
                <span class="notes-status">${window.I18n.t('notes.unsaved')}</span>
            </div>
            <textarea class="notes-editor" placeholder="${window.I18n.t('notes.placeholder')}"></textarea>
        `;
        const textarea = container.querySelector('.notes-editor');
        const status = container.querySelector('.notes-status');
        const newBtn = container.querySelector('.new-btn');
        const saveBtn = container.querySelector('.save-btn');
        const exportBtn = container.querySelector('.export-btn');
        const wrapBtn = container.querySelector('.wrap-btn');
        this._autoSaveTimer = null;
        let isWrapped = true;

        wrapBtn.onclick = () => {
            isWrapped = !isWrapped;
            textarea.style.whiteSpace = isWrapped ? 'pre-wrap' : 'pre';
            wrapBtn.style.opacity = isWrapped ? '1' : '0.5';
        };
        textarea.oninput = () => {
            status.innerText = window.I18n.t('notes.saving');
            if (this._autoSaveTimer) this.api.system.clearTimeout(this._autoSaveTimer);
            this._autoSaveTimer = this.api.system.setTimeout(async () => {
                if (this.currentPath) {
                    await this.api.fs.write(this.currentPath, textarea.value);
                    status.innerText = this.api.fs.basename(this.currentPath);
                } else {
                    status.innerText = window.I18n.t('notes.modified');
                }
                this._autoSaveTimer = null;
            }, 800);
        };
        textarea.onkeydown = async (e) => {
            if (e.key === 'Tab') {
                e.preventDefault();
                const start = textarea.selectionStart;
                const end = textarea.selectionEnd;
                textarea.value = textarea.value.substring(0, start) + "\t" + textarea.value.substring(end);
                textarea.selectionStart = textarea.selectionEnd = start + 1;
                textarea.dispatchEvent(new Event('input', { bubbles: true }));
            } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
                e.preventDefault();
                await saveBtn.onclick();
            }
        };
        newBtn.onclick = async () => {
            if (await this.hasUnsavedChanges()) {
                this.api.ui.confirm(window.I18n.t('notes.unsaved_confirm'), (confirmed) => {
                    if (confirmed) this.resetEditor();
                });
            } else {
                this.resetEditor();
            }
        };
        saveBtn.onclick = async () => {
            if (!this.currentPath) {
                this.api.ui.prompt(window.I18n.t('explorer.prompt_file_name'), 'osko_note', async (name) => {
                    if (!name) return;
                    const filename = name.endsWith('.txt') ? name : name + '.txt';
                    const fullPath = `/home/user/Documents/${filename}`;
                    if (await this.api.fs.exists(fullPath)) {
                        this.api.ui.fileConflict(filename, async (choice) => {
                            if (choice === 'replace') {
                                this.currentPath = fullPath;
                                await this.saveContent();
                            } else if (choice === 'copy') {
                                const base = filename.replace('.txt', '');
                                let newName = `${base} (kopia).txt`;
                                let counter = 1;
                                while (await this.api.fs.exists(`/home/user/Documents/${newName}`)) {
                                    newName = `${base} (kopia ${++counter}).txt`;
                                }
                                this.currentPath = `/home/user/Documents/${newName}`;
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
            a.download = this.currentPath ? this.api.fs.basename(this.currentPath) : 'osko_note.txt';
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
        status.innerText = window.I18n.t('notes.new_file');
        this.api.window.setTitle(`${window.I18n.t('notes.title')} - ${window.I18n.t('notes.new_file')}`);
    },
    async saveContent() {
        const textarea = this.container.querySelector('.notes-editor');
        const status = this.container.querySelector('.notes-status');
        await this.api.fs.write(this.currentPath, textarea.value);
        status.innerText = this.api.fs.basename(this.currentPath);
        this.api.window.setTitle(`${window.I18n.t('notes.title')} - ${status.innerText}`);
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
                    title: window.I18n.t('notes.title'),
                    message: window.I18n.t('notes.auto_saved')
                });
            } else {
                return new Promise(resolve => {
                    this.api.ui.confirm(window.I18n.t('notes.confirm_close'), confirmed => {
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
                    await this.api.fs.write(this.currentPath, this.container.querySelector('.notes-editor').value);
                } else {
                    const confirmed = await new Promise(resolve => {
                        this.api.ui.confirm(window.I18n.t('notes.confirm_open'), resolve);
                    });
                    if (!confirmed) return;
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
            this.api.window.setTitle(`${window.I18n.t('notes.title')} - ${status.innerText}`);
            textarea.focus();
        }
    }
});
