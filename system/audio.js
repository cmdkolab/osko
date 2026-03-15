    window.AudioEngine = {
        ctx: null,
        enabled: true,
        async init() {
            try { 
                this.ctx = new (window.AudioContext || window.webkitAudioContext)(); 
            } catch (e) { 
                SysLog.log('ERR', 'Web Audio API not supported', 'AudioEngine');
            }
            try {
                const audioSet = await VFS.read('/home/user/settings/audio.json', 'system');
                if (audioSet) {
                    const parsed = JSON.parse(audioSet);
                    this.enabled = !!parsed.enabled;
                }
            } catch (e) {
            }
            EventBus.subscribe('app:settings:audio_changed', (msg) => {
                if (msg && msg.data !== undefined) {
                    this.enabled = !!msg.data.enabled;
                }
            });
        },
        setEnabled(val) {
            this.enabled = !!val;
            PersistenceManager.set('AUDIO:ENABLED', this.enabled);
        },
        isEnabled() {
            return this.enabled;
        },
        _createSource(type, freq, volume, duration) {
            if (!this.enabled || !this.ctx) return null;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.type = type;
            const now = this.ctx.currentTime;
            osc.onended = () => {
                osc.disconnect();
                gain.disconnect();
            };
            return { osc, gain, now };
        },
        async play(type) {
            if (!this.enabled || !this.ctx) return;
            if (this.ctx.state === 'suspended') {
                try { await this.ctx.resume(); } catch (e) { return; }
            }
            if (type === 'startup') {
                const playTone = (freq, start, dur) => {
                    const src = this._createSource('sine');
                    if (!src) return;
                    src.osc.frequency.setValueAtTime(freq, src.now + start);
                    src.gain.gain.setValueAtTime(0, src.now + start);
                    src.gain.gain.linearRampToValueAtTime(0.05, src.now + start + 0.05);
                    src.gain.gain.linearRampToValueAtTime(0, src.now + start + dur);
                    src.osc.start(src.now + start);
                    src.osc.stop(src.now + start + dur);
                };
                playTone(440, 0, 0.4);
                playTone(554.37, 0.15, 0.4);
                playTone(659.25, 0.3, 0.6);
            } else if (type === 'click') {
                const src = this._createSource('sine');
                if (!src) return;
                src.osc.frequency.setValueAtTime(600, src.now);
                src.gain.gain.setValueAtTime(0.05, src.now);
                src.osc.start(src.now);
                src.osc.stop(src.now + 0.05);
            } else if (type === 'error') {
                const src = this._createSource('sawtooth');
                if (!src) return;
                src.osc.frequency.setValueAtTime(200, src.now);
                src.osc.frequency.linearRampToValueAtTime(100, src.now + 0.3);
                src.gain.gain.setValueAtTime(0.1, src.now);
                src.osc.start(src.now);
                src.osc.stop(src.now + 0.3);
            } else if (type === 'notify') {
                const src = this._createSource('sine');
                if (!src) return;
                src.osc.frequency.setValueAtTime(880, src.now);
                src.osc.frequency.setValueAtTime(1100, src.now + 0.1);
                src.gain.gain.setValueAtTime(0.05, src.now);
                src.gain.gain.linearRampToValueAtTime(0, src.now + 0.3);
                src.osc.start(src.now);
                src.osc.stop(src.now + 0.3);
            }
        }
    };
