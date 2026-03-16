    window.ContextMenu = {
        _activeListener: null,
        _keyListener: null,
        _timeout: null,
        _selectedIndex: -1,
        show(e, items) {
            if (e) {
                e.preventDefault();
                e.stopPropagation();
            }
            this.hide();
            const menu = document.createElement('div');
            menu.className = 'context-menu glass-panel active';
            items.forEach((item, index) => {
                if (item.type === 'separator') {
                    const sep = document.createElement('div');
                    sep.className = 'context-menu-separator';
                    menu.appendChild(sep);
                    return;
                }
                const el = document.createElement('div');
                el.className = 'context-menu-item';
                el.dataset.index = index;
                const icon = item.icon ? `<span class="menu-icon">${item.icon}</span>` : '<span class="menu-icon-placeholder"></span>';
                el.innerHTML = `${icon}<span class="menu-label">${item.label}</span>`;
                el.onclick = (event) => {
                    event.stopPropagation();
                    item.action();
                    this.hide();
                };
                el.onmouseenter = () => {
                    this._setSelectedIndex(menu, items, index);
                };
                menu.appendChild(el);
            });
            document.body.appendChild(menu);
            menu.style.display = 'block';
            const rect = menu.getBoundingClientRect();
            let x = e ? e.clientX : 0;
            let y = e ? e.clientY : 0;
            if (x + rect.width > window.innerWidth) x = Math.max(0, window.innerWidth - rect.width - 10);
            if (y + rect.height > window.innerHeight) y = Math.max(0, window.innerHeight - rect.height - 10);
            menu.style.left = x + 'px';
            menu.style.top = y + 'px';
            this._activeListener = (evt) => {
                if (!menu.contains(evt.target)) this.hide();
            };
            this._keyListener = (evt) => {
                if (evt.key === 'ArrowDown') {
                    evt.preventDefault();
                    this._setSelectedIndex(menu, items, this._nextSelectableIndex(items, this._selectedIndex, 1));
                } else if (evt.key === 'ArrowUp') {
                    evt.preventDefault();
                    this._setSelectedIndex(menu, items, this._nextSelectableIndex(items, this._selectedIndex, -1));
                } else if (evt.key === 'Enter') {
                    evt.preventDefault();
                    const selected = menu.querySelector('.context-menu-item.selected');
                    if (selected) selected.click();
                } else if (evt.key === 'Escape') {
                    evt.preventDefault();
                    this.hide();
                }
            };
            if (this._timeout) clearTimeout(this._timeout);
            this._timeout = setTimeout(() => {
                document.addEventListener('mousedown', this._activeListener);
                document.addEventListener('contextmenu', this._activeListener);
                document.addEventListener('keydown', this._keyListener);
                this._timeout = null;
            }, 10);
        },
        _nextSelectableIndex(items, current, direction) {
            const indices = items.map((_, i) => i).filter(i => items[i].type !== 'separator');
            if (indices.length === 0) return -1;
            if (current === -1) return direction === 1 ? indices[0] : indices[indices.length - 1];
            const pos = indices.indexOf(current);
            if (pos === -1) return direction === 1 ? indices[0] : indices[indices.length - 1];
            const nextPos = direction === 1 ? (pos + 1) % indices.length : (pos - 1 + indices.length) % indices.length;
            return indices[nextPos];
        },
        _setSelectedIndex(menu, items, index) {
            if (items[index] && items[index].type === 'separator') {
                return;
            }
            this._selectedIndex = index;
            menu.querySelectorAll('.context-menu-item').forEach(el => {
                el.classList.toggle('selected', parseInt(el.dataset.index) === index);
            });
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
            if (this._keyListener) {
                document.removeEventListener('keydown', this._keyListener);
                this._keyListener = null;
            }
            this._selectedIndex = -1;
            const existings = document.querySelectorAll('.context-menu');
            existings.forEach(existing => {
                existing.classList.remove('active');
                setTimeout(() => existing.remove(), 150);
            });
        }
    };
