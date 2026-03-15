    window.WindowManager = {
        CONST: {
            CASCADE_STEP: 22,
            SNAP_EDGE: 30,
            SNAP_CORNER: 60,
            MIN_WIDTH: 320,
            MIN_HEIGHT: 200,
            TASKBAR_HEIGHT: 40
        },
        create(options, appId) {
            const secureId = window.crypto.getRandomValues(new Uint32Array(1))[0].toString(36);
            const id = `win_${secureId}`;
            const winEl = document.createElement('div');
            winEl.className = 'window';
            winEl.id = id;
            winEl.style.width = options.width || '400px';
            winEl.style.height = options.height || '300px';
            const cascadeOffset = (state.windows.length * this.CONST.CASCADE_STEP) % (window.innerHeight / 3);
            let baseX = parseInt(options.x !== undefined ? options.x : (100 + cascadeOffset));
            let baseY = parseInt(options.y !== undefined ? options.y : (80 + cascadeOffset));
            const maxW = window.innerWidth - 60;
            const maxH = window.innerHeight - this.CONST.TASKBAR_HEIGHT - 60;
            if (baseX > maxW || baseX < 0) baseX = 20;
            if (baseY > maxH || baseY < 0) baseY = 20;
            winEl.style.left = baseX + 'px';
            winEl.style.top = baseY + 'px';
            winEl.innerHTML = `
                <div class="window-header">
                    <div class="window-title"></div>
                    <div class="window-controls">
                        <button class="control-btn minimize" title="${window.I18n.t('system.minimize') || '−'}">−</button>
                        <button class="control-btn maximize" title="${window.I18n.t('system.maximize') || '□'}">□</button>
                        <button class="control-btn close" title="${window.I18n.t('system.close') || '×'}">×</button>
                    </div>
                </div>
                <div class="window-content"></div>
                <div class="window-resizer"></div>
            `;
            winEl.querySelector('.window-title').textContent = `${options.icon || ''} ${options.title || 'App'}`;
            document.getElementById('window-layer').appendChild(winEl);
            const win = { id, element: winEl, appId, state: 'normal' };
            state.windows.push(win);
            this.makeDraggable(winEl);
            this.makeResizable(winEl);
            this.setupFocus(winEl);
            this.focus(id);
            winEl.querySelector('.close').onclick = (e) => { e.stopPropagation(); WebOS.killApp(appId); };
            winEl.querySelector('.minimize').onclick = (e) => { e.stopPropagation(); this.minimize(id); };
            winEl.querySelector('.maximize').onclick = (e) => { e.stopPropagation(); this.toggleMaximize(id); };
            return {
                id,
                container: winEl.querySelector('.window-content'),
                close: () => this.destroy(id)
            };
        },
        _focusNext(currentId) {
            if (state.focusedWindow === currentId) {
                state.focusedWindow = null;
                if (state.windowStack) {
                    const nextWinId = [...state.windowStack].reverse().find(
                        wid => wid !== currentId && state.windows.find(w => w.id === wid && w.state !== 'minimized' && !w.element.classList.contains('window-closing'))
                    );
                    if (nextWinId) this.focus(nextWinId);
                }
            }
        },
        minimize(id) {
            const win = state.windows.find(w => w.id === id);
            if (win) {
                win.element.style.display = 'none';
                win.state = 'minimized';
                this._focusNext(id);
                WebOS.updateTaskbar();
            }
        },
        toggleMaximize(id) {
            const win = state.windows.find(w => w.id === id);
            if (!win) return;
            if (win.state === 'maximized') {
                win.element.style.width = win.oldWidth || '400px';
                win.element.style.height = win.oldHeight || '300px';
                win.element.style.top = win.oldTop || '100px';
                win.element.style.left = win.oldLeft || '100px';
                win.element.classList.remove('window-snapped');
                win.state = 'normal';
            } else {
                if (!win.element.classList.contains('window-snapped')) {
                    win.oldWidth = win.element.style.width;
                    win.oldHeight = win.element.style.height;
                    win.oldTop = win.element.style.top;
                    win.oldLeft = win.element.style.left;
                }
                win.element.style.width = '100%';
                win.element.style.height = `calc(100% - ${this.CONST.TASKBAR_HEIGHT}px)`;
                win.element.style.top = '0';
                win.element.style.left = '0';
                win.state = 'maximized';
                win.element.classList.remove('window-snapped');
            }
            WebOS.saveState();
        },
        destroy(id) {
            const win = state.windows.find(w => w.id === id);
            if (!win || win._destroying) return;
            win._destroying = true;
            win.element.classList.add('window-closing');
            if (state.windowStack) {
                state.windowStack = state.windowStack.filter(winId => winId !== id);
            }
            this._focusNext(id);
            setTimeout(() => {
                win.element.remove();
                const currentIndex = state.windows.findIndex(w => w.id === id);
                if (currentIndex > -1) state.windows.splice(currentIndex, 1);
                events.emit('window:closed', id);
            }, 200);
        },
        focus(id) {
            const win = state.windows.find(w => w.id === id);
            if (!win || state.focusedWindow === id) return;
            SysLog.log('DEBUG', `Focus Window: ${id}`, 'WindowManager');
            if (state.focusedWindow) {
                const prevFocus = state.windows.find(w => w.id === state.focusedWindow);
                if (prevFocus) prevFocus.element.classList.remove('focused');
            }
            win.element.classList.add('focused');
            if (win.state === 'minimized') {
                win.element.style.display = 'flex';
                win.state = 'normal';
            }
            state.focusedWindow = id;
            const proc = state.processes.find(p => p.windowId === id);
            if (proc && proc.appDef.onFocus) {
                try { proc.appDef.onFocus(); } catch (e) {
                    SysLog.log('ERR', `onFocus error in ${proc.appDef.name}: ${e.message}`);
                }
            }
            if (proc) {
                EventBus.publish('window:focus', { appId: proc.appId, windowId: id });
            }
            if (!state.windowStack) state.windowStack = [];
            state.windowStack = state.windowStack.filter(winId => winId !== id);
            state.windowStack.push(id);
            const baseZ = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--z-window')) || 10;
            state.windowStack.forEach((winId, index) => {
                const w = state.windows.find(win => win.id === winId);
                if (w) {
                    w.element.style.zIndex = baseZ + (index * 2);
                }
            });
            WebOS.updateTaskbar();
        },
        createSnapPreview() {
            let preview = document.getElementById('snap-preview');
            if (!preview) {
                preview = document.createElement('div');
                preview.id = 'snap-preview';
                document.body.appendChild(preview);
            }
            return preview;
        },
        setupFocus(el) {
            el.onmousedown = () => this.focus(el.id);
        },
        makeDraggable(el) {
            const header = el.querySelector('.window-header');
            let dragging = false;
            let currentX, currentY, initialX, initialY;
            let snapPreview = null;
            let winObj = null;
            header.onmousedown = (e) => {
                if (e.button !== 0) return;
                dragging = true;
                initialX = e.clientX;
                initialY = e.clientY;
                winObj = state.windows.find(w => w.element === el);
                if (!snapPreview) snapPreview = WindowManager.createSnapPreview();
                let animationQueued = false;
                const onMouseMove = (moveEvent) => {
                    if (!dragging) return;
                    currentX = moveEvent.clientX;
                    currentY = moveEvent.clientY;
                    if (!animationQueued) {
                        animationQueued = true;
                        requestAnimationFrame(() => {
                            animationQueued = false;
                            if (winObj && (winObj.state === 'maximized' || el.classList.contains('window-snapped'))) {
                                const ratio = (currentX - el.offsetLeft) / el.offsetWidth;
                                if (winObj.state === 'maximized') {
                                    this.toggleMaximize(winObj.id);
                                } else {
                                    el.classList.remove('window-snapped');
                                    if (winObj.oldWidth) el.style.width = winObj.oldWidth;
                                    if (winObj.oldHeight) el.style.height = winObj.oldHeight;
                                }
                                const newWidth = el.offsetWidth;
                                initialX = currentX;
                                el.style.left = (currentX - (newWidth * ratio)) + 'px';
                            }
                            updatePosition();
                        });
                    }
                };
                const onMouseUp = () => {
                    if (dragging) {
                        dragging = false;
                        closeDragElement();
                    }
                    document.removeEventListener('mousemove', onMouseMove);
                    document.removeEventListener('mouseup', onMouseUp);
                };
                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);
            };
            const updatePosition = () => {
                if (!dragging) return;
                const dx = initialX - currentX;
                const dy = initialY - currentY;
                initialX = currentX;
                initialY = currentY;
                const top = Math.max(0, Math.min(state.viewport.h - this.CONST.TASKBAR_HEIGHT - 40, el.offsetTop - dy));
                const left = Math.max(-el.offsetWidth + 80, Math.min(state.viewport.w - 80, el.offsetLeft - dx));
                el.style.top = top + "px";
                el.style.left = left + "px";
                const edge = this.CONST.SNAP_EDGE;
                const corner = this.CONST.SNAP_CORNER;
                const vh = state.viewport.h;
                const vw = state.viewport.w;
                const th = this.CONST.TASKBAR_HEIGHT;
                snapPreview.style.display = 'block';
                if (currentY < corner && currentX < corner) {
                    snapPreview.dataset.snap = 'top-left';
                    Object.assign(snapPreview.style, { top: '0', left: '0', width: '50%', height: '50vh' });
                } else if (currentY < corner && currentX > vw - corner) {
                    snapPreview.dataset.snap = 'top-right';
                    Object.assign(snapPreview.style, { top: '0', left: '50%', width: '50%', height: '50vh' });
                } else if (currentY > vh - corner - th && currentX < corner) {
                    snapPreview.dataset.snap = 'bottom-left';
                    Object.assign(snapPreview.style, { top: '50vh', left: '0', width: '50%', height: `calc(50vh - ${th}px)` });
                } else if (currentY > vh - corner - th && currentX > vw - corner) {
                    snapPreview.dataset.snap = 'bottom-right';
                    Object.assign(snapPreview.style, { top: '50vh', left: '50%', width: '50%', height: `calc(50vh - ${th}px)` });
                } else if (currentY < edge) {
                    snapPreview.dataset.snap = 'top';
                    Object.assign(snapPreview.style, { top: '0', left: '0', width: '100%', height: '50vh' });
                } else if (currentY > vh - edge - th) {
                    snapPreview.dataset.snap = 'bottom';
                    Object.assign(snapPreview.style, { top: '50vh', left: '0', width: '100%', height: `calc(50vh - ${th}px)` });
                } else if (currentX < edge) {
                    snapPreview.dataset.snap = 'left';
                    Object.assign(snapPreview.style, { top: '0', left: '0', width: '50%', height: `calc(100% - ${th}px)` });
                } else if (currentX > vw - edge) {
                    snapPreview.dataset.snap = 'right';
                    Object.assign(snapPreview.style, { top: '0', left: '50%', width: '50%', height: `calc(100% - ${th}px)` });
                } else {
                    snapPreview.classList.remove('visible');
                    setTimeout(() => { if (!snapPreview.classList.contains('visible')) snapPreview.style.display = 'none'; }, 200);
                    return;
                }
                snapPreview.style.display = 'block';
                requestAnimationFrame(() => snapPreview.classList.add('visible'));
            };
            const closeDragElement = () => {
                const preview = document.getElementById('snap-preview');
                if (preview && preview.classList.contains('visible')) {
                    const snap = preview.dataset.snap;
                    const win = state.windows.find(w => w.element === el);
                    const th = this.CONST.TASKBAR_HEIGHT;
                    if (win && win.state !== 'maximized' && !el.classList.contains('window-snapped')) {
                        win.oldWidth = el.style.width;
                        win.oldHeight = el.style.height;
                        win.oldTop = el.style.top;
                        win.oldLeft = el.style.left;
                    }
                    el.classList.add('window-snapping', 'window-snapped');
                    SysLog.log('DEBUG', `Window Snapped: ${snap}`, 'WindowManager', { winId: win?.id, snap });
                    if (snap === 'left' || snap === 'right') {
                        Object.assign(el.style, { top: '0', height: `calc(100vh - ${th}px)`, width: '50%', left: snap === 'left' ? '0' : '50%' });
                    } else if (snap === 'top') {
                        Object.assign(el.style, { top: '0', left: '0', height: '50vh', width: '100%' });
                    } else if (snap === 'bottom') {
                        Object.assign(el.style, { left: '0', width: '100%', height: `calc(50vh - ${th}px)`, top: '50vh' });
                    } else if (snap === 'top-left') {
                        Object.assign(el.style, { top: '0', left: '0', width: '50%', height: '50vh' });
                    } else if (snap === 'top-right') {
                        Object.assign(el.style, { top: '0', left: '50%', width: '50%', height: '50vh' });
                    } else if (snap === 'bottom-left') {
                        Object.assign(el.style, { top: '50vh', left: '0', width: '50%', height: `calc(50vh - ${th}px)` });
                    } else if (snap === 'bottom-right') {
                        Object.assign(el.style, { top: '50vh', left: '50%', width: '50%', height: `calc(50vh - ${th}px)` });
                    }
                    preview.style.display = 'none';
                    setTimeout(() => el.classList.remove('window-snapping'), 300);
                } else if (preview) {
                    preview.style.display = 'none';
                    el.classList.remove('window-snapped');
                }
                WebOS.saveState();
            };
        },
        makeResizable(el) {
            const resizer = el.querySelector('.window-resizer');
            if (!resizer) return;
            let isResizing = false;
            let startWidth, startHeight, startX, startY;
            let winObj = null;
            resizer.addEventListener('mousedown', (e) => {
                winObj = state.windows.find(w => w.element === el);
                if (winObj && winObj.state === 'maximized') return;
                isResizing = true;
                this.focus(winObj ? winObj.id : el.id);
                startWidth = el.offsetWidth;
                startHeight = el.offsetHeight;
                startX = e.clientX;
                startY = e.clientY;
                e.stopPropagation();
                e.preventDefault();
                let rAFQueued = false;
                const onMouseMove = (moveEvent) => {
                    if (!isResizing) return;
                    const dX = moveEvent.clientX - startX;
                    const dY = moveEvent.clientY - startY;
                    if (!rAFQueued) {
                        rAFQueued = true;
                        requestAnimationFrame(() => {
                            rAFQueued = false;
                            const newWidth = Math.max(this.CONST.MIN_WIDTH, startWidth + dX);
                            const newHeight = Math.max(this.CONST.MIN_HEIGHT, startHeight + dY);
                            el.style.width = newWidth + 'px';
                            el.style.height = newHeight + 'px';
                            if (el.classList.contains('window-snapped')) {
                                el.classList.remove('window-snapped');
                                if (winObj) {
                                    winObj.oldWidth = null;
                                    winObj.oldHeight = null;
                                }
                            }
                        });
                    }
                };
                const onMouseUp = () => {
                    isResizing = false;
                    document.removeEventListener('mousemove', onMouseMove);
                    document.removeEventListener('mouseup', onMouseUp);
                    WebOS.saveState();
                };
                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);
            });
        }
    };
