    window.AudioEngine = {
        ctx: null,
        enabled: true,
        async init() {
            try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { }
            try {
                const audioSet = await VFS.read('/home/user/settings/audio.json', 'system');
                if (audioSet) {
                    const parsed = JSON.parse(audioSet);
                    this.enabled = !!parsed.enabled;
                }
            } catch (e) {
                SysLog.log('WARN', 'Failed to parse audio.json, defaulting to enabled.', 'AudioEngine');
                this.enabled = true;
            }

            EventBus.subscribe('app:settings:audio_changed', (msg) => {
                if (msg && msg.data !== undefined) {
                    this.enabled = !!msg.data.enabled;
                }
            });
        },
        async play(type) {
            if (!this.enabled || !this.ctx) return;
            if (this.ctx.state === 'suspended') {
                try { await this.ctx.resume(); } catch (e) { return; }
            }

            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.connect(gain);
            gain.connect(this.ctx.destination);

            const now = this.ctx.currentTime;

            if (type === 'startup') {
                osc.type = 'sine';
                osc.frequency.setValueAtTime(440, now);
                osc.frequency.exponentialRampToValueAtTime(880, now + 0.5);
                osc.start(now);
                osc.stop(now + 0.5);
                osc.onended = () => { osc.disconnect(); gain.disconnect(); };
            } else if (type === 'click') {
                osc.type = 'sine';
                osc.frequency.setValueAtTime(600, now);
                gain.gain.setValueAtTime(0.05, now);
                osc.start(now);
                osc.stop(now + 0.05);
                osc.onended = () => { osc.disconnect(); gain.disconnect(); };
            } else if (type === 'error') {
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(200, now);
                osc.frequency.linearRampToValueAtTime(100, now + 0.3);
                gain.gain.setValueAtTime(0.1, now);
                osc.start(now);
                osc.stop(now + 0.3);
                osc.onended = () => { osc.disconnect(); gain.disconnect(); };
            } else if (type === 'notify') {
                osc.type = 'sine';
                osc.frequency.setValueAtTime(880, now);
                osc.frequency.setValueAtTime(1100, now + 0.1);
                gain.gain.setValueAtTime(0.05, now);
                gain.gain.linearRampToValueAtTime(0, now + 0.3);
                osc.start(now);
                osc.stop(now + 0.3);
                osc.onended = () => { osc.disconnect(); gain.disconnect(); };
            }
        }
    };
