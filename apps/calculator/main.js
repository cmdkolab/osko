WebOS.registerApp({
    id: "calculator",
    get name() { return window.I18n.t('calculator.title'); },
    icon: "🧮",
    manifest: {
        get name() { return window.I18n.t('calculator.title'); },
        icon: "🧮",
        permissions: []
    },
    version: "2.3.1",
    width: "320px",
    height: "460px",
    mount(container, api) {
        this.container = container;
        this.api = api;
        container.innerHTML = `
            <div class="calc-app">
                <div class="calc-display">
                    <div class="calc-history"></div>
                    <div class="calc-current">0</div>
                </div>
                <div class="calc-grid">
                    <button class="calc-btn clear" data-val="C">C</button>
                    <button class="calc-btn op" data-val="()">()</button>
                    <button class="calc-btn op" data-val="%">%</button>
                    <button class="calc-btn op" data-val="/">/</button>

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

                    <button class="calc-btn num" data-val="0" style="grid-column: span 2">0</button>
                    <button class="calc-btn num" data-val=".">.</button>
                    <button class="calc-btn eq" data-val="=">=</button>
                </div>
            </div>
        `;
        const historyEl = container.querySelector('.calc-history');
        const currentEl = container.querySelector('.calc-current');
        let current = '0', history = '', shouldReset = false;
        let openParens = 0;

        const updateDisplay = () => {
            currentEl.innerText = current;
            historyEl.innerText = history;
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
                let expr = current.replace(/×/g, '*').replace(/−/g, '-');
                while (openParens > 0) {
                    expr += ')';
                    openParens--;
                }
                expr = expr.replace(/(^|\()\-(\d+\.\d+|\d+)/g, '$1(0-$2)');
                const result = safeEval(expr);
                if (!isFinite(result) || isNaN(result)) throw new Error('Math Error');
                history = current + ' =';
                current = String(Math.round(result * 100000000) / 100000000);
            } catch (e) {
                current = 'Error';
                history = '';
            }
            shouldReset = true;
            openParens = 0;
            updateDisplay();
        };

        container.querySelectorAll('.calc-btn').forEach(btn => {
            btn.setAttribute('tabindex', '-1'); // Prevent tab focus
            btn.onclick = (e) => {
                // Return focus to the container if user clicked with mouse
                // to maintain keyboard listener
                container.focus();

                const val = btn.dataset.val;
                if (current === 'Error') { current = '0'; shouldReset = false; }
                if (val === 'C') {
                    current = '0'; history = ''; openParens = 0;
                } else if (val === '=') {
                    calculate();
                } else if (val === '()') {
                    if (current === '0' || shouldReset) { current = '('; openParens++; shouldReset = false; }
                    else if (['+', '-', '*', '/'].includes(current.slice(-1))) { current += '('; openParens++; }
                    else if (openParens > 0) { current += ')'; openParens--; }
                    else { current += '*('; openParens++; }
                } else if (['+', '-', '*', '/'].includes(val)) {
                    if (shouldReset) shouldReset = false;
                    const last = current.slice(-1);
                    if (['+', '-', '*', '/'].includes(last)) current = current.slice(0, -1) + val;
                    else current += val;
                } else {
                    if (shouldReset) { current = val; shouldReset = false; }
                    else if (current === '0') current = val;
                    else current += val;
                }
                updateDisplay();
            };
        });

        const keyMap = {
            '0': '0', '1': '1', '2': '2', '3': '3', '4': '4',
            '5': '5', '6': '6', '7': '7', '8': '8', '9': '9',
            '.': '.', ',': '.',
            '+': '+', '-': '-', '*': '*', '/': '/', '%': '%',
            '(': '()', ')': '()',
            'Enter': '=', '=': '=',
            'Escape': 'C', 'Backspace': 'C', 'Delete': 'C'
        };

        // Attach global keydown to the container so that focus within app works
        container.tabIndex = 0; // make focusable
        container.style.outline = 'none'; // hide focus ring
        container.onkeydown = (e) => {
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
        // Auto-focus on mount
        setTimeout(() => container.focus(), 100);
    },
    unmount() {
        this.container = null;
        this.api = null;
    }
});
