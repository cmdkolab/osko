let _toastCounter = 0;
window.Notifications = {
    show(options) {
        const id = 'toast_' + Date.now() + '_' + (++_toastCounter);
        const container = document.getElementById('notification-center');
        if (!container) return;
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.id = id;
        const titleEl = document.createElement('div');
        titleEl.className = 'toast-title';
        titleEl.innerText = options.title || 'System';
        const bodyEl = document.createElement('div');
        bodyEl.className = 'toast-body';
        bodyEl.innerText = options.message || '';
        toast.appendChild(titleEl);
        toast.appendChild(bodyEl);
        if (container.childElementCount >= 5) {
            const oldest = container.firstElementChild;
            if (oldest) oldest.remove();
        }
        container.appendChild(toast);
        setTimeout(() => {
            if (!toast.isConnected) return;
            toast.classList.add('fade-out');
            setTimeout(() => {
                if (toast.isConnected) toast.remove();
            }, 500);
        }, 3000);
    }
};
