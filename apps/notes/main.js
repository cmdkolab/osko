WebOS.registerApp({
    id: "notes",
    get name() { return window.I18n.t('notes.title'); },
    icon: "📝",
    version: "4.1.18",
    manifest: {
        get name() { return window.I18n.t('notes.title'); },
        icon: "📝",
        permissions: ["fs.read", "fs.write", "notifications"]
    },
    width: "600px",
    height: "450px",
    mount(container, api, params) {
        this.api = api;
        this.container = container;
        this.currentPath = null;
        this._autoSaveTimer = null;
        const updateStats = () => {
            const textarea = container.querySelector('.notes-editor');
            if (!textarea) return;
            const stats = container.querySelector('.stats-text');
            if (!stats) return;
            const text = textarea.value.trim();
            const words = text ? text.split(/\s+/).length : 0;
            const chars = text.length;
            stats.innerText = `${words} ${window.I18n.t('notes.words')} | ${chars} ${window.I18n.t('notes.chars')}`;
        };
        this.updateStats = updateStats;
        const render = () => {
            container.innerHTML = `
                <div class="notes-app">
                    <div class="notes-toolbar">
                        <div class="btn-group">
                            <button class="sys-btn new-btn" title="${window.I18n.t('notes.new')}">📄</button>
                            <button class="sys-btn save-btn" title="${window.I18n.t('notes.save')}">💾</button>
                            <button class="sys-btn wrap-btn" title="${window.I18n.t('notes.wrap')}">↩️</button>
                        </div>
                        <div class="btn-group">
                            <button class="sys-btn export-btn" title="${window.I18n.t('notes.export')}">📤</button>
                        </div>
                        <div class="notes-status">
                            <span class="status-text"></span>
                            <span class="stats-text"></span>
                        </div>
                    </div>
                    <textarea class="notes-editor" placeholder="${window.I18n.t('notes.placeholder')}" spellcheck="false"></textarea>
                </div>
            `;
            this.setupEvents(container);
        };
        this.render = render;
        render();
        if (params?.filePath) {
            this.openFile(params.filePath);
        }
        this._i18nListener = () => render();
        window.addEventListener('i18n:changed', this._i18nListener);
    },
    setupEvents(container) {
        const textarea = container.querySelector('.notes-editor');
        const status = container.querySelector('.status-text');
        
        textarea.oninput = () => {
            this.updateStats();
            status.innerText = `* ${window.I18n.t('notes.unsaved_changes')}`;
            if (this._autoSaveTimer) this.api.system.clearTimeout(this._autoSaveTimer);
            this._autoSaveTimer = this.api.system.setTimeout(async () => {
                if (this.currentPath) {
                    await this.api.fs.write(this.currentPath, textarea.value);
                    status.innerText = this.api.fs.basename(this.currentPath);
                }
            }, 1000);
        };
        container.querySelector('.new-btn').onclick = () => this.newFile();
        container.querySelector('.save-btn').onclick = () => this.saveFile();
        container.querySelector('.export-btn').onclick = () => this.exportFile();
        let wrapped = true;
        container.querySelector('.wrap-btn').onclick = (e) => {
            wrapped = !wrapped;
            textarea.style.whiteSpace = wrapped ? 'pre-wrap' : 'pre';
            textarea.style.overflowX = wrapped ? 'hidden' : 'auto';
            e.target.classList.toggle('active', !wrapped);
            this.api.notifications.show({ title: window.I18n.t('notes.title'), message: `${window.I18n.t('notes.wrap')}: ${wrapped ? window.I18n.t('settings.sound_on') : window.I18n.t('settings.sound_off')}` });
        };
        textarea.onkeydown = (e) => {
            if (e.key === 'Tab') {
                e.preventDefault();
                const s = textarea.selectionStart;
                textarea.value = textarea.value.substring(0, s) + "    " + textarea.value.substring(textarea.selectionEnd);
                textarea.selectionEnd = s + 4;
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                this.saveFile();
            }
        };
        this.updateStats();
    },
    async openFile(path) {
        const content = await this.api.fs.read(path);
        if (content !== null) {
            const textarea = this.container.querySelector('.notes-editor');
            const status = this.container.querySelector('.status-text');
            textarea.value = content;
            this.currentPath = path;
            status.innerText = this.api.fs.basename(path);
            this.api.window.setTitle(`${window.I18n.t('notes.title')} - ${status.innerText}`);
            this.updateStats();
            this.container.querySelector('.notes-editor').focus();
        } else {
            this.api.notifications.show({ title: window.I18n.t('notes.title'), message: window.I18n.t('notes.open_error'), type: 'error' });
        }
    },
    async saveFile() {
        if (!this.currentPath) {
            this.api.ui.prompt(window.I18n.t('explorer.prompt_file_name'), 'note.txt', async (name) => {
                if (name) {
                    this.currentPath = `/home/user/Documents/${name.endsWith('.txt') ? name : name + '.txt'}`;
                    await this.saveFile();
                }
            });
            return;
        }
        const textarea = this.container.querySelector('.notes-editor');
        await this.api.fs.write(this.currentPath, textarea.value);
        this.container.querySelector('.status-text').innerText = this.api.fs.basename(this.currentPath);
        this.api.window.setTitle(`${window.I18n.t('notes.title')} - ${this.api.fs.basename(this.currentPath)}`);
    },
    newFile() {
        this.currentPath = null;
        this.container.querySelector('.notes-editor').value = '';
        this.container.querySelector('.status-text').innerText = window.I18n.t('notes.new_file');
        this.api.window.setTitle(`${window.I18n.t('notes.title')} - ${window.I18n.t('notes.new_file')}`);
    },
    exportFile() {
        const text = this.container.querySelector('.notes-editor').value;
        const blob = new Blob([text], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = this.currentPath ? this.api.fs.basename(this.currentPath) : 'note.txt';
        a.click();
        URL.revokeObjectURL(url);
    },
    unmount() {
        if (this._autoSaveTimer) this.api.system.clearTimeout(this._autoSaveTimer);
        window.removeEventListener('i18n:changed', this._i18nListener);
    }
});
