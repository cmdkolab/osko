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
        const m = this._cmds[cmd];
        if (m) await this[m](this, args);
        else this.print(`${window.I18n.t('terminal.not_found')}: ${cmd}`, 'error');
    },
    async _cmd_help(ctx, args) {
        ctx.print(window.I18n.t('terminal.help'));
        ctx.print(window.I18n.t('terminal.help_system'));
    },
    async _cmd_echo(ctx, args) { ctx.print(args.join(' ')); },
    async _cmd_date(ctx, args) { ctx.print(new Date().toString()); },
    async _cmd_pwd(ctx, args) { ctx.print(ctx.cwd); },
    async _cmd_ls(ctx, args) {
        try {
            const entries = await ctx.api.fs.list(ctx.cwd);
            if (entries === null) { ctx.print(`ls: ${ctx.cwd}: ${window.I18n.t('terminal.not_found')}`, 'error'); return; }
            const sorted = (entries || []).sort((a, b) => {
                if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
                return a.name.localeCompare(b.name, undefined, { numeric: true });
            });
            ctx.printHTML(sorted.map(e => `<span class="${e.type === 'dir' ? 'terminal-dir' : ''}">${e.type === 'dir' ? e.name + '/' : e.name}</span>`).join('  '));
        } catch (e) { ctx.print(`${window.I18n.t('terminal.error')}: ${e.message}`, 'error'); }
    },
    async _cmd_cd(ctx, args) {
        const target = args[0] || '/home/user';
        const newPath = target.startsWith('/') ? ctx.api.fs.join(target) : ctx.api.fs.join(ctx.cwd, target);
        if (await ctx.api.fs.exists(newPath)) { ctx.cwd = newPath; ctx.updatePrompt(); }
        else ctx.print(`cd: ${target}: ${window.I18n.t('terminal.not_found')}`, 'error');
    },
    async _cmd_cat(ctx, args) {
        if (!args[0]) { ctx.print(window.I18n.t('terminal.usage_cat')); return; }
        try {
            const path = args[0].startsWith('/') ? ctx.api.fs.join(args[0]) : ctx.api.fs.join(ctx.cwd, args[0]);
            if (await ctx.api.fs.list(path) !== null) { ctx.print(`cat: ${args[0]}: ${window.I18n.t('terminal.is_dir')}`, 'error'); return; }
            const content = await ctx.api.fs.read(path);
            if (content === null) ctx.print(`cat: ${args[0]}: ${window.I18n.t('terminal.not_found')}`, 'error');
            else ctx.print(content);
        } catch (e) { ctx.print(`cat: ${args[0]}: ${window.I18n.t('terminal.read_error')}`, 'error'); }
    },
    async _cmd_mkdir(ctx, args) {
        if (!args[0]) { ctx.print(window.I18n.t('terminal.usage_mkdir')); return; }
        try { const path = args[0].startsWith('/') ? ctx.api.fs.join(args[0]) : ctx.api.fs.join(ctx.cwd, args[0]); await ctx.api.fs.mkdir(path); }
        catch (e) { ctx.print(`mkdir: ${args[0]}: ${window.I18n.t('terminal.error')}`, 'error'); }
    },
    async _cmd_rm(ctx, args) {
        if (!args[0]) { ctx.print(window.I18n.t('terminal.usage_rm')); return; }
        try { const path = args[0].startsWith('/') ? ctx.api.fs.join(args[0]) : ctx.api.fs.join(ctx.cwd, args[0]); await ctx.api.fs.remove(path); }
        catch (e) { ctx.print(`rm: ${args[0]}: ${window.I18n.t('terminal.error')}`, 'error'); }
    },
    async _cmd_clear(ctx, args) { ctx.output.innerHTML = ''; },
    async _cmd_version(ctx, args) { ctx.print(`OS(KO) Kernel v${ctx.api.system.VERSION}`); },
    async _cmd_uptime(ctx, args) { ctx.print(`${window.I18n.t('about.uptime')}: ${ctx.api.system.getUptime()}`); },
    async _cmd_ps(ctx, args) {
        try {
            const procs = await ctx.api.system.getProcesses();
            ctx.print(`${window.I18n.t('taskmanager.pid').padEnd(6)}${window.I18n.t('taskmanager.storage').padEnd(12)}${window.I18n.t('taskmanager.uptime').padEnd(10)}${window.I18n.t('taskmanager.status').padEnd(12)}${window.I18n.t('taskmanager.app')}`, 'echo');
            procs.forEach(p => {
                const pidStr = String(p.pid).padEnd(6);
                const storage = (ctx.api.system.storage.calculateUsage(p.appId) / 1024).toFixed(1) + ' KB';
                const uptime = Math.floor((Date.now() - p.startTime) / 1000);
                ctx.print(`${pidStr}${storage.padEnd(12)}${(uptime + 's').padEnd(10)}${window.I18n.t('taskmanager.running').padEnd(12)}${p.name || p.appId}`);
            });
        } catch (e) { ctx.print(`ps: ${window.I18n.t('terminal.error')}: ${e.message}`, 'error'); }
    },
    async _cmd_system(ctx, args) {
        const totalUsage = ctx.api.system.storage.getTotalUsage();
        const percent = ((totalUsage / 10485760) * 100).toFixed(1);
        ctx.print(`OS(KO) Kernel v${ctx.api.system.VERSION}`, 'echo');
        ctx.print(`${window.I18n.t('about.uptime')}: ${ctx.api.system.getUptime()}`);
        ctx.print(`${window.I18n.t('terminal.vfs_usage')}: ${(totalUsage / 1024 / 1024).toFixed(2)} MB / 10.00 MB (${percent}%)`);
        ctx.print(`${window.I18n.t('terminal.resolution')}: ${window.innerWidth}x${window.innerHeight}`);
        ctx.print(`${window.I18n.t('terminal.language')}: ${window.I18n.current.toUpperCase()}`);
    },
    async _cmd_play(ctx, args) { if (!args[0]) ctx.print(window.I18n.t('terminal.sounds')); else ctx.api.audio.play(args[0]); },
    async _cmd_edit(ctx, args) {
        if (!args[0]) { ctx.print(window.I18n.t('terminal.usage_edit')); return; }
        try {
            const path = args[0].startsWith('/') ? ctx.api.fs.join(args[0]) : ctx.api.fs.join(ctx.cwd, args[0]);
            let content = '';
            if (await ctx.api.fs.exists(path)) content = await ctx.api.fs.read(path);
            ctx.api.ui.prompt(`${window.I18n.t('menu.edit')}: ${args[0]}`, content, async (newContent) => {
                if (newContent !== null) { await ctx.api.fs.write(path, newContent); ctx.print(`${window.I18n.t('dialog.ok')} ${args[0]}`); }
            });
        } catch (e) { ctx.print(`edit: ${args[0]}: ${window.I18n.t('terminal.error')}`, 'error'); }
    },
    async _cmd_theme(ctx, args) {
        if (!args[0]) { ctx.print(window.I18n.t('terminal.theme_usage')); return; }
        const tc = ctx.container.querySelector('.terminal-container');
        tc.classList.remove('theme-matrix', 'theme-cyberpunk', 'theme-classic');
        if (args[0] !== 'default') tc.classList.add(`theme-${args[0]}`);
        ctx.print(`Theme changed to: ${args[0]}`);
    },
    async _cmd_cp(ctx, args) {
        if (args.length < 2) { ctx.print('Usage: cp <source> <dest>'); return; }
        try {
            const src = args[0].startsWith('/') ? ctx.api.fs.join(args[0]) : ctx.api.fs.join(ctx.cwd, args[0]);
            const dst = args[1].startsWith('/') ? ctx.api.fs.join(args[1]) : ctx.api.fs.join(ctx.cwd, args[1]);
            const content = await ctx.api.fs.read(src);
            if (content === null) { ctx.print(`cp: ${args[0]}: not found`, 'error'); return; }
            await ctx.api.fs.write(dst, content);
        } catch (e) { ctx.print(`cp: ${e.message}`, 'error'); }
    },
    async _cmd_mv(ctx, args) {
        if (args.length < 2) { ctx.print('Usage: mv <source> <dest>'); return; }
        try {
            const src = args[0].startsWith('/') ? ctx.api.fs.join(args[0]) : ctx.api.fs.join(ctx.cwd, args[0]);
            const dst = args[1].startsWith('/') ? ctx.api.fs.join(args[1]) : ctx.api.fs.join(ctx.cwd, args[1]);
            const content = await ctx.api.fs.read(src);
            if (content === null) { ctx.print(`mv: ${args[0]}: not found`, 'error'); return; }
            await ctx.api.fs.write(dst, content); await ctx.api.fs.remove(src);
        } catch (e) { ctx.print(`mv: ${e.message}`, 'error'); }
    },
    async _cmd_touch(ctx, args) {
        if (!args[0]) { ctx.print('Usage: touch <file>'); return; }
        try { const path = args[0].startsWith('/') ? ctx.api.fs.join(args[0]) : ctx.api.fs.join(ctx.cwd, args[0]); if (!(await ctx.api.fs.exists(path))) await ctx.api.fs.write(path, ''); }
        catch (e) { ctx.print(`touch: ${e.message}`, 'error'); }
    },
    async _cmd_head(ctx, args) {
        if (!args[0]) { ctx.print('Usage: head [-n N] <file>'); return; }
        try {
            let n = 10, file = args[0];
            if (args[0] === '-n') { n = parseInt(args[1]); file = args[2]; }
            const path = file.startsWith('/') ? ctx.api.fs.join(file) : ctx.api.fs.join(ctx.cwd, file);
            const content = await ctx.api.fs.read(path);
            if (content === null) { ctx.print(`head: ${file}: not found`, 'error'); return; }
            ctx.print(content.split('\n').slice(0, n).join('\n'));
        } catch (e) { ctx.print(`head: ${e.message}`, 'error'); }
    },
    async _cmd_tail(ctx, args) {
        if (!args[0]) { ctx.print('Usage: tail [-n N] <file>'); return; }
        try {
            let n = 10, file = args[0];
            if (args[0] === '-n') { n = parseInt(args[1]); file = args[2]; }
            const path = file.startsWith('/') ? ctx.api.fs.join(file) : ctx.api.fs.join(ctx.cwd, file);
            const content = await ctx.api.fs.read(path);
            if (content === null) { ctx.print(`tail: ${file}: not found`, 'error'); return; }
            ctx.print(content.split('\n').slice(-n).join('\n'));
        } catch (e) { ctx.print(`tail: ${e.message}`, 'error'); }
    },
    async _cmd_find(ctx, args) {
        if (!args[0]) { ctx.print('Usage: find <path> [name]'); return; }
        try {
            const searchPath = args[0].startsWith('/') ? ctx.api.fs.join(args[0]) : ctx.api.fs.join(ctx.cwd, args[0]);
            const results = await ctx._findFiles(searchPath, args[1] || '');
            if (results.length) ctx.print(results.join('\n')); else ctx.print('No files found');
        } catch (e) { ctx.print(`find: ${e.message}`, 'error'); }
    },
    async _cmd_tree(ctx, args) {
        try {
            const treePath = args[0] ? (args[0].startsWith('/') ? ctx.api.fs.join(args[0]) : ctx.api.fs.join(ctx.cwd, args[0])) : ctx.cwd;
            const tree = await ctx._buildTree(treePath, '');
            ctx.print(treePath.split('/').pop() || '/');
            ctx.print(tree);
        } catch (e) { ctx.print(`tree: ${e.message}`, 'error'); }
    },
    async _cmd_alias(ctx, args) {
        const KEY = 'OSKO:terminal:aliases';
        if (!args[0]) { try { const a = JSON.parse(localStorage.getItem(KEY) || '{}'); Object.entries(a).forEach(([k,v]) => ctx.print(`${k}='${v}'`)); } catch(e){} return; }
        if (args[0] === 'rm' && args[1]) { try { const a = JSON.parse(localStorage.getItem(KEY) || '{}'); delete a[args[1]]; localStorage.setItem(KEY, JSON.stringify(a)); ctx.print(`Alias '${args[1]}' removed`); } catch(e){ ctx.print(`alias rm: ${e.message}`, 'error'); } return; }
        if (args[0].includes('=')) { const [name, ...rest] = args.join(' ').split('='); const a = JSON.parse(localStorage.getItem(KEY) || '{}'); a[name.trim()] = rest.join('=').trim(); localStorage.setItem(KEY, JSON.stringify(a)); ctx.print(`Alias '${name.trim()}' set`); }
        else { try { const a = JSON.parse(localStorage.getItem(KEY) || '{}'); const v = a[args[0]]; ctx.print(v ? `${args[0]}='${v}'` : `alias: ${args[0]}: not found`); } catch(e){} }
    },
    async _cmd_grep(ctx, args) {
        if (args.length < 2) { ctx.print('Usage: grep <pattern> <file>'); return; }
        try {
            const file = args[1].startsWith('/') ? ctx.api.fs.join(args[1]) : ctx.api.fs.join(ctx.cwd, args[1]);
            const content = await ctx.api.fs.read(file);
            if (content === null) { ctx.print(`grep: ${args[1]}: not found`, 'error'); return; }
            const lines = content.split('\n').filter(l => l.toLowerCase().includes(args[0].toLowerCase()));
            if (lines.length) ctx.print(lines.join('\n')); else ctx.print('No matches found');
        } catch (e) { ctx.print(`grep: ${e.message}`, 'error'); }
    },
    async _cmd_history(ctx, args) { ctx.history.slice().reverse().forEach((cmd, i) => ctx.print(`${i + 1}: ${cmd}`)); },
    async _cmd_top(ctx, args) { ctx.executeTop(); },
    _cmds: {
        help: '_cmd_help', echo: '_cmd_echo', date: '_cmd_date', pwd: '_cmd_pwd',
        ls: '_cmd_ls', cd: '_cmd_cd', cat: '_cmd_cat', mkdir: '_cmd_mkdir',
        rm: '_cmd_rm', clear: '_cmd_clear', version: '_cmd_version', uptime: '_cmd_uptime',
        ps: '_cmd_ps', system: '_cmd_system', play: '_cmd_play', edit: '_cmd_edit',
        theme: '_cmd_theme', cp: '_cmd_cp', mv: '_cmd_mv', touch: '_cmd_touch',
        head: '_cmd_head', tail: '_cmd_tail', find: '_cmd_find', tree: '_cmd_tree',
        alias: '_cmd_alias', grep: '_cmd_grep', history: '_cmd_history', top: '_cmd_top'
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
