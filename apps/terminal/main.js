WebOS.registerApp({
    id: "terminal",
    get name() { return window.I18n.t('terminal.title'); },
    icon: "🐚",
    version: "4.8.0",
    manifest: {
        get name() { return window.I18n.t('terminal.title'); },
        icon: "🐚",
        permissions: ["fs.read", "fs.write", "system.manage"]
    },
    width: "600px",
    height: "400px",
    mount(container, api) {
        this.container = container;
        this.api = api;
        this.cwd = '/home/user';
        this.history = [];
        this.historyIndex = -1;
        this._loadHistory();
        container.innerHTML = `
            <div class="terminal-container">
                <div class="terminal-output"></div>
                <div class="terminal-input-line">
                    <span class="terminal-prompt"></span>
                    <div style="position: relative; flex: 1; display: flex; align-items: center;">
                        <input type="text" class="terminal-input" spellcheck="false" autofocus>
                        <span class="terminal-cursor"></span>
                    </div>
                </div>
            </div>
        `;
        this.output = container.querySelector('.terminal-output');
        this.input = container.querySelector('.terminal-input');
        this.prompt = container.querySelector('.terminal-prompt');
        this.updatePrompt();
        this.print(window.I18n.t('terminal.version_prefix', window.I18n.t('terminal.title'), this.api.system.VERSION));
        this.print(window.I18n.t('terminal.welcome'));
        this.input.onkeydown = (e) => {
            if (e.key === 'Enter') {
                const cmd = this.input.value.trim();
                if (cmd) {
                    this.history.unshift(cmd);
                    if (this.history.length > 50) this.history.pop();
                    this._saveHistory();
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
            } else if (e.ctrlKey && e.key === 'l') {
                this.output.innerHTML = '';
                e.preventDefault();
            }
        };
        container.onclick = () => this.input.focus();
    },
    updatePrompt() {
        const user = window.I18n.t('terminal.prompt_user');
        const host = window.I18n.t('terminal.prompt_host');
        this.prompt.innerText = `${user}@${host}:${this.cwd}$ `;
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
                this.print(window.I18n.t('terminal.help_system'));
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
                        const sorted = (entries || []).sort((a, b) => {
                            if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
                            return a.name.localeCompare(b.name, undefined, { numeric: true });
                        });
                        const html = sorted.map(e => {
                            const cls = e.type === 'dir' ? 'terminal-dir' : '';
                            return `<span class="${cls}">${e.type === 'dir' ? e.name + '/' : e.name}</span>`;
                        }).join('  ');
                        this.printHTML(html);
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
                if (!args[0]) { this.print(window.I18n.t('terminal.usage_cat')); break; }
                try {
                    const target = args[0];
                    const path = target.startsWith('/') ? this.api.fs.join(target) : this.api.fs.join(this.cwd, target);
                    const entries = await this.api.fs.list(path);
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
                if (!args[0]) { this.print(window.I18n.t('terminal.usage_mkdir')); break; }
                try {
                    const target = args[0];
                    const path = target.startsWith('/') ? this.api.fs.join(target) : this.api.fs.join(this.cwd, target);
                    await this.api.fs.mkdir(path);
                } catch (e) { this.print(`mkdir: ${args[0]}: ${window.I18n.t('terminal.error')}`, 'error'); }
                break;
            case 'rm':
                if (!args[0]) { this.print(window.I18n.t('terminal.usage_rm')); break; }
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
                    this.print(`${window.I18n.t('taskmanager.pid').padEnd(6)}${window.I18n.t('taskmanager.storage').padEnd(12)}${window.I18n.t('taskmanager.uptime').padEnd(10)}${window.I18n.t('taskmanager.status').padEnd(12)}${window.I18n.t('taskmanager.app')}`, 'echo');
                    procs.forEach(p => {
                        const pidStr = String(p.pid).padEnd(6);
                        const storage = (this.api.system.storage.calculateUsage(p.appId) / 1024).toFixed(1) + ' KB';
                        const storageStr = storage.padEnd(12);
                        const uptime = Math.floor((Date.now() - p.startTime) / 1000);
                        const uptimeStr = (uptime + 's').padEnd(10);
                        const statusStr = window.I18n.t('taskmanager.running').padEnd(12);
                        this.print(`${pidStr}${storageStr}${uptimeStr}${statusStr}${p.name || p.appId}`);
                    });
                } catch (e) { this.print(`ps: ${window.I18n.t('terminal.error')}: ${e.message}`, 'error'); }
                break;
            case 'system':
                this.print(`OS(KO) Kernel v${this.api.system.VERSION}`, 'echo');
                this.print(`${window.I18n.t('about.uptime')}: ${this.api.system.getUptime()}`);
                const totalUsage = this.api.system.storage.getTotalUsage();
                const quota = 10 * 1024 * 1024;
                const percent = ((totalUsage / quota) * 100).toFixed(1);
                this.print(`${window.I18n.t('terminal.vfs_usage')}: ${(totalUsage / 1024 / 1024).toFixed(2)} MB / 10.00 MB (${percent}%)`);
                this.print(`${window.I18n.t('terminal.resolution')}: ${window.innerWidth}x${window.innerHeight}`);
                this.print(`${window.I18n.t('terminal.language')}: ${window.I18n.current.toUpperCase()}`);
                break;
            case 'play':
                if (!args[0]) { this.print(window.I18n.t('terminal.sounds')); break; }
                this.api.audio.play(args[0]);
                break;
            case 'edit':
                if (!args[0]) { this.print(window.I18n.t('terminal.usage_edit')); break; }
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
            case 'theme':
                if (!args[0]) { this.print(window.I18n.t('terminal.theme_usage')); break; }
                const termContainer = this.container.querySelector('.terminal-container');
                termContainer.classList.remove('theme-matrix', 'theme-cyberpunk', 'theme-classic');
                if (args[0] !== 'default') termContainer.classList.add(`theme-${args[0]}`);
                this.print(`Theme changed to: ${args[0]}`);
                break;
            case 'cp':
                if (args.length < 2) { this.print('Usage: cp <source> <dest>'); break; }
                try {
                    const src = args[0].startsWith('/') ? this.api.fs.join(args[0]) : this.api.fs.join(this.cwd, args[0]);
                    const dst = args[1].startsWith('/') ? this.api.fs.join(args[1]) : this.api.fs.join(this.cwd, args[1]);
                    const content = await this.api.fs.read(src);
                    if (content === null) { this.print(`cp: ${args[0]}: not found`, 'error'); break; }
                    await this.api.fs.write(dst, content);
                } catch (e) { this.print(`cp: ${e.message}`, 'error'); }
                break;
            case 'mv':
                if (args.length < 2) { this.print('Usage: mv <source> <dest>'); break; }
                try {
                    const src = args[0].startsWith('/') ? this.api.fs.join(args[0]) : this.api.fs.join(this.cwd, args[0]);
                    const dst = args[1].startsWith('/') ? this.api.fs.join(args[1]) : this.api.fs.join(this.cwd, args[1]);
                    const content = await this.api.fs.read(src);
                    if (content === null) { this.print(`mv: ${args[0]}: not found`, 'error'); break; }
                    await this.api.fs.write(dst, content);
                    await this.api.fs.remove(src);
                } catch (e) { this.print(`mv: ${e.message}`, 'error'); }
                break;
            case 'touch':
                if (!args[0]) { this.print('Usage: touch <file>'); break; }
                try {
                    const path = args[0].startsWith('/') ? this.api.fs.join(args[0]) : this.api.fs.join(this.cwd, args[0]);
                    if (!(await this.api.fs.exists(path))) await this.api.fs.write(path, '');
                } catch (e) { this.print(`touch: ${e.message}`, 'error'); }
                break;
            case 'head':
                if (!args[0]) { this.print('Usage: head [-n N] <file>'); break; }
                try {
                    let n = 10, file = args[0];
                    if (args[0] === '-n') { n = parseInt(args[1]); file = args[2]; }
                    const path = file.startsWith('/') ? this.api.fs.join(file) : this.api.fs.join(this.cwd, file);
                    const content = await this.api.fs.read(path);
                    if (content === null) { this.print(`head: ${file}: not found`, 'error'); break; }
                    this.print(content.split('\n').slice(0, n).join('\n'));
                } catch (e) { this.print(`head: ${e.message}`, 'error'); }
                break;
            case 'tail':
                if (!args[0]) { this.print('Usage: tail [-n N] <file>'); break; }
                try {
                    let n = 10, file = args[0];
                    if (args[0] === '-n') { n = parseInt(args[1]); file = args[2]; }
                    const path = file.startsWith('/') ? this.api.fs.join(file) : this.api.fs.join(this.cwd, file);
                    const content = await this.api.fs.read(path);
                    if (content === null) { this.print(`tail: ${file}: not found`, 'error'); break; }
                    this.print(content.split('\n').slice(-n).join('\n'));
                } catch (e) { this.print(`tail: ${e.message}`, 'error'); }
                break;
            case 'find':
                if (!args[0]) { this.print('Usage: find <path> [name]'); break; }
                try {
                    const searchPath = args[0].startsWith('/') ? this.api.fs.join(args[0]) : this.api.fs.join(this.cwd, args[0]);
                    const nameFilter = args[1] || '';
                    const results = await this._findFiles(searchPath, nameFilter);
                    if (results.length) this.print(results.join('\n'));
                    else this.print('No files found');
                } catch (e) { this.print(`find: ${e.message}`, 'error'); }
                break;
            case 'tree':
                try {
                    const treePath = args[0] ? (args[0].startsWith('/') ? this.api.fs.join(args[0]) : this.api.fs.join(this.cwd, args[0])) : this.cwd;
                    const tree = await this._buildTree(treePath, '');
                    this.print(treePath.split('/').pop() || '/');
                    this.print(tree);
                } catch (e) { this.print(`tree: ${e.message}`, 'error'); }
                break;
            case 'alias':
                if (!args[0]) { try { const a = JSON.parse(localStorage.getItem('OSKO:terminal:aliases') || '{}'); Object.entries(a).forEach(([k,v]) => this.print(`${k}='${v}'`)); } catch(e){} break; }
                if (args[0] === 'rm' && args[1]) { try { const a = JSON.parse(localStorage.getItem('OSKO:terminal:aliases') || '{}'); delete a[args[1]]; localStorage.setItem('OSKO:terminal:aliases', JSON.stringify(a)); this.print(`Alias '${args[1]}' removed`); } catch(e){ this.print(`alias rm: ${e.message}`, 'error'); } break; }
                if (args[0].includes('=')) { const [name, ...rest] = args.join(' ').split('='); const a = JSON.parse(localStorage.getItem('OSKO:terminal:aliases') || '{}'); a[name.trim()] = rest.join('=').trim(); localStorage.setItem('OSKO:terminal:aliases', JSON.stringify(a)); this.print(`Alias '${name.trim()}' set to '${rest.join('=').trim()}'`); } else { try { const a = JSON.parse(localStorage.getItem('OSKO:terminal:aliases') || '{}'); const v = a[args[0]]; this.print(v ? `${args[0]}='${v}'` : `alias: ${args[0]}: not found`); } catch(e){} }
                break;
            case 'grep':
                if (args.length < 2) { this.print('Usage: grep <pattern> <file>'); break; }
                try {
                    const pattern = args[0];
                    const file = args[1].startsWith('/') ? this.api.fs.join(args[1]) : this.api.fs.join(this.cwd, args[1]);
                    const content = await this.api.fs.read(file);
                    if (content === null) { this.print(`grep: ${args[1]}: not found`, 'error'); break; }
                    const lines = content.split('\n').filter(l => l.toLowerCase().includes(pattern.toLowerCase()));
                    if (lines.length) this.print(lines.join('\n')); else this.print('No matches found');
                } catch (e) { this.print(`grep: ${e.message}`, 'error'); }
                break;
            case 'history':
                this.history.slice().reverse().forEach((cmd, i) => this.print(`${i + 1}: ${cmd}`));
                break;
            case 'top':
                 this.executeTop();
                 break;
            default:
                this.print(`${window.I18n.t('terminal.not_found')}: ${cmd}`, 'error');
        }
    },
    async handleTab() {
        const val = this.input.value;
        const parts = val.split(/\s+/);
        const last = parts[parts.length - 1];
        if (!last && parts.length > 1) return;
        try {
            const commands = ['ls', 'cd', 'cat', 'edit', 'mkdir', 'rm', 'clear', 'echo', 'date', 'pwd', 'help', 'version', 'play', 'uptime', 'ps', 'system'];
            const entries = await this.api.fs.list(this.cwd);
            const files = entries ? entries.map(e => e.name) : [];
            const apps = Object.values(WebOS.state.apps).map(a => a.id);
            let candidates = [];
            if (parts.length <= 1) {
                candidates = [...commands, ...apps];
            } else {
                candidates = [...files, ...apps];
            }
            const matches = candidates.filter(f => f.toLowerCase().startsWith(last.toLowerCase()));
            if (matches.length === 1) {
                parts[parts.length - 1] = matches[0];
                this.input.value = parts.join(' ') + (parts.length === 1 ? ' ' : '');
            } else if (matches.length > 1) {
                this.print([...new Set(matches)].join('  '));
            }
        } catch (e) { }
    },
    printHTML(html, type = 'info') {
        const line = document.createElement('div');
        line.className = `terminal-line terminal-${type}`;
        line.innerHTML = html;
        this.output.appendChild(line);
        this.output.scrollTop = this.output.scrollHeight;
    },
    async executeTop() {
        this.print("--- SYSTEM TOP ---", 'echo');
        const procs = await this.api.system.getProcesses();
        this.print(`PID   APPS      UPTIME    MEM`, 'echo');
        procs.forEach(p => {
            const up = Math.floor((Date.now() - p.startTime)/1000);
            const mem = (this.api.system.storage.calculateUsage(p.appId) / 1024).toFixed(0) + 'K';
            this.print(`${String(p.pid).padEnd(6)}${p.appId.slice(0,8).padEnd(10)}${String(up+'s').padEnd(10)}${mem}`);
        });
        this.print("------------------", 'echo');
    },
    async _findFiles(path, filter) {
        const results = [];
        const entries = await this.api.fs.list(path);
        if (!entries) return results;
        for (const e of entries) {
            const fullPath = this.api.fs.join(path, e.name);
            if (!filter || e.name.toLowerCase().includes(filter.toLowerCase())) results.push(fullPath);
            if (e.type === 'dir') results.push(...await this._findFiles(fullPath, filter));
        }
        return results;
    },
    async _buildTree(path, prefix) {
        const entries = await this.api.fs.list(path);
        if (!entries) return '';
        let result = '';
        const sorted = entries.sort((a, b) => { if (a.type !== b.type) return a.type === 'dir' ? -1 : 1; return a.name.localeCompare(b.name); });
        for (let i = 0; i < sorted.length; i++) {
            const e = sorted[i];
            const isLast = i === sorted.length - 1;
            const connector = isLast ? '└── ' : '├── ';
            result += prefix + connector + (e.type === 'dir' ? e.name + '/' : e.name) + '\n';
            if (e.type === 'dir') {
                const childPrefix = prefix + (isLast ? '    ' : '│   ');
                result += await this._buildTree(this.api.fs.join(path, e.name), childPrefix);
            }
        }
        return result;
    },
    async _loadHistory() {
        try {
            const data = await this.api.fs.read('/home/user/settings/terminal_history.json');
            if (data) this.history = JSON.parse(data);
        } catch (e) {}
    },
    async _saveHistory() {
        try {
            await this.api.fs.write('/home/user/settings/terminal_history.json', JSON.stringify(this.history));
        } catch (e) {}
    }
});
