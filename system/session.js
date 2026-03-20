    window.SessionManager = {
        async init() {
            const locked = await PersistenceManager.get('SYS:LOCKED');
            if (locked) this.lock();
        },
        lock() {
            if (state.isLocked) return;
            state.isLocked = true;
            PersistenceManager.set('SYS:LOCKED', true);
            const ls = document.getElementById('lock-screen');
            if (ls) {
                ls.classList.remove('hidden');
                this._lockKeydown = (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        this.unlock();
                    }
                };
                document.addEventListener('keydown', this._lockKeydown);
            }
            SysLog.log('INFO', 'System locked', 'SessionManager');
        },
        async unlock() {
            state.isLocked = false;
            await PersistenceManager.set('SYS:LOCKED', false);
            const ls = document.getElementById('lock-screen');
            if (ls) {
                ls.classList.add('hidden');
                AudioEngine.play('click');
            }
            if (this._lockKeydown) {
                document.removeEventListener('keydown', this._lockKeydown);
                this._lockKeydown = null;
            }
            SysLog.log('INFO', 'System unlocked', 'SessionManager');
            if (state.deferredRestoration) {
                WebOS.flushDeferredRestoration();
            } else {
                WebOS.restoreState();
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
            this.lock();
        }
    };
