WebOS.registerApp({
    id: "about",
    get name() { return window.I18n.t('about.title'); },
    icon: "ℹ️",
    version: "4.5.2",
    manifest: {
        get name() { return window.I18n.t('about.title'); },
        icon: "ℹ️",
        permissions: ["notifications"]
    },
    width: "450px",
    height: "460px",
    mount(container, api) {
        this.container = container;
        this.api = api;
        const render = () => {
            container.innerHTML = `
                <div class="about-container reveal">
                    <div class="about-logo">🚀</div>
                    <h2 class="about-title">OS(KO)</h2>
                    <div class="about-desc">${window.I18n.t('about.desc')}</div>
                    <div class="about-details">
                        <div class="detail-row">
                            <span class="detail-label">${window.I18n.t('about.version')}:</span>
                            <span class="detail-value">${api.system.VERSION}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">${window.I18n.t('about.uptime')}:</span>
                            <span class="detail-value about-uptime">${api.system.getUptime()}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">${window.I18n.t('about.kernel')}:</span>
                            <span class="detail-value">V8 / OS(KO) Core</span>
                        </div>
                    </div>
                </div>
            `;
        };
        this.render = render;
        render();
        const updateUptime = () => {
            const uptimeEl = container.querySelector('.about-uptime');
            if (uptimeEl) uptimeEl.innerText = api.system.getUptime();
        };
        this._uptimeInterval = api.system.setInterval(updateUptime, 1000);
        this._i18nListener = () => render();
        window.addEventListener('i18n:changed', this._i18nListener);
    },
    unmount() {
        if (this._uptimeInterval) {
            this.api.system.clearInterval(this._uptimeInterval);
            this._uptimeInterval = null;
        }
        window.removeEventListener('i18n:changed', this._i18nListener);
        this.container = null;
        this.api = null;
    }
});
