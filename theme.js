(function () {
    'use strict';

    const LEGACY_THEME_KEY = 'pa_theme_v1';
    const GLOBAL_THEME_KEY = 'pa_theme_global_v2';
    const LOCAL_THEME_PREFIX = 'pa_theme_local_v2:';

    const DEFAULT_THEME = {
        id: 'senja-logo',
        name: 'Senja Klasik',
        description: 'Biru malam, jingga senja, dan krem hangat dari logo.',
        mode: 'light',
        primary: '#0A3458',
        button: '#F35A0B',
        bg: '#FFFAF4',
        nav: '#FFFFFF',
        footer: '#06243D',
        card: '#FFFFFF'
    };

    const THEME_PRESETS = [
        DEFAULT_THEME,
        {
            id: 'langit-mawar',
            name: 'Langit Mawar',
            description: 'Ungu lembut dan koral hangat seperti langit menjelang malam.',
            mode: 'light',
            primary: '#563A72',
            button: '#F06C5B',
            bg: '#FFF7F5',
            nav: '#FFF9FC',
            footer: '#30203F',
            card: '#FFFFFF'
        },
        {
            id: 'laut-teduh',
            name: 'Laut Teduh',
            description: 'Biru teal yang segar, tenang, dan tetap profesional.',
            mode: 'light',
            primary: '#155B68',
            button: '#22A99A',
            bg: '#F1FBFA',
            nav: '#F8FFFE',
            footer: '#0A3841',
            card: '#FFFFFF'
        },
        {
            id: 'hutan-hangat',
            name: 'Hutan Hangat',
            description: 'Hijau alami dengan aksen emas untuk suasana belajar yang nyaman.',
            mode: 'light',
            primary: '#315744',
            button: '#D88B24',
            bg: '#FFF9ED',
            nav: '#FFFCF5',
            footer: '#1D392C',
            card: '#FFFFFF'
        },
        {
            id: 'aurora-malam',
            name: 'Aurora Malam',
            description: 'Tema gelap premium dengan indigo dan cahaya biru elektrik.',
            mode: 'dark',
            primary: '#7787FF',
            button: '#42D3C8',
            bg: '#07101F',
            nav: '#111C35',
            footer: '#030813',
            card: '#182544'
        }
    ];

    function clone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function safeParse(value) {
        try {
            const parsed = JSON.parse(value);
            return parsed && typeof parsed === 'object' ? parsed : null;
        } catch (error) {
            return null;
        }
    }

    function getSession() {
        return safeParse(localStorage.getItem('pa_auth_session_v1'));
    }

    function isMainAdmin(session) {
        if (!session || session.role !== 'admin') return false;
        return session.isMainAdmin === true || String(session.userId || '') === 'admin-main';
    }

    function userThemeKey(session) {
        if (!session || !session.token) return '';
        const identity = session.userId || session.tutorId || session.username || 'user';
        return LOCAL_THEME_PREFIX + String(identity).replace(/[^a-zA-Z0-9_-]/g, '_');
    }

    function normalizeHex(hex, fallback) {
        return /^#[0-9a-f]{6}$/i.test(String(hex || '')) ? String(hex).toUpperCase() : fallback;
    }

    function sanitizeTheme(rawTheme, fallback) {
        const source = rawTheme && typeof rawTheme === 'object' ? rawTheme : {};
        const base = fallback || DEFAULT_THEME;
        return {
            id: String(source.id || base.id || 'custom'),
            name: String(source.name || base.name || 'Tema Kustom'),
            description: String(source.description || base.description || ''),
            mode: source.mode === 'dark' ? 'dark' : source.mode === 'light' ? 'light' : 'auto',
            primary: normalizeHex(source.primary, base.primary),
            button: normalizeHex(source.button, base.button),
            bg: normalizeHex(source.bg, base.bg),
            nav: normalizeHex(source.nav, base.nav),
            footer: normalizeHex(source.footer, base.footer),
            card: normalizeHex(source.card, base.card)
        };
    }

    function getGlobalTheme() {
        const current = safeParse(localStorage.getItem(GLOBAL_THEME_KEY));
        if (current) return sanitizeTheme(current, DEFAULT_THEME);

        const legacy = safeParse(localStorage.getItem(LEGACY_THEME_KEY));
        if (legacy) {
            const migrated = sanitizeTheme(legacy, DEFAULT_THEME);
            localStorage.setItem(GLOBAL_THEME_KEY, JSON.stringify(migrated));
            return migrated;
        }

        return clone(DEFAULT_THEME);
    }

    function getLocalTheme(session) {
        const key = userThemeKey(session);
        if (!key) return null;
        const stored = safeParse(localStorage.getItem(key));
        return stored ? sanitizeTheme(stored, DEFAULT_THEME) : null;
    }

    function getResolvedTheme() {
        const session = getSession();
        if (session && session.token) {
            return getLocalTheme(session) || getGlobalTheme();
        }
        return getGlobalTheme();
    }

    function hexToRgb(hex) {
        const safe = normalizeHex(hex, '#FFFFFF').slice(1);
        return {
            r: parseInt(safe.slice(0, 2), 16),
            g: parseInt(safe.slice(2, 4), 16),
            b: parseInt(safe.slice(4, 6), 16)
        };
    }

    function rgbToHex(rgb) {
        return '#' + [rgb.r, rgb.g, rgb.b]
            .map(value => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0'))
            .join('')
            .toUpperCase();
    }

    function mix(hexA, hexB, ratio) {
        const a = hexToRgb(hexA);
        const b = hexToRgb(hexB);
        const weight = Math.max(0, Math.min(1, Number(ratio) || 0));
        return rgbToHex({
            r: a.r + (b.r - a.r) * weight,
            g: a.g + (b.g - a.g) * weight,
            b: a.b + (b.b - a.b) * weight
        });
    }

    function rgba(hex, alpha) {
        const rgb = hexToRgb(hex);
        return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
    }

    function luminance(hex) {
        const rgb = hexToRgb(hex);
        const channels = [rgb.r, rgb.g, rgb.b].map(value => {
            const channel = value / 255;
            return channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
    }

    function shade(hex, amount) {
        return mix(hex, amount < 0 ? '#000000' : '#FFFFFF', Math.abs(amount));
    }

    function applyTheme(rawTheme) {
        const theme = sanitizeTheme(rawTheme, DEFAULT_THEME);
        const dark = theme.mode === 'dark' || (theme.mode === 'auto' && luminance(theme.bg) < 0.22);
        const root = document.documentElement;
        const style = root.style;
        const heading = dark ? '#F5F7FF' : shade(theme.primary, -0.12);
        const body = dark ? mix('#FFFFFF', theme.bg, 0.34) : mix(heading, '#FFFFFF', 0.34);
        const bodySubtle = dark ? mix('#FFFFFF', theme.bg, 0.48) : mix(heading, '#FFFFFF', 0.48);
        const neutralSecondary = dark ? mix(theme.bg, '#FFFFFF', 0.055) : mix(theme.bg, theme.primary, 0.035);
        const neutralTertiary = dark ? mix(theme.bg, '#FFFFFF', 0.11) : mix(theme.bg, theme.primary, 0.075);
        const borderBase = dark ? '#FFFFFF' : theme.primary;
        const glassAlpha = dark ? 0.5 : 0.58;
        const glassStrongAlpha = dark ? 0.66 : 0.78;
        const glassHoverAlpha = dark ? 0.62 : 0.72;

        root.dataset.ksTheme = theme.id;
        root.dataset.ksThemeTone = dark ? 'dark' : 'light';
        root.style.colorScheme = dark ? 'dark' : 'light';

        style.setProperty('--brand-primary', theme.primary);
        style.setProperty('--brand-primary-strong', dark ? shade(theme.primary, 0.18) : shade(theme.primary, -0.24));
        style.setProperty('--brand-primary-soft', rgba(theme.primary, dark ? 0.2 : 0.12));
        style.setProperty('--brand-accent', theme.button);
        style.setProperty('--brand-accent-strong', dark ? shade(theme.button, 0.12) : shade(theme.button, -0.16));
        style.setProperty('--brand-accent-soft', rgba(theme.button, dark ? 0.2 : 0.16));
        style.setProperty('--brand-sun', shade(theme.button, 0.24));
        style.setProperty('--brand-cream', mix(theme.bg, theme.button, dark ? 0.12 : 0.1));

        style.setProperty('--neutral-primary', theme.bg);
        style.setProperty('--neutral-secondary', neutralSecondary);
        style.setProperty('--neutral-tertiary', neutralTertiary);
        style.setProperty('--neutral-strong', dark ? mix(theme.bg, '#FFFFFF', 0.18) : mix(theme.bg, theme.primary, 0.14));
        style.setProperty('--heading', heading);
        style.setProperty('--body', body);
        style.setProperty('--body-subtle', bodySubtle);
        style.setProperty('--fg-disabled', dark ? mix(bodySubtle, theme.bg, 0.25) : mix(bodySubtle, '#FFFFFF', 0.18));

        style.setProperty('--border-default', rgba(borderBase, dark ? 0.13 : 0.13));
        style.setProperty('--border-default-strong', rgba(borderBase, dark ? 0.24 : 0.25));
        style.setProperty('--border-brand', rgba(theme.button, 0.56));
        style.setProperty('--glass-bg', rgba(theme.card, glassAlpha));
        style.setProperty('--glass-bg-strong', rgba(theme.card, glassStrongAlpha));
        style.setProperty('--glass-bg-hover', rgba(theme.card, glassHoverAlpha));
        style.setProperty('--glass-border', rgba(borderBase, dark ? 0.14 : 0.13));
        style.setProperty('--glass-border-subtle', rgba(borderBase, dark ? 0.075 : 0.07));
        style.setProperty('--glass-shadow', dark
            ? '0 8px 32px rgba(0, 0, 0, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.16), inset 0 -1px 0 rgba(255, 255, 255, 0.05)'
            : `0 8px 32px ${rgba(theme.primary, 0.1)}, inset 0 1px 0 rgba(255, 255, 255, 0.72), inset 0 -1px 0 rgba(255, 255, 255, 0.18)`);
        style.setProperty('--glass-edge-top', dark
            ? 'linear-gradient(90deg, transparent, rgba(255,255,255,.22), transparent)'
            : 'linear-gradient(90deg, transparent, rgba(255,255,255,.88), transparent)');
        style.setProperty('--glass-edge-left', dark
            ? 'linear-gradient(180deg, rgba(255,255,255,.2), transparent, rgba(255,255,255,.05))'
            : 'linear-gradient(180deg, rgba(255,255,255,.86), transparent, rgba(255,255,255,.28))');

        style.setProperty('--shadow-xs', `0 2px 8px ${dark ? 'rgba(0,0,0,.22)' : rgba(theme.primary, 0.08)}`);
        style.setProperty('--shadow-sm', `0 4px 16px ${dark ? 'rgba(0,0,0,.24)' : rgba(theme.primary, 0.1)}, inset 0 1px 0 rgba(255,255,255,.18)`);
        style.setProperty('--shadow-md', `0 8px 32px ${dark ? 'rgba(0,0,0,.28)' : rgba(theme.primary, 0.12)}, inset 0 1px 0 rgba(255,255,255,.2)`);
        style.setProperty('--color-1-400', dark ? 'rgba(255,255,255,.16)' : 'rgba(255,255,255,.35)');
        style.setProperty('--color-1-700', dark ? 'rgba(0,0,0,.28)' : rgba(theme.primary, 0.2));

        /* Alias kompatibilitas dengan struktur website yang sudah ada. */
        style.setProperty('--pa-primary', theme.primary);
        style.setProperty('--pa-button', theme.button);
        style.setProperty('--pa-accent', theme.button);
        style.setProperty('--pa-accent-dark', dark ? shade(theme.button, 0.12) : shade(theme.button, -0.16));
        style.setProperty('--pa-bg', theme.bg);
        style.setProperty('--pa-soft', mix(theme.bg, theme.button, dark ? 0.12 : 0.1));
        style.setProperty('--pa-text', heading);
        style.setProperty('--pa-nav', rgba(theme.nav, dark ? 0.66 : 0.72));
        style.setProperty('--pa-nav-bg', rgba(theme.nav, dark ? 0.66 : 0.72));
        style.setProperty('--pa-footer', theme.footer);
        style.setProperty('--pa-card', rgba(theme.card, glassAlpha));
        style.setProperty('--pa-card-bg', rgba(theme.card, glassAlpha));

        const metaTheme = document.querySelector('meta[name="theme-color"]');
        if (metaTheme) metaTheme.setAttribute('content', theme.primary);

        window.dispatchEvent(new CustomEvent('ks-theme-change', { detail: { theme, scope: 'preview' } }));
        return theme;
    }

    function saveLocalTheme(rawTheme) {
        const session = getSession();
        const key = userThemeKey(session);
        if (!key) return false;
        const theme = sanitizeTheme(rawTheme, DEFAULT_THEME);
        localStorage.setItem(key, JSON.stringify(theme));
        applyTheme(theme);
        return true;
    }

    function clearLocalTheme() {
        const session = getSession();
        const key = userThemeKey(session);
        if (key) localStorage.removeItem(key);
        const globalTheme = getGlobalTheme();
        applyTheme(globalTheme);
        return globalTheme;
    }

    function receiveGlobalTheme(rawTheme) {
        if (!rawTheme || typeof rawTheme !== 'object') return;
        const theme = sanitizeTheme(rawTheme, DEFAULT_THEME);
        localStorage.setItem(GLOBAL_THEME_KEY, JSON.stringify(theme));
        localStorage.setItem(LEGACY_THEME_KEY, JSON.stringify(theme));
        const session = getSession();
        if (!session || !getLocalTheme(session)) applyTheme(theme);
        updatePanelSelection();
    }

    function storeGlobalTheme(rawTheme) {
        const theme = sanitizeTheme(rawTheme, DEFAULT_THEME);
        localStorage.setItem(GLOBAL_THEME_KEY, JSON.stringify(theme));
        localStorage.setItem(LEGACY_THEME_KEY, JSON.stringify(theme));
        return theme;
    }

    function initMobileNavigation() {
        const nav = document.querySelector('nav');
        const links = nav && nav.querySelector('.nav-links');
        if (!nav || !links || nav.querySelector('.nav-toggle')) return;

        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'nav-toggle';
        toggle.setAttribute('aria-label', 'Buka menu navigasi');
        toggle.setAttribute('aria-expanded', 'false');
        toggle.setAttribute('aria-controls', 'mainNavigation');
        toggle.innerHTML = '<span aria-hidden="true"></span>';
        links.id = links.id || 'mainNavigation';
        nav.insertBefore(toggle, links);

        function closeMenu() {
            nav.classList.remove('is-open');
            toggle.setAttribute('aria-expanded', 'false');
            toggle.setAttribute('aria-label', 'Buka menu navigasi');
        }

        toggle.addEventListener('click', function () {
            const open = nav.classList.toggle('is-open');
            toggle.setAttribute('aria-expanded', String(open));
            toggle.setAttribute('aria-label', open ? 'Tutup menu navigasi' : 'Buka menu navigasi');
        });

        links.addEventListener('click', function (event) {
            if (event.target.closest('a')) closeMenu();
        });

        document.addEventListener('keydown', function (event) {
            if (event.key === 'Escape') closeMenu();
        });

        window.addEventListener('resize', function () {
            if (window.innerWidth > 980) closeMenu();
        });
    }

    function themeMatches(a, b) {
        if (!a || !b) return false;
        return ['primary', 'button', 'bg', 'nav', 'footer', 'card']
            .every(key => String(a[key] || '').toUpperCase() === String(b[key] || '').toUpperCase());
    }

    function updatePanelSelection() {
        const panel = document.getElementById('themePanel');
        if (!panel) return;
        const active = getResolvedTheme();
        panel.querySelectorAll('[data-theme-preset]').forEach(button => {
            const preset = THEME_PRESETS.find(item => item.id === button.dataset.themePreset);
            const selected = themeMatches(active, preset);
            button.classList.toggle('is-active', selected);
            button.setAttribute('aria-checked', String(selected));
        });
    }

    function createPresetMarkup(preset) {
        const safeId = preset.id.replace(/[^a-z0-9_-]/gi, '');
        return `
            <button type="button" class="ks-theme-preset" data-theme-preset="${safeId}" role="radio" aria-checked="false">
                <span class="ks-theme-preview" aria-hidden="true" style="--preview-bg:${preset.bg};--preview-primary:${preset.primary};--preview-accent:${preset.button};--preview-card:${preset.card};--preview-footer:${preset.footer}">
                    <span class="ks-preview-nav"></span>
                    <span class="ks-preview-card"><i></i><i></i></span>
                    <span class="ks-preview-button"></span>
                    <span class="ks-preview-footer"></span>
                </span>
                <span class="ks-theme-copy">
                    <strong>${preset.name}</strong>
                    <small>${preset.description}</small>
                </span>
                <span class="ks-theme-check" aria-hidden="true">✓</span>
            </button>
        `;
    }

    function createThemePanel() {
        const session = getSession();
        if (!session || !session.token) return;
        if (document.getElementById('themeFloatingBtn')) return;

        const mainAdmin = isMainAdmin(session);
        let selectedTheme = getResolvedTheme();

        const btn = document.createElement('button');
        btn.id = 'themeFloatingBtn';
        btn.type = 'button';
        btn.className = 'pa-theme-floating-btn';
        btn.innerHTML = '<span aria-hidden="true">🎨</span> Edit Tema';
        btn.setAttribute('aria-expanded', 'false');
        btn.setAttribute('aria-controls', 'themePanel');

        const panel = document.createElement('section');
        panel.id = 'themePanel';
        panel.className = 'pa-theme-panel ks-theme-panel';
        panel.hidden = true;
        panel.setAttribute('aria-label', 'Editor tema dashboard');
        panel.innerHTML = `
            <div class="ks-theme-header">
                <div>
                    <span class="ks-theme-eyebrow">Tampilan setelah login</span>
                    <h3>Edit Tema</h3>
                </div>
                <span class="ks-theme-scope ${mainAdmin ? 'is-global' : ''}">${mainAdmin ? 'Admin Utama' : 'Tema Lokal'}</span>
            </div>
            <p class="ks-theme-intro">Pilih satu tema. Seluruh warna, kartu, tombol, navbar, dan latar dashboard langsung menyesuaikan.</p>
            <div class="ks-theme-presets" role="radiogroup" aria-label="Pilihan tema">
                ${THEME_PRESETS.map(createPresetMarkup).join('')}
            </div>
            <details class="ks-theme-custom">
                <summary>Atur warna sendiri</summary>
                <div class="ks-theme-fields">
                    <label for="themePrimary">Warna utama<input type="color" id="themePrimary"></label>
                    <label for="themeButton">Warna tombol<input type="color" id="themeButton"></label>
                    <label for="themeBg">Latar halaman<input type="color" id="themeBg"></label>
                    <label for="themeNav">Dasar navbar<input type="color" id="themeNav"></label>
                    <label for="themeFooter">Footer<input type="color" id="themeFooter"></label>
                    <label for="themeCard">Dasar kaca<input type="color" id="themeCard"></label>
                </div>
                <button type="button" class="ks-theme-local-save" id="themeSaveLocal">Gunakan di Perangkat Ini</button>
            </details>
            ${mainAdmin ? `
                <div class="ks-theme-admin-box">
                    <strong>Terapkan sebagai tema utama website?</strong>
                    <p>Perubahan global akan menjadi tampilan bawaan untuk halaman publik dan semua akun yang tidak memakai tema lokal.</p>
                    <button type="button" id="themePublishGlobal">Terapkan untuk Semua Pengguna</button>
                </div>
            ` : `
                <div class="ks-theme-local-note">
                    <strong>Hanya terlihat oleh akun ini</strong>
                    <span>Pilihan tersimpan di browser/perangkat ini dan tidak mengubah tampilan pengguna lain.</span>
                </div>
            `}
            <div class="ks-theme-bottom-actions">
                <button type="button" id="themeUseGlobal">Kembali ke Tema Utama</button>
            </div>
            <p class="ks-theme-status" id="themePanelStatus" role="status" aria-live="polite"></p>
        `;

        document.body.appendChild(btn);
        document.body.appendChild(panel);

        const fields = {
            primary: document.getElementById('themePrimary'),
            button: document.getElementById('themeButton'),
            bg: document.getElementById('themeBg'),
            nav: document.getElementById('themeNav'),
            footer: document.getElementById('themeFooter'),
            card: document.getElementById('themeCard')
        };
        const status = document.getElementById('themePanelStatus');

        function setStatus(text, type) {
            status.textContent = text;
            status.className = 'ks-theme-status ' + (type || '');
        }

        function fillInputs(theme) {
            Object.keys(fields).forEach(key => { fields[key].value = theme[key]; });
        }

        function readInputs() {
            return sanitizeTheme({
                id: 'custom',
                name: 'Tema Kustom',
                description: 'Palet warna buatan pengguna.',
                mode: luminance(fields.bg.value) < 0.22 ? 'dark' : 'light',
                primary: fields.primary.value,
                button: fields.button.value,
                bg: fields.bg.value,
                nav: fields.nav.value,
                footer: fields.footer.value,
                card: fields.card.value
            }, selectedTheme);
        }

        function setPanelOpen(open) {
            panel.hidden = !open;
            panel.classList.toggle('show', open);
            btn.classList.toggle('is-active', open);
            btn.setAttribute('aria-expanded', String(open));
            if (open) {
                updatePanelSelection();
                requestAnimationFrame(() => panel.querySelector('[data-theme-preset]')?.focus({ preventScroll: true }));
            }
        }

        function closePanel() {
            setPanelOpen(false);
        }

        fillInputs(selectedTheme);
        updatePanelSelection();

        btn.addEventListener('click', function (event) {
            event.preventDefault();
            event.stopPropagation();
            setPanelOpen(panel.hidden);
        });

        panel.addEventListener('click', event => event.stopPropagation());

        document.addEventListener('click', function (event) {
            if (!panel.contains(event.target) && !btn.contains(event.target)) closePanel();
        });

        document.addEventListener('keydown', function (event) {
            if (event.key === 'Escape') closePanel();
        });

        panel.querySelectorAll('[data-theme-preset]').forEach(presetButton => {
            presetButton.addEventListener('click', function () {
                const preset = THEME_PRESETS.find(item => item.id === presetButton.dataset.themePreset);
                if (!preset) return;
                selectedTheme = clone(preset);
                saveLocalTheme(selectedTheme);
                fillInputs(selectedTheme);
                updatePanelSelection();
                setStatus(mainAdmin
                    ? `${preset.name} aktif sebagai pratinjau pribadi. Tekan “Terapkan untuk Semua Pengguna” untuk menjadikannya tema utama.`
                    : `${preset.name} aktif dan tersimpan lokal untuk akun ini.`, 'success');
            });
        });

        Object.values(fields).forEach(input => {
            input.addEventListener('input', function () {
                selectedTheme = readInputs();
                applyTheme(selectedTheme);
                updatePanelSelection();
                setStatus('Pratinjau warna kustom aktif. Simpan agar tetap digunakan setelah halaman ditutup.', 'info');
            });
        });

        document.getElementById('themeSaveLocal').addEventListener('click', function () {
            selectedTheme = readInputs();
            saveLocalTheme(selectedTheme);
            updatePanelSelection();
            setStatus('Tema kustom tersimpan di perangkat ini.', 'success');
        });

        document.getElementById('themeUseGlobal').addEventListener('click', function () {
            selectedTheme = clearLocalTheme();
            fillInputs(selectedTheme);
            updatePanelSelection();
            setStatus('Tema lokal dihapus. Sekarang menggunakan tema utama website.', 'success');
        });

        const publishButton = document.getElementById('themePublishGlobal');
        if (publishButton) {
            publishButton.addEventListener('click', async function () {
                if (!isMainAdmin(getSession())) {
                    setStatus('Hanya admin utama yang dapat menerapkan tema global.', 'error');
                    return;
                }
                publishButton.disabled = true;
                publishButton.textContent = 'Menerapkan...';
                setStatus('Menyimpan tema utama ke Google Spreadsheet...', 'info');
                try {
                    if (!window.PACloud || !PACloud.isConfigured()) {
                        throw new Error('Koneksi Google Apps Script belum aktif.');
                    }
                    await PACloud.syncTheme(selectedTheme);
                    selectedTheme = storeGlobalTheme(selectedTheme);
                    const key = userThemeKey(getSession());
                    if (key) localStorage.removeItem(key);
                    applyTheme(selectedTheme);
                    updatePanelSelection();
                    setStatus('Tema utama berhasil diterapkan untuk seluruh website dan semua pengguna.', 'success');
                } catch (error) {
                    console.error(error);
                    setStatus(error.message || 'Tema global gagal disimpan.', 'error');
                } finally {
                    publishButton.disabled = false;
                    publishButton.textContent = 'Terapkan untuk Semua Pengguna';
                }
            });
        }
    }

    applyTheme(getResolvedTheme());

    window.PATheme = {
        DEFAULT_THEME: clone(DEFAULT_THEME),
        PRESETS: clone(THEME_PRESETS),
        GLOBAL_THEME_KEY,
        applyTheme,
        getGlobalTheme,
        getLocalTheme,
        getResolvedTheme,
        receiveGlobalTheme,
        saveLocalTheme,
        clearLocalTheme,
        isMainAdmin,
        refresh: function () { return applyTheme(getResolvedTheme()); }
    };

    function initThemeUI() {
        initMobileNavigation();
        createThemePanel();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initThemeUI, { once: true });
    } else {
        initThemeUI();
    }
})();
