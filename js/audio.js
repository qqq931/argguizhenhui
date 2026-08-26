/* ============================================
   归真会 · 音频系统
   你听到的不是声音。是空无在呼吸。
   ============================================ */

const AudioSystem = {
    ctx: null,
    humNodes: null,       // { osc, osc2, lfo, gain, lfoGain }
    humGain: null,
    heartbeatTimer: null,
    noiseNode: null,
    noiseGain: null,
    initialized: false,
    humStarted: false,
    _desiredHumVol: 0,
    _unlocked: false,     // 是否已通过用户手势解锁

    /** 初始化音频上下文。返回 Promise，在 context running 后 resolve。 */
    init: function() {
        if (this.initialized && this.ctx && this.ctx.state === 'running') {
            return Promise.resolve();
        }
        return new Promise((resolve) => {
            try {
                if (!this.ctx) {
                    const AC = window.AudioContext || window.webkitAudioContext;
                    this.ctx = new AC();
                }
                const ctx = this.ctx;

                const finish = () => {
                    this.initialized = true;
                    this._unlocked = true;
                    // 如果之前已经想启动嗡鸣但 context 没好，现在补启
                    if (this.humStarted) {
                        this._buildHum();
                        this._applyHumVolume();
                    }
                    resolve();
                };

                if (ctx.state === 'running') {
                    finish();
                } else {
                    ctx.resume().then(finish).catch(finish);
                    // 兜底：某些浏览器 resume 不返回/很慢，200ms 后再检查一次
                    setTimeout(() => {
                        if (ctx.state === 'running' && !this.initialized) finish();
                    }, 200);
                }
            } catch (e) {
                resolve();
            }
        });
    },

    /** 在用户首次交互时解锁音频（绑定到 click/keydown/touchstart） */
    unlock: function() {
        return this.init().then(() => {
            // 播放一个极短的静音 buffer，彻底解锁 iOS/Safari
            try {
                const ctx = this.ctx;
                const buf = ctx.createBuffer(1, 1, 22050);
                const src = ctx.createBufferSource();
                src.buffer = buf;
                src.connect(ctx.destination);
                src.start(0);
            } catch (e) {}
        });
    },

    /** 构建嗡鸣节点（仅在 context running 后调用） */
    _buildHum: function() {
        if (!this.ctx || this.humNodes) return;
        const ctx = this.ctx;
        try {
            // 主振荡器 55Hz
            const osc = ctx.createOscillator();
            osc.type = 'sine';
            osc.frequency.value = 55;

            // LFO 微调频率
            const lfo = ctx.createOscillator();
            lfo.type = 'sine';
            lfo.frequency.value = 0.3;
            const lfoGain = ctx.createGain();
            lfoGain.gain.value = 3;
            lfo.connect(lfoGain);
            lfoGain.connect(osc.frequency);

            // 音量控制
            const gain = ctx.createGain();
            gain.gain.value = 0;

            // 高次谐波
            const osc2 = ctx.createOscillator();
            osc2.type = 'sine';
            osc2.frequency.value = 110;
            const gain2 = ctx.createGain();
            gain2.gain.value = 0.15;
            osc2.connect(gain2);
            gain2.connect(gain);

            osc.connect(gain);
            gain.connect(ctx.destination);

            osc.start();
            lfo.start();
            osc2.start();

            this.humNodes = { osc, osc2, lfo, gain, lfoGain, gain2 };
            this.humGain = gain;
            this.humStarted = true;
        } catch (e) {}
    },

    /** 启动低频嗡鸣 */
    startHum: function() {
        if (this.humNodes) {
            // 已经在跑，确保音量恢复
            this._applyHumVolume();
            return;
        }
        this.humStarted = true;
        if (!this.ctx || this.ctx.state !== 'running') {
            // context 还没好，等 init 完成后会自动 _buildHum
            this.init();
            return;
        }
        this._buildHum();
        this._applyHumVolume();
    },

    _applyHumVolume: function() {
        if (!this.humGain || !this.ctx) return;
        try {
            this.humGain.gain.setTargetAtTime(this._desiredHumVol, this.ctx.currentTime, 0.8);
        } catch (e) {}
    },

    /** 设置嗡鸣音量 (0.0 - 0.12) */
    setHumVolume: function(vol) {
        const clamped = Math.max(0, Math.min(0.12, vol));
        this._desiredHumVol = clamped;
        if (!this.ctx || this.ctx.state !== 'running') {
            // context 未就绪，等就绪后应用
            this.init();
            return;
        }
        if (!this.humNodes) {
            this._buildHum();
        }
        this._applyHumVolume();
    },

    /** 播放一次心跳声 */
    playHeartbeat: function(strength) {
        if (!this.ctx || this.ctx.state !== 'running') {
            this.init();
            return;
        }
        strength = strength || 0.5;
        const now = this.ctx.currentTime;
        this._thump(now, strength, 65, 30, 0.18);
        this._thump(now + 0.22, strength * 0.7, 55, 25, 0.15);
    },

    _thump: function(time, gain, startFreq, endFreq, duration) {
        try {
            const ctx = this.ctx;
            const osc = ctx.createOscillator();
            const g = ctx.createGain();

            osc.type = 'sine';
            osc.frequency.setValueAtTime(startFreq, time);
            osc.frequency.exponentialRampToValueAtTime(endFreq, time + duration);

            g.gain.setValueAtTime(gain, time);
            g.gain.exponentialRampToValueAtTime(0.001, time + duration);

            osc.connect(g);
            g.connect(ctx.destination);

            osc.start(time);
            osc.stop(time + duration + 0.05);
        } catch (e) {}
    },

    startHeartbeatLoop: function(intervalMs) {
        if (!this.ctx || this.ctx.state !== 'running') {
            this.init().then(() => this.startHeartbeatLoop(intervalMs));
            return;
        }
        this.stopHeartbeatLoop();
        this.playHeartbeat(0.5);
        this.heartbeatTimer = setInterval(() => {
            if (this.ctx && this.ctx.state === 'running') {
                this.playHeartbeat(0.5);
            }
        }, intervalMs || 1100);
    },

    stopHeartbeatLoop: function() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
    },

    /** 不和谐音爆发 */
    playBurst: function() {
        if (!this.ctx || this.ctx.state !== 'running') {
            this.init().then(() => this.playBurst());
            return;
        }
        try {
            const ctx = this.ctx;
            const now = ctx.currentTime;
            const freqs = [55, 58.27, 73.42, 110, 146.83];
            freqs.forEach((f) => {
                const osc = ctx.createOscillator();
                const g = ctx.createGain();
                osc.type = 'sawtooth';
                osc.frequency.value = f;
                g.gain.setValueAtTime(0, now);
                g.gain.linearRampToValueAtTime(0.08, now + 0.1);
                g.gain.exponentialRampToValueAtTime(0.001, now + 2.5);
                osc.connect(g);
                g.connect(ctx.destination);
                osc.start(now);
                osc.stop(now + 2.6);
            });
        } catch (e) {}
    },

    /** 白噪音爆发（打字声/帧闪） */
    playNoiseBurst: function(duration, volume) {
        if (!this.ctx || this.ctx.state !== 'running') return;
        duration = duration || 0.05;
        volume = volume || 0.04;
        try {
            const ctx = this.ctx;
            const bufferSize = Math.floor(ctx.sampleRate * duration);
            const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                data[i] = (Math.random() * 2 - 1) * 0.6;
            }
            const source = ctx.createBufferSource();
            source.buffer = buffer;
            const gain = ctx.createGain();
            gain.gain.value = volume;
            const filter = ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.value = 1200;
            source.connect(filter);
            filter.connect(gain);
            gain.connect(ctx.destination);
            source.start();
        } catch (e) {}
    },

    /** 持续白噪底噪（终局可用） */
    startNoiseBed: function(volume) {
        if (!this.ctx || this.ctx.state !== 'running') {
            this.init().then(() => this.startNoiseBed(volume));
            return;
        }
        this.stopNoiseBed();
        try {
            const ctx = this.ctx;
            const bufferSize = ctx.sampleRate * 2;
            const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                data[i] = (Math.random() * 2 - 1) * 0.3;
            }
            const source = ctx.createBufferSource();
            source.buffer = buffer;
            source.loop = true;
            const gain = ctx.createGain();
            gain.gain.value = volume || 0.02;
            const filter = ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.value = 400;
            source.connect(filter);
            filter.connect(gain);
            gain.connect(ctx.destination);
            source.start();
            this.noiseNode = source;
            this.noiseGain = gain;
        } catch (e) {}
    },

    stopNoiseBed: function() {
        if (this.noiseNode) {
            try { this.noiseNode.stop(); } catch (e) {}
            this.noiseNode = null;
            this.noiseGain = null;
        }
    },

    stopAll: function() {
        this.stopHeartbeatLoop();
        this.stopNoiseBed();
        if (this.humNodes) {
            const n = this.humNodes;
            try { n.osc.stop(); } catch (e) {}
            try { n.osc2.stop(); } catch (e) {}
            try { n.lfo.stop(); } catch (e) {}
            this.humNodes = null;
        }
        this.humGain = null;
        this.humStarted = false;
        this._desiredHumVol = 0;
    },

    fadeOut: function(duration) {
        duration = duration || 2;
        if (!this.ctx) { this.stopAll(); return; }
        if (this.humGain) {
            try {
                this.humGain.gain.setTargetAtTime(0, this.ctx.currentTime, duration / 3);
            } catch (e) {}
        }
        this.stopHeartbeatLoop();
        setTimeout(() => this.stopAll(), duration * 1000);
    }
};

/* ============================================
   全局自动解锁：任何用户手势都解锁音频
   确保跨页面后第一次点击/按键就能出声
   ============================================ */
(function() {
    let bound = false;
    function bindUnlock() {
        if (bound) return;
        bound = true;
        const unlock = function() {
            AudioSystem.unlock();
            // 解锁后移除一次性监听（保留 click 等也没关系，unlock 内部幂等）
            document.removeEventListener('click', unlock, true);
            document.removeEventListener('keydown', unlock, true);
            document.removeEventListener('touchstart', unlock, true);
            document.removeEventListener('scroll', unlock, true);
        };
        document.addEventListener('click', unlock, true);
        document.addEventListener('keydown', unlock, true);
        document.addEventListener('touchstart', unlock, true);
        document.addEventListener('scroll', unlock, true);
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bindUnlock);
    } else {
        bindUnlock();
    }
})();
