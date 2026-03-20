WebOS.registerApp({
    id: "calculator",
    get name() { return window.I18n.t('calculator.title'); },
    icon: "🧮",
    manifest: {
        get name() { return window.I18n.t('calculator.title'); },
        icon: "🧮",
        permissions: []
    },
    version: "4.1.14",
    width: "320px",
    height: "480px",
    async mount(container, api) {
        this.container = container;
        this.api = api;
        this.current = '0';
        this.history = '';
        this.shouldReset = false;
        this.openParens = 0;
        const render = () => {
            container.innerHTML = `
                <div class="calc-app" tabindex="0">
                    <div class="calc-display">
                        <div class="calc-history">${this.history}</div>
                        <div class="calc-current">${this.current}</div>
                    </div>
                    <div class="calc-grid">
                        <button class="calc-btn clear" data-val="C">C</button>
                        <button class="calc-btn op" data-val="(">(</button>
                        <button class="calc-btn op" data-val=")">)</button>
                        <button class="calc-btn op" data-val="/">÷</button>
                        <button class="calc-btn num" data-val="7">7</button>
                        <button class="calc-btn num" data-val="8">8</button>
                        <button class="calc-btn num" data-val="9">9</button>
                        <button class="calc-btn op" data-val="*">×</button>
                        <button class="calc-btn num" data-val="4">4</button>
                        <button class="calc-btn num" data-val="5">5</button>
                        <button class="calc-btn num" data-val="6">6</button>
                        <button class="calc-btn op" data-val="-">−</button>
                        <button class="calc-btn num" data-val="1">1</button>
                        <button class="calc-btn num" data-val="2">2</button>
                        <button class="calc-btn num" data-val="3">3</button>
                        <button class="calc-btn op" data-val="+">+</button>
                        <button class="calc-btn num" data-val="0">0</button>
                        <button class="calc-btn num" data-val=".">.</button>
                        <button class="calc-btn op" data-val="%">%</button>
                        <button class="calc-btn eq" data-val="=">=</button>
                    </div>
                </div>
            `;
            this.setupEvents(container);
        };
        this.render = render;
        render();
        this._i18nListener = () => render();
        window.addEventListener('i18n:changed', this._i18nListener);
        setTimeout(() => container.querySelector('.calc-app')?.focus(), 100);
    },
    setupEvents(container) {
        const currentEl = container.querySelector('.calc-current');
        const historyEl = container.querySelector('.calc-history');
        const updateDisplay = () => {
            currentEl.innerText = this.current;
            historyEl.innerText = this.history;
        };
        const safeEval = (expr) => {
            const tokens = expr.match(/(?:\d+\.\d+|\d+|\+|\-|\*|\/|%|\(|\))/g) || [];
            const output = [], ops = [];
            const prec = { '+': 1, '-': 1, '*': 2, '/': 2, '%': 2 };
            for (let t of tokens) {
                if (!isNaN(t)) output.push(parseFloat(t));
                else if (t === '(') ops.push(t);
                else if (t === ')') {
                    while (ops.length && ops[ops.length - 1] !== '(') output.push(ops.pop());
                    ops.pop();
                } else {
                    while (ops.length && prec[ops[ops.length - 1]] >= prec[t]) output.push(ops.pop());
                    ops.push(t);
                }
            }
            while (ops.length) output.push(ops.pop());
            const stack = [];
            for (let t of output) {
                if (!isNaN(t)) stack.push(t);
                else {
                    const b = stack.pop(), a = stack.pop();
                    if (a === undefined || b === undefined) throw new Error('Stack Error');
                    stack.push(t === '+' ? a + b : t === '-' ? a - b : t === '*' ? a * b : t === '%' ? a % b : a / b);
                }
            }
            return stack[0];
        };
        const calculate = () => {
            try {
                let expr = this.current.replace(/×/g, '*').replace(/−/g, '-');
                let count = this.openParens;
                while (count > 0) { expr += ')'; count--; }
                expr = expr.replace(/(^|\()\-(\d+\.\d+|\d+)/g, '$1(0-$2)');
                const result = safeEval(expr);
                if (!isFinite(result) || isNaN(result)) throw new Error('Math Error');
                const resultStr = String(Number(result.toFixed(8)));
                this.history = this.current + window.I18n.t('calculator.result_eq');
                this.current = resultStr;
                this.shouldReset = true;
                this.openParens = 0;
            } catch (e) {
                this.current = window.I18n.t('calculator.error');
                this.history = '';
                this.shouldReset = true;
            }
            updateDisplay();
        };
        container.querySelectorAll('.calc-btn').forEach(btn => {
            btn.onclick = () => {
                const val = btn.dataset.val;
                if (this.current === window.I18n.t('calculator.error')) { this.current = '0'; this.shouldReset = false; }
                if (val === 'C') {
                    this.current = '0'; this.history = ''; this.openParens = 0;
                } else if (val === '=') {
                    calculate();
                } else if (val === '(') {
                    if (this.current === '0' || this.shouldReset) { this.current = '('; this.openParens = 1; this.shouldReset = false; }
                    else if (['+', '-', '*', '/'].includes(this.current.slice(-1))) { this.current += '('; this.openParens++; }
                    else { this.current += '×('; this.openParens++; }
                } else if (val === ')') {
                    if (this.openParens > 0) { this.current += ')'; this.openParens--; }
                } else if (['+', '-', '*', '/'].includes(val)) {
                    if (this.shouldReset) this.shouldReset = false;
                    const last = this.current.slice(-1);
                    if (['+', '-', '*', '/'].includes(last)) this.current = this.current.slice(0, -1) + val;
                    else this.current += val;
                } else if (val === '%') {
                    this.current = String(parseFloat(this.current) / 100);
                } else {
                    if (this.shouldReset) { this.current = val; this.shouldReset = false; }
                    else if (this.current === '0') this.current = val;
                    else this.current += val;
                }
                updateDisplay();
                container.querySelector('.calc-app')?.focus();
            };
        });
        const keyMap = {
            '0': '0', '1': '1', '2': '2', '3': '3', '4': '4',
            '5': '5', '6': '6', '7': '7', '8': '8', '9': '9',
            '.': '.', ',': '.', '+': '+', '-': '-', '*': '*', '/': '/',
            '%': '%', '(': '()', ')': '()', 'Enter': '=', '=': '=',
            'Escape': 'C', 'Backspace': 'Backspace'
        };
        const appEl = container.querySelector('.calc-app');
        if (appEl) {
            appEl.onkeydown = (e) => {
                if (e.key === 'Backspace') {
                    e.preventDefault();
                    if (this.current.length > 1) this.current = this.current.slice(0, -1);
                    else this.current = '0';
                    updateDisplay();
                    return;
                }
                if (keyMap[e.key]) {
                    e.preventDefault();
                    const v = keyMap[e.key];
                    const btn = container.querySelector(`.calc-btn[data-val="${v}"]`);
                    if (btn) {
                        btn.classList.add('active');
                        setTimeout(() => btn.classList.remove('active'), 100);
                        btn.click();
                    }
                }
            };
        }
    },
    unmount() {
        window.removeEventListener('i18n:changed', this._i18nListener);
    }
});
