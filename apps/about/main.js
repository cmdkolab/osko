WebOS.registerApp({
    id: "about",
    name: "About",
    icon: "ℹ️",
    manifest: {
        name: "About",
        icon: "ℹ️",
        permissions: ["notifications"]
    },
    version: "1.0.0",
    width: "450px",
    height: "350px",
    mount(container, api) {
        this.container = container;
        this.api = api;
        container.innerHTML = `
            <div class="about-container">
                <div class="about-logo">🚀</div>
                <h2 class="about-title">OS(KO)</h2>
                <div class="about-desc">Zaawansowany system operacyjny w przeglądarce.</div>
                <div class="about-details">
                    <div>Wersja: ${api.system.VERSION}</div>
                    <div>Uptime: <span class="about-uptime">${api.system.getUptime()}</span></div>
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
