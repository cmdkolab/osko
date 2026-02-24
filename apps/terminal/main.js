WebOS.registerApp({
    id: "terminal",
    get name() { return window.I18n.t('terminal.title'); },
    icon: "🐚",
    version: "2.3.1",
    manifest: {
        get name() { return window.I18n.t('terminal.title'); },
        icon: "🐚",
        permissions: ["fs.read", "fs.write"]
    },
    width: "600px",
    height: "400px",
    mount(container, api) {
        this.container = container;
        this.api = api;
        this.cwd = '/home/user';
        this.history = [];
        this.historyIndex = -1;

        container.innerHTML = `
            <div class="terminal-container">
                <div class="terminal-output"></div>
                <div class="terminal-input-line">
                    <span class="terminal-prompt"></span>
                    <input type="text" class="terminal-input" spellcheck="false" autofocus>
                </div>
            </div>
        `;

        this.output = container.querySelector('.terminal-output');
        this.input = container.querySelector('.terminal-input');
        this.prompt = container.querySelector('.terminal-prompt');

        this.updatePrompt();
        this.print(`OS(KO) ${window.I18n.t('terminal.title')} v3.0.1`);
        this.print(window.I18n.t('terminal.welcome'));

        this.input.onkeydown = (e) => {
            if (e.key === 'Enter') {
                const cmd = this.input.value.trim();
                if (cmd) {
                    this.history.unshift(cmd);
                    this.historyIndex = -1;
                    this.execute(cmd);
                }
                this.input.value = '';
            } else if (e.key === 'ArrowUp') {
                if (this.historyIndex < this.history.length - 1) {
                    this.historyIndex++;
                    this.input.value = this.history[this.historyIndex];
                }
                e.preventDefault();
            } else if (e.key === 'ArrowDown') {
                if (this.historyIndex > 0) {
                    this.historyIndex--;
                    this.input.value = this.history[this.historyIndex];
                } else {
                    this.historyIndex = -1;
                    this.input.value = '';
                }
                e.preventDefault();
            } else if (e.key === 'Tab') {
                this.handleTab();
                e.preventDefault();
            }
        };

        container.onclick = () => this.input.focus();
    },
    updatePrompt() {
        this.prompt.innerText = `user@osko:${this.cwd}$ `;
    },
    print(text, type = 'info') {
        const line = document.createElement('div');
        line.className = `terminal-line terminal-${type}`;
        line.innerText = text;
        this.output.appendChild(line);
        this.output.scrollTop = this.output.scrollHeight;
    },
    async execute(input) {
        this.print(`${this.prompt.innerText} ${input}`, 'echo');
        const parts = input.split(/\s+/);
        const cmd = parts[0].toLowerCase();
        const args = parts.slice(1);

        switch (cmd) {
            case 'help':
                this.print(window.I18n.t('terminal.help'));
                break;
            case 'echo':
                this.print(args.join(' '));
                break;
            case 'date':
                this.print(new Date().toString());
                break;
            case 'pwd':
                this.print(this.cwd);
                break;
            case 'ls':
                try {
                    const entries = await this.api.fs.list(this.cwd);
                    if (entries === null) {
                        this.print(`ls: ${this.cwd}: ${window.I18n.t('terminal.not_found')}`, 'error');
                    } else {
                        this.print(entries.map(e => e.type === 'dir' ? e.name + '/' : e.name).join('  '));
                    }
                } catch (e) { this.print(`${window.I18n.t('terminal.error')}: ${e.message}`, 'error'); }
                break;
            case 'cd':
                const target = args[0] || '/home/user';
                const newPath = target.startsWith('/') ? this.api.fs.join(target) : this.api.fs.join(this.cwd, target);
                if (await this.api.fs.exists(newPath)) {
                    this.cwd = newPath;
                    this.updatePrompt();
                } else {
                    this.print(`cd: ${target}: ${window.I18n.t('terminal.not_found')}`, 'error');
                }
                break;
            case 'cat':
                if (!args[0]) { this.print("cat <file>"); break; }
                try {
                    const target = args[0];
                    const path = target.startsWith('/') ? this.api.fs.join(target) : this.api.fs.join(this.cwd, target);
                    const entries = this.api.fs.list(path);
                    if (entries !== null) {
                        this.print(`cat: ${args[0]}: ${window.I18n.t('terminal.is_dir')}`, 'error');
                        break;
                    }
                    const content = await this.api.fs.read(path);
                    if (content === null) {
                        this.print(`cat: ${args[0]}: ${window.I18n.t('terminal.not_found')}`, 'error');
                    } else {
                        this.print(content);
                    }
                } catch (e) { this.print(`cat: ${args[0]}: ${window.I18n.t('terminal.read_error')}`, 'error'); }
                break;
            case 'mkdir':
                if (!args[0]) { this.print("mkdir <dir>"); break; }
                try {
                    const target = args[0];
                    const path = target.startsWith('/') ? this.api.fs.join(target) : this.api.fs.join(this.cwd, target);
                    await this.api.fs.mkdir(path);
                } catch (e) { this.print(`mkdir: ${args[0]}: ${window.I18n.t('terminal.error')}`, 'error'); }
                break;
            case 'rm':
                if (!args[0]) { this.print("rm <file/dir>"); break; }
                try {
                    const target = args[0];
                    const path = target.startsWith('/') ? this.api.fs.join(target) : this.api.fs.join(this.cwd, target);
                    await this.api.fs.remove(path);
                } catch (e) { this.print(`rm: ${args[0]}: ${window.I18n.t('terminal.error')}`, 'error'); }
                break;
            case 'clear':
                this.output.innerHTML = '';
                break;
            case 'version':
                this.print(`OS(KO) Kernel v${this.api.system.VERSION}`);
                break;
            case 'uptime':
                this.print(`${window.I18n.t('about.uptime')}: ${this.api.system.getUptime()}`);
                break;
            case 'ps':
                try {
                    const procs = await this.api.system.getProcesses();
                    this.print(`PID   RAM        ${window.I18n.t('taskmanager.status').toUpperCase()}    ${window.I18n.t('taskmanager.app').toUpperCase()}`, 'echo');
                    procs.forEach(p => {
                        const pidStr = String(p.pid).padEnd(5, ' ');
                        const ramStr = p.storage.split(' / ')[0].padEnd(10, ' ');
                        const timeStr = String(p.uptime).padEnd(7, ' ');
                        this.print(`${pidStr} ${ramStr} ${timeStr} ${p.name}`);
                    });
                } catch (e) { this.print(`ps: ${window.I18n.t('terminal.error')}: ${e.message}`, 'error'); }
                break;
            case 'play':
                if (!args[0]) { this.print("Dostępne dźwięki: startup, click, error, notify"); break; }
                this.api.audio.play(args[0]);
                break;
            case 'edit':
                if (!args[0]) { this.print("edit <file>"); break; }
                try {
                    const target = args[0];
                    const path = target.startsWith('/') ? this.api.fs.join(target) : this.api.fs.join(this.cwd, target);
                    let content = '';
                    if (await this.api.fs.exists(path)) {
                        content = await this.api.fs.read(path);
                    }
                    this.api.ui.prompt(`${window.I18n.t('menu.edit')}: ${args[0]}`, content, async (newContent) => {
                        if (newContent !== null) {
                            await this.api.fs.write(path, newContent);
                            this.print(`${window.I18n.t('dialog.ok')} ${args[0]}`);
                        }
                    });
                } catch (e) { this.print(`edit: ${args[0]}: ${window.I18n.t('terminal.error')}`, 'error'); }
                break;
            default:
                this.print(`${window.I18n.t('terminal.not_found')}: ${cmd}`, 'error');
        }
    },
    async handleTab() {
        const val = this.input.value;
        const parts = val.split(/\s+/);
        const last = parts[parts.length - 1];
        if (!last) return;

        try {
            const entries = await this.api.fs.list(this.cwd);
            const files = entries.map(e => e.name);
            const apps = Object.values(WebOS.state.apps).map(a => a.id);
            const all = [...files, ...apps];
            const matches = all.filter(f => f.toLowerCase().startsWith(last.toLowerCase()));

            if (matches.length === 1) {
                parts[parts.length - 1] = matches[0];
                this.input.value = parts.join(' ');
            } else if (matches.length > 1) {
                this.print(matches.join('  '));
            }
        } catch (e) { }
    }
});
