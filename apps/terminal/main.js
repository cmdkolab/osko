WebOS.registerApp({
    id: "terminal",
    name: "Terminal",
    icon: "🐚",
    version: "1.6.0",
    manifest: {
        name: "Terminal",
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
        this.print("OS(KO) Terminal v1.6.0");
        this.print("Wpisz 'help', aby uzyskać listę komend.");

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
                this.print("Dostępne komendy: ls, cd, cat, edit, mkdir, rm, clear, echo, date, pwd, help, version, play");
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
                    this.print(entries.map(e => e.type === 'dir' ? e.name + '/' : e.name).join('  '));
                } catch (e) { this.print(`Błąd: ${e.message}`, 'error'); }
                break;
            case 'cd':
                const newPath = this.api.fs.join(this.cwd, args[0] || '/home/user');
                if (await this.api.fs.exists(newPath)) {
                    this.cwd = newPath;
                    this.updatePrompt();
                } else {
                    this.print(`cd: ${args[0]}: Nie ma takiego folderu`, 'error');
                }
                break;
            case 'cat':
                if (!args[0]) { this.print("Użycie: cat <plik>"); break; }
                try {
                    const content = await this.api.fs.read(this.api.fs.join(this.cwd, args[0]));
                    this.print(content);
                } catch (e) { this.print(`cat: ${args[0]}: Błąd odczytu`, 'error'); }
                break;
            case 'mkdir':
                if (!args[0]) { this.print("Użycie: mkdir <folder>"); break; }
                try {
                    await this.api.fs.mkdir(this.api.fs.join(this.cwd, args[0]));
                } catch (e) { this.print(`mkdir: ${args[0]}: Błąd`, 'error'); }
                break;
            case 'rm':
                if (!args[0]) { this.print("Użycie: rm <plik/folder>"); break; }
                try {
                    await this.api.fs.remove(this.api.fs.join(this.cwd, args[0]));
                } catch (e) { this.print(`rm: ${args[0]}: Błąd`, 'error'); }
                break;
            case 'clear':
                this.output.innerHTML = '';
                break;
            case 'version':
                this.print(`OS(KO) Kernel v${this.api.system.VERSION}`);
                break;
            case 'play':
                if (!args[0]) { this.print("Dostępne dźwięki: startup, click, error, notify"); break; }
                this.api.audio.play(args[0]);
                break;
            case 'edit':
                if (!args[0]) { this.print("Użycie: edit <plik>"); break; }
                try {
                    const path = this.api.fs.join(this.cwd, args[0]);
                    let content = '';
                    if (await this.api.fs.exists(path)) {
                        content = await this.api.fs.read(path);
                    }
                    const newContent = prompt(`Edytuj: ${args[0]}`, content);
                    if (newContent !== null) {
                        await this.api.fs.write(path, newContent);
                        this.print(`Zapisano ${args[0]}`);
                    }
                } catch (e) { this.print(`edit: ${args[0]}: Błąd`, 'error'); }
                break;
            default:
                this.print(`Komenda nieodnaleziona: ${cmd}`, 'error');
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
