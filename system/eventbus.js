    window.EventBus = {
        listeners: {},
        subscribe(event, callback) {
            if (!this.listeners[event]) this.listeners[event] = [];

            const secureId = window.crypto.getRandomValues(new Uint32Array(1))[0].toString(36) + Date.now().toString(36);
            const token = { id: secureId, cb: callback };
            this.listeners[event].push(token);
            return token;
        },
        unsubscribe(event, token) {
            if (!this.listeners[event]) return;
            this.listeners[event] = this.listeners[event].filter(t => t !== token && t.id !== token.id);
            if (this.listeners[event].length === 0) {
                delete this.listeners[event];
            }
        },
        publish(event, data) {
            if (this.listeners[event]) {
                [...this.listeners[event]].forEach(t => {
                    try {
                        t.cb(data);
                    } catch (e) {
                        console.error(`EventBus error [${event}]:`, e);
                    }
                });
            }
        }
    };
    window.events = {
        on: (evt, cb) => EventBus.subscribe(evt, cb),
        emit: (evt, data) => EventBus.publish(evt, data)
    };
