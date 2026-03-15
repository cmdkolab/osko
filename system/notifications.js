let _toastCounter = 0;
window.Notifications = {
    show(options) {
        const id = 'toast_' + Date.now() + '_' + (++_toastCounter);
        const container = document.getElementById('notification-center');
        if (!container) return;
        const type = options.type || 'info';
        const time = options.time || 3000;
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.id = id;
        toast.setAttribute('role', type === 'error' || type === 'warning' ? 'alert' : 'status');
        toast.setAttribute('aria-live', 'polite');
        let iconHtml = '';
        if (options.icon) {
            iconHtml = `<div class="toast-icon">${options.icon}</div>`;
        } else {
            const defaultIcons = {
                info: 'ℹ️',
                success: '✅',
                warning: '⚠️',
                error: '❌'
            };
            iconHtml = `<div class="toast-icon">${defaultIcons[type]}</div>`;
        }
        const content = document.createElement('div');
        content.className = 'toast-content';
        const titleEl = document.createElement('div');
        titleEl.className = 'toast-title';
        titleEl.innerText = options.title || 'System';
        const bodyEl = document.createElement('div');
        bodyEl.className = 'toast-body';
        bodyEl.innerText = options.message || '';
        content.appendChild(titleEl);
        content.appendChild(bodyEl);
        toast.innerHTML = iconHtml;
        toast.appendChild(content);
        if (options.action && options.action.callback) {
            const actionBtn = document.createElement('button');
            actionBtn.className = 'toast-action';
            actionBtn.innerText = options.action.label || 'OK';
            actionBtn.onclick = (e) => {
                e.stopPropagation();
                options.action.callback();
                this.close(id);
            };
            toast.appendChild(actionBtn);
        }
        if (container.childElementCount >= 5) {
            const oldest = container.firstElementChild;
            if (oldest) this.close(oldest.id);
        }
        container.appendChild(toast);
        if (time > 0) {
            setTimeout(() => {
                this.close(id);
            }, time);
        }
    },
    close(id) {
        const toast = document.getElementById(id);
        if (toast && !toast.classList.contains('fade-out')) {
            toast.classList.add('fade-out');
            setTimeout(() => {
                if (toast.isConnected) toast.remove();
            }, 500);
        }
    },
    clearAll() {
        const container = document.getElementById('notification-center');
        if (!container) return;
        const toasts = Array.from(container.children);
        toasts.forEach(t => this.close(t.id));
    }
};
