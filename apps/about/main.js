WebOS.registerApp({
    id: "about",
    get name() { return window.I18n.t('about.title'); },
    icon: "ℹ️",
    manifest: {
        get name() { return window.I18n.t('about.title'); },
        icon: "ℹ️",
        permissions: ["notifications"]
    },
    version: "1.0.1",
    width: "450px",
    height: "350px",
    mount(container, api) {
        this.container = container;
        this.api = api;
        container.innerHTML = `
            <div class="about-container">
                <div class="about-logo">🚀</div>
                <h2 class="about-title">OS(KO)</h2>
                <div class="about-desc">${window.I18n.t('about.desc')}</div>
                <div class="about-details">
                    <div>${window.I18n.t('about.version')}: ${api.system.VERSION}</div>
                    <div>${window.I18n.t('about.uptime')}: <span class="about-uptime">${api.system.getUptime()}</span></div>
                </div>
            </div>
        `;
        const uptimeEl = container.querySelector('.about-uptime');
        const updateUptime = () => {
            if (uptimeEl) uptimeEl.innerText = api.system.getUptime();
        };
        this._uptimeInterval = api.system.setInterval(updateUptime, 1000);
    },
    unmount() {
        if (this._uptimeInterval) {
            this.api.system.clearInterval(this._uptimeInterval);
            this._uptimeInterval = null;
        }
        this.container = null;
        this.api = null;
    }
});
