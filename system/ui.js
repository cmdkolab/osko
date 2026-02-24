    window.ContextMenu = {
        _activeListener: null,
        _timeout: null,
        show(e, items) {
            if (e) {
                e.preventDefault();
                e.stopPropagation();
            }
            this.hide();
            const menu = document.createElement('div');
            menu.className = 'context-menu';
            items.forEach(item => {
                if (item.type === 'separator') {
                    const sep = document.createElement('div');
                    sep.className = 'context-menu-separator';
                    menu.appendChild(sep);
                    return;
                }
                const el = document.createElement('div');
                el.className = 'context-menu-item';
                el.innerText = item.label;
                el.onclick = (event) => {
                    event.stopPropagation();
                    item.action();
                    this.hide();
                };
                menu.appendChild(el);
            });
            document.body.appendChild(menu);
            menu.style.display = 'block';
            menu.classList.add('active');
            const rect = menu.getBoundingClientRect();
            const MathMax = Math.max;
            let menuWidth = rect.width || 180;
            let menuHeight = rect.height || (items.length * 36);
            let x = e ? e.clientX : 0;
            let y = e ? e.clientY : 0;
            if (x + menuWidth > window.innerWidth) x = MathMax(0, window.innerWidth - menuWidth - 10);
            if (y + menuHeight > window.innerHeight) y = MathMax(0, window.innerHeight - menuHeight - 10);
            menu.style.left = x + 'px';
            menu.style.top = y + 'px';
            this._activeListener = (evt) => {
                if (!menu.contains(evt.target)) this.hide();
            };
            if (this._timeout) clearTimeout(this._timeout);
            this._timeout = setTimeout(() => {
                document.addEventListener('mousedown', this._activeListener);
                document.addEventListener('contextmenu', this._activeListener);
                this._timeout = null;
            }, 10);
        },
        hide() {
            if (this._timeout) {
                clearTimeout(this._timeout);
                this._timeout = null;
            }
            if (this._activeListener) {
                document.removeEventListener('mousedown', this._activeListener);
                document.removeEventListener('contextmenu', this._activeListener);
                this._activeListener = null;
            }
            const existings = document.querySelectorAll('.context-menu');
            existings.forEach(existing => existing.remove());
        }
    };
