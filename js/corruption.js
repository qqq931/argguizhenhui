/* ============================================
   归真会 · 污染度系统
   你正在被测量。每一秒都在接近。
   ============================================ */

const CorruptionSystem = {
    // 状态
    corruption: 0,
    discoveredClues: [],
    truthUnlocked: false,
    initiated: false,

    // 内部计时器
    _mainTimer: null,
    _doctrineTimer: null,
    _effectTimer: null,
    _warningTimer: null,
    _invertTimer: null,
    _popupEl: null,
    _warningEl: null,
    _trailCanvas: null,
    _trailCtx: null,
    _trailPoints: [],
    _jitterElements: [],
    _replacedWords: [],
    _initialized: false,
    _pageHidden: false,
    _logoClicks: 0,
    _firstVisitShown: false,

    // 词汇替换表（40-60级hover时触发）
    wordMap: {
        '平静': '消融', '成长': '献祭', '光明': '虚空', '放下': '崩解',
        '归宿': '深渊', '温暖': '冰冷', '喜悦': '寂灭', '平安': '湮灭',
        '回家': '归来', '自我': '空壳', '修行': '腐蚀', '觉悟': '沉没',
        '接纳': '吞噬', '和谐': '混沌', '生命': '余烬', '真理': '谎言',
        '自由': '囚禁', '爱': '蚀', '光': '蚀', '心': '洞',
        '安宁': '枯寂', '圆满': '虚无', '慈悲': '无情', '智慧': '茫然'
    },

    /** 初始化（每个页面调用） */
    init: function() {
        if (this._initialized) return;
        this._initialized = true;

        this.load();

        // 某些页面（如终局页）抑制污染视觉效果
        this._suppress = document.body.dataset.suppressCorruption === 'true';

        if (this._suppress) {
            // 仅加载状态，不启动效果
            return;
        }

        this.createTrailCanvas();
        this.applyBodyClass();
        this.startMainTimer();
        this.startDoctrineTimer();
        this.startEffectLoop();
        this.setupGlobalListeners();
        this.initAudioOnInteraction();
        this.applyInitiatedChanges();
    },

    /** 从 localStorage 加载状态 */
    load: function() {
        this.corruption = parseInt(localStorage.getItem('guizhen_corruption')) || 0;
        try {
            this.discoveredClues = JSON.parse(localStorage.getItem('guizhen_clues')) || [];
        } catch (e) {
            this.discoveredClues = [];
        }
        this.truthUnlocked = localStorage.getItem('guizhen_truth_unlocked') === 'true';
        this.initiated = localStorage.getItem('guizhen_initiated') === 'true';
    },

    /** 保存状态到 localStorage */
    save: function() {
        localStorage.setItem('guizhen_corruption', this.corruption);
        localStorage.setItem('guizhen_clues', JSON.stringify(this.discoveredClues));
        localStorage.setItem('guizhen_truth_unlocked', this.truthUnlocked);
        localStorage.setItem('guizhen_initiated', this.initiated);
    },

    /** 增加污染度 */
    addCorruption: function(amount, source) {
        if (this.corruption >= 100) return;
        this.corruption = Math.min(100, this.corruption + amount);
        this.save();
        this.applyBodyClass();
        this.updateAudio();

        if (this.corruption >= 100) {
            this.triggerEnding();
        }
    },

    /** 发现线索 */
    discoverClue: function(clueId, points) {
        if (!this.discoveredClues.includes(clueId)) {
            this.discoveredClues.push(clueId);
            this.addCorruption(points || 10, 'clue');
        }
    },

    /** 解锁真理页 */
    unlockTruth: function() {
        this.truthUnlocked = true;
        this.save();
        this.addCorruption(15, 'unlock');
    },

    /** 设置 body class 控制污染等级样式 */
    applyBodyClass: function() {
        const body = document.body;
        body.classList.remove('corruption-0', 'corruption-20', 'corruption-40',
            'corruption-60', 'corruption-80', 'corruption-100');

        if (this.corruption >= 100) {
            body.classList.add('corruption-100');
        } else if (this.corruption >= 80) {
            body.classList.add('corruption-80');
        } else if (this.corruption >= 60) {
            body.classList.add('corruption-60');
        } else if (this.corruption >= 40) {
            body.classList.add('corruption-40');
        } else if (this.corruption >= 20) {
            body.classList.add('corruption-20');
        } else {
            body.classList.add('corruption-0');
        }

        // 应用/刷新各种效果元素
        this.refreshJitterTargets();
        this.applyGlitchToHeadings();
    },

    /** 主计时器：每10秒 +1 */
    startMainTimer: function() {
        if (this._mainTimer) clearInterval(this._mainTimer);
        this._mainTimer = setInterval(() => {
            if (!this._pageHidden && this.corruption < 100) {
                this.addCorruption(1, 'time');
            }
        }, 10000);
    },

    /** 教义页计时器：每秒 +2 */
    startDoctrineTimer: function() {
        if (this._doctrineTimer) clearInterval(this._doctrineTimer);
        if (document.body.classList.contains('page-doctrine')) {
            this._doctrineTimer = setInterval(() => {
                if (!this._pageHidden && this.corruption < 100) {
                    this.addCorruption(2, 'doctrine');
                }
            }, 1000);
        }
    },

    /** 效果循环：根据污染等级定期触发各种效果 */
    startEffectLoop: function() {
        if (this._effectTimer) clearInterval(this._effectTimer);
        this._effectTimer = setInterval(() => {
            if (this._pageHidden) return;
            if (this.corruption < 20) return;

            // 20-40: 偶尔文字抖动已由CSS处理，偶尔刷新抖动目标
            if (this.corruption >= 20 && this.corruption < 40) {
                if (Math.random() < 0.3) {
                    this.refreshJitterTargets();
                }
                // 极轻微背景闪烁已由CSS
            }

            // 40-60: 帧闪（10ms黑色遮罩）
            if (this.corruption >= 40 && this.corruption < 60) {
                if (Math.random() < 0.15) {
                    this.frameFlash();
                }
            }

            // 60-80: 假浏览器警告
            if (this.corruption >= 60 && this.corruption < 80) {
                if (!this._warningEl && Math.random() < 0.08) {
                    this.showFakeWarning();
                }
            }

            // 80-100: 屏幕倒置 + 确保弹窗存在
            if (this.corruption >= 80 && this.corruption < 100) {
                if (Math.random() < 0.05) {
                    this.triggerScreenInvert();
                }
                if (!this._popupEl) {
                    this.showUncloseablePopup();
                }
            }
        }, 2000);
    },

    /** 刷新需要抖动的元素（20级以上） */
    refreshJitterTargets: function() {
        if (this.corruption < 20) return;

        // 移除旧的
        this._jitterTargets = this._jitterTargets || [];
        // 随机选择段落和标题
        const candidates = document.querySelectorAll('p, h2, h3, .testimony-card, .qa-item');
        candidates.forEach(el => {
            el.classList.remove('jitter-target');
            el.style.removeProperty('--jitter-delay');
        });

        const count = Math.min(5, Math.floor(this.corruption / 10));
        const shuffled = Array.from(candidates).sort(() => Math.random() - 0.5);
        for (let i = 0; i < count && i < shuffled.length; i++) {
            shuffled[i].classList.add('jitter-target');
            shuffled[i].style.setProperty('--jitter-delay', (Math.random() * 2) + 's');
        }
    },

    /** 对标题应用glitch效果（80级以上） */
    applyGlitchToHeadings: function() {
        if (this.corruption < 80) return;
        const headings = document.querySelectorAll('h1, h2, h3, .site-header h1');
        headings.forEach(h => {
            if (!h.classList.contains('glitch-text')) {
                h.classList.add('glitch-text');
                h.setAttribute('data-text', h.textContent.trim());
            }
        });
    },

    /** 帧闪：10ms黑色遮罩 */
    frameFlash: function() {
        let flash = document.getElementById('frame-flash-el');
        if (!flash) {
            flash = document.createElement('div');
            flash.id = 'frame-flash-el';
            flash.className = 'black-flash';
            document.body.appendChild(flash);
        }
        flash.style.transition = 'none';
        flash.style.opacity = '1';
        AudioSystem.playNoiseBurst(0.03, 0.02);
        setTimeout(() => {
            flash.style.transition = 'opacity 0.05s';
            flash.style.opacity = '0';
        }, 10);
    },

    /** 假浏览器警告框（60-80级） */
    showFakeWarning: function() {
        const warnings = [
            { title: '⚠ 系统警告', msg: '你的灵魂未受保护。检测到异常精神频率。', btn: '点击修复' },
            { title: '⚠ 安全警报', msg: '你的自我边界正在弱化。建议立即进行归真修复。', btn: '立即修复' },
            { title: '⚠ 浏览器提示', msg: '此网页正在修改你的认知参数。是否允许？', btn: '允许' },
            { title: '⚠ 警告', msg: '检测到"独立意识"残留。点击清除以获得最佳体验。', btn: '清除残留' },
        ];
        const w = warnings[Math.floor(Math.random() * warnings.length)];

        const el = document.createElement('div');
        el.className = 'fake-warning';
        el.innerHTML =
            '<div class="warn-title">' + w.title + '</div>' +
            '<div class="warn-msg">' + w.msg + '</div>' +
            '<button class="warn-btn">' + w.btn + '</button>';

        // 按钮点击无效，只闪一下
        const btn = el.querySelector('.warn-btn');
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            btn.textContent = '修复中...';
            setTimeout(() => { btn.textContent = w.btn; }, 1000);
        });

        // 阻止点击遮罩关闭
        el.addEventListener('click', (e) => e.stopPropagation());

        document.body.appendChild(el);
        this._warningEl = el;

        // 3-6秒后自动消失
        const duration = 3000 + Math.random() * 3000;
        setTimeout(() => {
            if (el.parentNode) {
                el.style.transition = 'opacity 0.5s';
                el.style.opacity = '0';
                setTimeout(() => {
                    if (el.parentNode) el.parentNode.removeChild(el);
                }, 500);
            }
            this._warningEl = null;
        }, duration);
    },

    /** 无法关闭的弹窗（80级以上） */
    showUncloseablePopup: function() {
        if (this._popupEl) return;
        const messages = [
            { text: '归真时刻临近', sub: '不要抗拒' },
            { text: '你已经在了', sub: '你一直都在' },
            { text: '放下', sub: '现在就放下' },
            { text: '空无在等你', sub: '它从未离开' },
        ];
        const m = messages[Math.floor(Math.random() * messages.length)];

        const el = document.createElement('div');
        el.className = 'uncloseable-popup';
        el.innerHTML =
            '<span class="fake-close">×</span>' +
            '<div class="popup-text">' + m.text + '</div>' +
            '<div class="popup-sub">' + m.sub + '</div>';

        // 关闭按钮无效
        el.querySelector('.fake-close').addEventListener('click', () => {
            el.style.animation = 'none';
            el.offsetHeight; // 触发reflow
            el.style.animation = 'popup-fadein 0.3s';
            // 随机换文字
            const newM = messages[Math.floor(Math.random() * messages.length)];
            el.querySelector('.popup-text').textContent = newM.text;
            el.querySelector('.popup-sub').textContent = newM.sub;
        });

        document.body.appendChild(el);
        this._popupEl = el;
    },

    /** 屏幕倒置1-2秒（80级以上） */
    triggerScreenInvert: function() {
        document.body.classList.add('screen-invert');
        AudioSystem.playNoiseBurst(0.1, 0.04);
        setTimeout(() => {
            document.body.classList.remove('screen-invert');
        }, 2000);
    },

    /** 创建鼠标残影画布（80级以上） */
    createTrailCanvas: function() {
        const canvas = document.createElement('canvas');
        canvas.id = 'trail-canvas';
        document.body.appendChild(canvas);
        this._trailCanvas = canvas;
        this._trailCtx = canvas.getContext('2d');

        const resize = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        };
        resize();
        window.addEventListener('resize', resize);

        document.addEventListener('mousemove', (e) => {
            if (this.corruption >= 80 && this.corruption < 100) {
                this._trailPoints.push({
                    x: e.clientX,
                    y: e.clientY,
                    life: 1.0,
                    size: 3 + Math.random() * 5
                });
            }
        });

        this._animateTrail();
    },

    /** 鼠标残影动画 */
    _animateTrail: function() {
        const animate = () => {
            if (!this._trailCtx) { requestAnimationFrame(animate); return; }
            this._trailCtx.clearRect(0, 0, this._trailCanvas.width, this._trailCanvas.height);

            for (let i = this._trailPoints.length - 1; i >= 0; i--) {
                const p = this._trailPoints[i];
                p.life -= 0.015;
                if (p.life <= 0) {
                    this._trailPoints.splice(i, 1);
                    continue;
                }
                this._trailCtx.beginPath();
                this._trailCtx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
                this._trailCtx.fillStyle = 'rgba(139, 69, 19, ' + (p.life * 0.4) + ')';
                this._trailCtx.fill();

                this._trailCtx.beginPath();
                this._trailCtx.arc(p.x, p.y, p.size * p.life * 0.5, 0, Math.PI * 2);
                this._trailCtx.fillStyle = 'rgba(100, 0, 0, ' + (p.life * 0.6) + ')';
                this._trailCtx.fill();
            }
            requestAnimationFrame(animate);
        };
        requestAnimationFrame(animate);
    },

    /** 更新音频音量 */
    updateAudio: function() {
        if (this.corruption >= 60) {
            AudioSystem.startHum();
            const vol = Math.min(0.08, ((this.corruption - 60) / 40) * 0.08);
            AudioSystem.setHumVolume(vol);
        }
    },

    /** 在用户首次交互时初始化音频（audio.js 已全局绑定解锁，这里只负责恢复嗡鸣） */
    initAudioOnInteraction: function() {
        const restore = () => {
            AudioSystem.unlock().then(() => {
                if (this.corruption >= 60) {
                    AudioSystem.startHum();
                    this.updateAudio();
                }
            });
            document.removeEventListener('click', restore);
            document.removeEventListener('keydown', restore);
        };
        document.addEventListener('click', restore);
        document.addEventListener('keydown', restore);
        // 页面加载时如果污染度已经 >=60（跨页面回来），也主动尝试解锁
        if (this.corruption >= 60) {
            AudioSystem.unlock().then(() => {
                AudioSystem.startHum();
                this.updateAudio();
            });
        }
    },

    /** 全局事件监听 */
    setupGlobalListeners: function() {
        // 页面可见性变化
        document.addEventListener('visibilitychange', () => {
            this._pageHidden = document.hidden;
        });

        // 40-60级：文字hover替换 + 鼠标偏移
        document.addEventListener('mouseover', (e) => {
            if (this.corruption >= 40 && this.corruption < 60) {
                const target = e.target;
                if (target.nodeType === 3) return; // 文本节点
                if (target.childNodes.length === 1 && target.childNodes[0].nodeType === 3) {
                    // 叶子元素，检查文本
                    this._handleWordHover(target);
                }
            }
        });

        // 40-60级：鼠标偶发偏移
        document.addEventListener('mousemove', (e) => {
            if (this.corruption >= 40 && this.corruption < 60) {
                if (Math.random() < 0.003) {
                    const dx = (Math.random() - 0.5) * 20;
                    const dy = (Math.random() - 0.5) * 20;
                    document.body.style.transform = 'translate(' + dx + 'px, ' + dy + 'px)';
                    document.body.style.transition = 'transform 0.05s';
                    setTimeout(() => {
                        document.body.style.transform = 'translate(0, 0)';
                        setTimeout(() => {
                            document.body.style.transition = '';
                        }, 50);
                    }, 50);
                }
            }
        });

        // Logo 点击7次
        const logo = document.querySelector('.lotus-logo');
        if (logo) {
            logo.addEventListener('click', () => {
                this._logoClicks++;
                if (this._logoClicks >= 7) {
                    this._revealEye();
                } else {
                    // 轻微反馈
                    logo.style.transform = 'scale(0.95)';
                    setTimeout(() => { logo.style.transform = ''; }, 100);
                }
            });
        }

        // Admin 隐藏链接
        const adminLink = document.querySelector('.admin-link');
        if (adminLink) {
            adminLink.addEventListener('click', (e) => {
                e.preventDefault();
                this._showAdminPrompt();
            });
        }
    },

    /** 处理文字hover替换（40-60级） */
    _handleWordHover: function(el) {
        if (el.dataset.corrupted) return;
        const text = el.textContent;
        let newText = text;
        let replaced = false;

        for (const [normal, corrupt] of Object.entries(this.wordMap)) {
            if (newText.includes(normal)) {
                newText = newText.replace(normal, corrupt);
                replaced = true;
            }
        }

        if (replaced) {
            el.dataset.corrupted = 'true';
            el.dataset.original = text;
            el.textContent = newText;
            el.style.color = '#8b0000';
            AudioSystem.playNoiseBurst(0.02, 0.01);

            setTimeout(() => {
                if (el.dataset.corrupted) {
                    el.textContent = el.dataset.original;
                    el.style.color = '';
                    delete el.dataset.corrupted;
                    delete el.dataset.original;
                }
            }, 1500 + Math.random() * 2000);
        }
    },

    /** Logo变成眼睛 */
    _revealEye: function() {
        const lotus = document.querySelector('.lotus-logo');
        const eye = document.querySelector('.eye-logo');
        if (lotus) lotus.classList.add('hidden');
        if (eye) eye.classList.add('visible');

        // 页面轻微震动
        document.body.style.animation = 'none';
        document.body.offsetHeight;
        let shakeCount = 0;
        const shakeInterval = setInterval(() => {
            const dx = (Math.random() - 0.5) * 6;
            const dy = (Math.random() - 0.5) * 6;
            document.body.style.transform = 'translate(' + dx + 'px, ' + dy + 'px)';
            shakeCount++;
            if (shakeCount > 10) {
                clearInterval(shakeInterval);
                document.body.style.transform = '';
            }
        }, 50);

        // 显示隐藏线索文字
        const clue = document.getElementById('logo-clue');
        if (clue) clue.style.display = 'block';

        this.discoverClue('logo_eye', 10);
        AudioSystem.playNoiseBurst(0.3, 0.05);
    },

    /** Admin密码输入 */
    _showAdminPrompt: function() {
        const pw = prompt('管理员验证 — 输入访问口令：');
        if (pw === '归真' || pw === 'guizhen' || pw === 'void') {
            const info = '=== 归真会 · 内部诊断 ===\n' +
                '受试者编号: SUB-' + Math.floor(Math.random() * 90000 + 10000) + '\n' +
                '当前污染度: ' + this.corruption + '/100\n' +
                '已发现线索: ' + this.discoveredClues.length + '\n' +
                '真理页状态: ' + (this.truthUnlocked ? '已解锁' : '未解锁') + '\n' +
                '接引状态: ' + (this.initiated ? '已归真' : '未归真') + '\n' +
                '停留时间: ' + Math.floor(Date.now() / 1000) + 's\n' +
                '认知完整度: ' + Math.max(0, 100 - this.corruption) + '%\n' +
                '建议: 继续。';
            alert(info);
        } else if (pw !== null) {
            alert('访问被拒绝。你不属于这里。');
        }
    },

    /** 二周目（initiated）变化 */
    applyInitiatedChanges: function() {
        if (!this.initiated) return;

        // 欢迎词变成"欢迎回来"
        const welcomeEl = document.querySelector('.welcome-text');
        if (welcomeEl) {
            welcomeEl.textContent = '欢迎回来。';
        }

        // 副标题微调
        const subtitle = document.querySelector('.welcome-sub');
        if (subtitle) {
            subtitle.textContent = '你知道你为什么在这里。';
        }
    },

    /** 首次访问警告 */
    showFirstVisitWarning: function() {
        if (localStorage.getItem('guizhen_warning_seen') === 'true') return;
        if (this._firstVisitShown) return;
        this._firstVisitShown = true;

        const overlay = document.createElement('div');
        overlay.className = 'first-warning';
        overlay.innerHTML =
            '<div class="first-warning-box">' +
            '<h3>⚠ 内容警告</h3>' +
            '<p>本网站包含可能影响精神状态的频率内容、视觉刺激及心理学实验素材。<br><br>如果你有癫痫史、心脏疾病或精神类疾病史，请立即关闭。<br><br>是否继续？</p>' +
            '<div class="warning-btns">' +
            '<button class="btn-yes">是，我同意</button>' +
            '<button class="btn-no">否，离开</button>' +
            '</div>' +
            '</div>';

        document.body.appendChild(overlay);

        const yesBtn = overlay.querySelector('.btn-yes');
        const noBtn = overlay.querySelector('.btn-no');
        const btnsContainer = overlay.querySelector('.warning-btns');

        // "否"按钮hover时滑走
        noBtn.addEventListener('mouseenter', () => {
            const maxX = btnsContainer.offsetWidth - noBtn.offsetWidth - 10;
            const maxY = 60;
            const newX = Math.random() * maxX - maxX / 2;
            const newY = (Math.random() - 0.5) * maxY;
            noBtn.style.position = 'relative';
            noBtn.style.left = newX + 'px';
            noBtn.style.top = newY + 'px';
        });

        // 点击"是"进入
        yesBtn.addEventListener('click', () => {
            overlay.style.transition = 'opacity 0.5s';
            overlay.style.opacity = '0';
            setTimeout(() => {
                if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
            }, 500);
            localStorage.setItem('guizhen_warning_seen', 'true');
            // 解锁音频（用户点击手势）
            AudioSystem.unlock();
        });

        // 点击"否"也会进入（按钮滑走后如果点到了，也进入）
        noBtn.addEventListener('click', () => {
            // 如果按钮恰好没滑走被点到了，仍然进入
            overlay.style.transition = 'opacity 0.5s';
            overlay.style.opacity = '0';
            setTimeout(() => {
                if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
            }, 500);
            localStorage.setItem('guizhen_warning_seen', 'true');
        });
    },

    /** 终局触发（污染度100） */
    triggerEnding: function() {
        // 只有非终局页面才触发跳转
        const path = window.location.pathname;
        if (path.includes('initiation.html')) return;
        if (path.includes('truth.html')) return; // truth页手动跳转

        // 短暂全黑后跳转
        let flash = document.getElementById('frame-flash-el');
        if (!flash) {
            flash = document.createElement('div');
            flash.id = 'frame-flash-el';
            flash.className = 'black-flash';
            document.body.appendChild(flash);
        }
        flash.style.transition = 'opacity 0.3s';
        flash.style.opacity = '1';
        AudioSystem.playBurst();

        setTimeout(() => {
            window.location.href = 'pages/initiation.html';
        }, 1500);
    },

    /** 重置（终局完成后调用） */
    resetForNewCycle: function() {
        this.corruption = 0;
        this.discoveredClues = [];
        this.truthUnlocked = false;
        this.initiated = true; // 标记已归真
        this.save();
    },

    /** 获取当前状态摘要（调试用） */
    getStatus: function() {
        return {
            corruption: this.corruption,
            clues: this.discoveredClues,
            truthUnlocked: this.truthUnlocked,
            initiated: this.initiated
        };
    }
};

// 页面加载完成后自动初始化
document.addEventListener('DOMContentLoaded', function() {
    CorruptionSystem.init();
});
