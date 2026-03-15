    window.EventBus = {
        listeners: {},
        subscribe(event, callback) {
            if (!this.listeners[event]) this.listeners[event] = [];
            const secureId = window.crypto.getRandomValues(new Uint32Array(1))[0].toString(36) + Date.now().toString(36);
            const token = { id: secureId, cb: callback };
            this.listeners[event].push(token);
            return token;
        },
        once(event, callback) {
            const token = this.subscribe(event, (data) => {
                this.unsubscribe(event, token);
                callback(data);
            });
            return token;
        },
        unsubscribe(event, tokenOrId) {
            if (!this.listeners[event]) return;
            const id = typeof tokenOrId === 'string' ? tokenOrId : tokenOrId.id;
            this.listeners[event] = this.listeners[event].filter(t => t.id !== id);
            if (this.listeners[event].length === 0) {
                delete this.listeners[event];
            }
        },
        clear(event) {
            delete this.listeners[event];
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
        },
        publishAsync(event, data) {
            setTimeout(() => this.publish(event, data), 0);
        }
    };
    window.events = {
        on: (evt, cb) => EventBus.subscribe(evt, cb),
        once: (evt, cb) => EventBus.once(evt, cb),
        off: (evt, token) => EventBus.unsubscribe(evt, token),
        emit: (evt, data) => EventBus.publish(evt, data),
        emitAsync: (evt, data) => EventBus.publishAsync(evt, data)
    };
