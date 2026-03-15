    window.SessionManager = {
        async init() {
            const locked = await PersistenceManager.get('SYS:LOCKED');
            if (locked) this.lock();
        },
        lock() {
            state.isLocked = true;
            PersistenceManager.set('SYS:LOCKED', true);
            document.body.classList.add('system-locked');
            this.showLockScreen();
            SysLog.log('INFO', 'System locked', 'SessionManager');
        },
        async unlock() {
            state.isLocked = false;
            await PersistenceManager.set('SYS:LOCKED', false);
            document.body.classList.remove('system-locked');
            const ls = document.getElementById('lock-screen');
            if (ls) ls.remove();
            if (this._lockKeydown) {
                document.removeEventListener('keydown', this._lockKeydown);
                this._lockKeydown = null;
            }
            SysLog.log('INFO', 'System unlocked', 'SessionManager');
            if (state.deferredRestoration) {
                WebOS.flushDeferredRestoration();
            }
        },
        async logout() {
            SysLog.log('INFO', 'User logout initiated', 'SessionManager');
            await WebOS.killAll();
            await VFS.saveImmediate();
            state.isLocked = true;
            document.body.classList.add('system-locked');
            location.reload();
        },
        isLocked() {
            return state.isLocked;
        },
        showLockScreen() {
            if (document.getElementById('lock-screen')) return;
            const ls = document.createElement('div');
            ls.id = 'lock-screen';
            ls.innerHTML = `
                <div class="lock-panel">
                    <div class="lock-avatar">👤</div>
                    <div class="lock-user">OS(KO)</div>
                    <button class="lock-btn">${window.I18n.t('system.unlock')}</button>
                </div>
            `;
            document.body.appendChild(ls);
            const btn = ls.querySelector('.lock-btn');
            btn.onclick = () => {
                this.unlock();
            };
            this._lockKeydown = (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.unlock();
                }
            };
            document.addEventListener('keydown', this._lockKeydown);
        }
    };
