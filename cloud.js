/*
  Kelas Senja Cloud Sync
  1) Deploy Code.gs sebagai Google Apps Script Web App.
  2) Tempel URL Web App di PA_CLOUD_CONFIG.SCRIPT_URL.
*/
(function () {
    const CONFIG = {
        SCRIPT_URL: 'PASTE_URL_WEB_APP_GOOGLE_APPS_SCRIPT_DI_SINI'
    };

    const KEY_TO_TABLE = {
        'pa_tutors_v3': 'tutors',
        'pa_students_v3': 'siswa',
        'pa_schedules_v3': 'jadwal',
        'pa_reports_v3': 'laporan',
        'pa_invoices_v1': 'invoice',
        'pa_gallery_v3': 'gallery',
        'pa_public_registrations_v1': 'pendaftar'
    };

    const TABLE_TO_KEY = Object.fromEntries(Object.entries(KEY_TO_TABLE).map(([key, table]) => [table, key]));
    const syncTimers = {};
    let isBooting = false;

    function isConfigured() {
        return CONFIG.SCRIPT_URL && !CONFIG.SCRIPT_URL.includes('PASTE_URL_WEB_APP');
    }

    function driveImageUrl(fileId, size = 1600) {
        if (!fileId) return '';
        return 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(fileId) + '&sz=w' + Number(size || 1600);
    }

    function imageSrc(item, field = 'src') {
        if (!item) return '';
        const fileId = item.fileId || item.fotoFileId || item.imageFileId || '';
        if (fileId) return driveImageUrl(fileId);
        return item[field] || item.url || item.data || '';
    }

    function showCloudStatus(text, type) {
        let el = document.getElementById('paCloudStatus');
        if (!el) {
            el = document.createElement('div');
            el.id = 'paCloudStatus';
            el.style.position = 'fixed';
            el.style.left = '18px';
            el.style.bottom = '18px';
            el.style.zIndex = '999999';
            el.style.padding = '10px 14px';
            el.style.borderRadius = '8px';
            el.style.fontSize = '12px';
            el.style.boxShadow = '0 5px 18px rgba(0,0,0,0.18)';
            el.style.transition = '0.25s';
            document.body.appendChild(el);
        }
        el.textContent = text;
        el.style.background = type === 'ok' ? '#25D366' : type === 'error' ? '#c0392b' : '#333';
        el.style.color = '#fff';
        el.style.opacity = '1';
        clearTimeout(el._timer);
        el._timer = setTimeout(() => { el.style.opacity = '0'; }, 2800);
    }

    async function request(action, payload = {}, options = {}) {
        if (!isConfigured()) {
            const error = new Error('URL Google Apps Script belum diisi di cloud.js');
            error.code = 'CLOUD_NOT_CONFIGURED';
            throw error;
        }

        const session = window.PAAuth && typeof PAAuth.getSession === 'function' ? PAAuth.getSession() : null;
        const requestBody = { action, ...payload };
        if (!options.skipToken && !requestBody.token && session && session.token) {
            requestBody.token = session.token;
        }

        const response = await fetch(CONFIG.SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(requestBody)
        });

        const text = await response.text();
        let result;
        try {
            result = JSON.parse(text);
        } catch (error) {
            throw new Error('Response Apps Script bukan JSON: ' + text.slice(0, 180));
        }

        if (!result.ok) {
            const error = new Error(result.message || 'Request gagal');
            error.code = result.code || 'REQUEST_FAILED';
            throw error;
        }

        return result;
    }

    function loadScript(src) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.onload = resolve;
            script.onerror = reject;
            document.body.appendChild(script);
        });
    }

    async function boot(options = {}) {
        patchPAAuth();
        const publicOnly = options.publicOnly === true;

        if (!isConfigured()) {
            console.warn('PACloud: URL Apps Script belum diisi.');
            if (!publicOnly) {
                showCloudStatus('Dashboard membutuhkan koneksi Google Spreadsheet.', 'error');
            }
            return { offline: true };
        }

        if (!publicOnly) {
            const session = window.PAAuth && PAAuth.getSession ? PAAuth.getSession() : null;
            if (!session || !session.token) {
                window.location.href = 'login.html';
                return { unauthorized: true };
            }
        }

        isBooting = true;
        try {
            const result = await request(publicOnly ? 'getPublic' : 'getAll', {}, { skipToken: publicOnly });
            const data = result.data || {};

            Object.keys(TABLE_TO_KEY).forEach(table => {
                if (!Object.prototype.hasOwnProperty.call(data, table)) return;
                const key = TABLE_TO_KEY[table];
                localStorage.setItem(key, JSON.stringify(data[table] || []));
            });

            if (data.theme) {
                if (window.PATheme && typeof PATheme.receiveGlobalTheme === 'function') {
                    PATheme.receiveGlobalTheme(data.theme);
                } else {
                    localStorage.setItem('pa_theme_global_v2', JSON.stringify(data.theme));
                    localStorage.setItem('pa_theme_v1', JSON.stringify(data.theme));
                }
            }

            localStorage.setItem('pa_last_cloud_sync', new Date().toISOString());
            showCloudStatus(publicOnly ? 'Data publik tersinkron ✅' : 'Data online tersinkron ✅', 'ok');
            return data;
        } catch (error) {
            console.error(error);
            if (!publicOnly && (error.code === 'UNAUTHORIZED' || error.code === 'FORBIDDEN')) {
                if (window.PAAuth && PAAuth.clearSession) PAAuth.clearSession();
                showCloudStatus('Sesi habis. Silakan login kembali.', 'error');
                setTimeout(() => { window.location.href = 'login.html'; }, 700);
                return { unauthorized: true, error: error.message };
            }
            showCloudStatus(publicOnly ? 'Gagal memuat data publik' : 'Gagal terhubung ke spreadsheet', 'error');
            return { offline: true, error: error.message };
        } finally {
            isBooting = false;
        }
    }

    function patchPAAuth() {
        if (!window.PAAuth || window.PAAuth.__cloudPatched) return;
        window.PAAuth.__cloudPatched = true;

        const originalSaveJSON = window.PAAuth.saveJSON;
        window.PAAuth.saveJSON = function (key, value) {
            originalSaveJSON(key, value);
            if (!isBooting) syncKey(key, value);
        };

        window.PAAuth.saveTutors = function (tutors) {
            window.PAAuth.saveJSON(window.PAAuth.TUTOR_KEY, tutors);
        };
    }

    async function saveKeyNow(key, value, options = {}) {
        const table = KEY_TO_TABLE[key];
        const records = Array.isArray(value) ? value : [];

        if (!table) {
            localStorage.setItem(key, JSON.stringify(value));
            return value;
        }

        if (!isConfigured()) {
            localStorage.setItem(key, JSON.stringify(records));
            if (options.toast !== false) {
                showCloudStatus('Disimpan lokal saja. Isi URL Apps Script agar sinkron online.', 'error');
            }
            return records;
        }

        clearTimeout(syncTimers[table]);
        showCloudStatus(options.uploadText || 'Menyimpan online...', 'info');
        const result = await request('saveTable', { table, records });
        const savedRecords = result.records || records;
        localStorage.setItem(key, JSON.stringify(savedRecords));
        showCloudStatus(options.successText || 'Data tersimpan online ✅', 'ok');
        return savedRecords;
    }

    async function upsertRecordNow(key, record, options = {}) {
        const table = KEY_TO_TABLE[key];
        if (!table) {
            localStorage.setItem(key, JSON.stringify(record));
            return record;
        }

        const list = (() => {
            try { return JSON.parse(localStorage.getItem(key) || '[]'); }
            catch { return []; }
        })();

        if (!isConfigured()) {
            const next = [record, ...list.filter(item => item && item.id !== record.id)];
            localStorage.setItem(key, JSON.stringify(next));
            if (options.toast !== false) {
                showCloudStatus('Disimpan lokal saja. Isi URL Apps Script agar sinkron online.', 'error');
            }
            return record;
        }

        showCloudStatus(options.uploadText || 'Menyimpan online...', 'info');
        const result = await request('upsertRecord', { table, record });
        const savedRecord = result.record || record;
        const next = [savedRecord, ...list.filter(item => item && item.id !== savedRecord.id)];
        localStorage.setItem(key, JSON.stringify(next));
        showCloudStatus(options.successText || 'Data tersimpan online ✅', 'ok');
        return savedRecord;
    }

    async function deleteRecordNow(key, id, options = {}) {
        const table = KEY_TO_TABLE[key];
        const list = (() => {
            try { return JSON.parse(localStorage.getItem(key) || '[]'); }
            catch { return []; }
        })();

        if (!table) {
            const next = list.filter(item => item && item.id !== id);
            localStorage.setItem(key, JSON.stringify(next));
            return next;
        }

        if (!isConfigured()) {
            const next = list.filter(item => item && item.id !== id);
            localStorage.setItem(key, JSON.stringify(next));
            if (options.toast !== false) {
                showCloudStatus('Dihapus lokal saja. Isi URL Apps Script agar sinkron online.', 'error');
            }
            return next;
        }

        showCloudStatus(options.uploadText || 'Menghapus online...', 'info');
        const result = await request('deleteRecord', { table, id });
        const records = result.records || list.filter(item => item && item.id !== id);
        localStorage.setItem(key, JSON.stringify(records));
        showCloudStatus(options.successText || 'Data terhapus online ✅', 'ok');
        return records;
    }

    async function approvePendaftarNow(registrationId, tutorId, options = {}) {
        if (!registrationId || !tutorId) throw new Error('Pendaftar dan tutor wajib dipilih.');

        const siswaKey = TABLE_TO_KEY.siswa;
        const pendaftarKey = TABLE_TO_KEY.pendaftar;
        const siswaLocal = (() => {
            try { return JSON.parse(localStorage.getItem(siswaKey) || '[]'); }
            catch { return []; }
        })();
        const pendaftarLocal = (() => {
            try { return JSON.parse(localStorage.getItem(pendaftarKey) || '[]'); }
            catch { return []; }
        })();

        if (!isConfigured()) {
            const item = pendaftarLocal.find(row => row && row.id === registrationId);
            if (!item) throw new Error('Data pendaftar tidak ditemukan.');
            const siswa = {
                id: 'siswa-' + Date.now() + '-' + Math.random().toString(16).slice(2),
                nama: item.namaSiswa || '',
                kelas: item.jenjang || '',
                ortu: item.namaOrtu || '',
                wa: item.waOrtu || '',
                email: item.email || '',
                tutorId,
                catatan: item.catatan || '',
                asalPendaftaranId: item.id,
                createdAt: new Date().toISOString(),
                approvedAt: new Date().toISOString()
            };
            localStorage.setItem(siswaKey, JSON.stringify([siswa, ...siswaLocal]));
            localStorage.setItem(pendaftarKey, JSON.stringify(pendaftarLocal.filter(row => row && row.id !== registrationId)));
            showCloudStatus('Disetujui lokal. Isi URL Apps Script agar sinkron online.', 'error');
            return { siswa, pendaftar: pendaftarLocal.filter(row => row && row.id !== registrationId) };
        }

        showCloudStatus(options.uploadText || 'Menyetujui pendaftar...', 'info');
        const result = await request('approvePendaftar', { registrationId, tutorId });
        const siswa = result.siswa;
        if (siswa) {
            localStorage.setItem(siswaKey, JSON.stringify([siswa, ...siswaLocal.filter(row => row && row.id !== siswa.id)]));
        }
        if (Array.isArray(result.pendaftar)) {
            localStorage.setItem(pendaftarKey, JSON.stringify(result.pendaftar));
        }
        showCloudStatus(options.successText || 'Pendaftar disetujui dan masuk Data Siswa ✅', 'ok');
        return result;
    }

    async function resetPassword(username, identity, newPassword) {
        const result = await request('resetPassword', { username, identity, newPassword }, { skipToken: true });
        return result.result || { success: false };
    }

    async function registerTutor(record, options = {}) {
        if (!isConfigured()) throw new Error('Pendaftaran tutor membutuhkan koneksi Google Spreadsheet.');
        showCloudStatus(options.uploadText || 'Menyimpan pendaftaran tutor...', 'info');
        const result = await request('registerTutor', { record }, { skipToken: true });
        const tutor = result.tutor;
        showCloudStatus(options.successText || 'Akun tutor tersimpan online ✅', 'ok');
        return tutor;
    }

    function syncKey(key, value) {
        const table = KEY_TO_TABLE[key];
        if (!table || !isConfigured()) return;

        clearTimeout(syncTimers[table]);
        syncTimers[table] = setTimeout(async () => {
            try {
                await saveKeyNow(key, value, { toast: true, uploadText: 'Menyimpan online...', successText: 'Data tersimpan online ✅' });
            } catch (error) {
                console.error(error);
                showCloudStatus('Gagal simpan online', 'error');
            }
        }, 650);
    }

    async function syncTheme(theme) {
        if (!isConfigured()) {
            const error = new Error('URL Google Apps Script belum diisi di cloud.js');
            error.code = 'CLOUD_NOT_CONFIGURED';
            throw error;
        }

        const session = window.PAAuth && PAAuth.getSession ? PAAuth.getSession() : null;
        const mainAdmin = window.PATheme && typeof PATheme.isMainAdmin === 'function'
            ? PATheme.isMainAdmin(session)
            : Boolean(session && session.role === 'admin' && String(session.userId || '') === 'admin-main');

        if (!mainAdmin) {
            const error = new Error('Hanya admin utama yang dapat menerapkan tema untuk semua pengguna.');
            error.code = 'FORBIDDEN';
            throw error;
        }

        try {
            const result = await request('saveTheme', { theme });
            showCloudStatus('Tema utama tersimpan online ✅', 'ok');
            return result.theme || theme;
        } catch (error) {
            console.error(error);
            showCloudStatus('Gagal menyimpan tema utama', 'error');
            throw error;
        }
    }

    async function fileBase64(fileId) {
        if (!fileId || !isConfigured()) return null;
        const result = await request('fileBase64', { fileId });
        return result.dataUrl || null;
    }

    async function forceSyncAll() {
        if (!isConfigured()) return;
        const tables = {};
        Object.entries(KEY_TO_TABLE).forEach(([key, table]) => {
            try { tables[table] = JSON.parse(localStorage.getItem(key) || '[]'); }
            catch { tables[table] = []; }
        });
        const session = window.PAAuth && PAAuth.getSession ? PAAuth.getSession() : null;
        const mainAdmin = window.PATheme && typeof PATheme.isMainAdmin === 'function'
            ? PATheme.isMainAdmin(session)
            : Boolean(session && session.role === 'admin' && String(session.userId || '') === 'admin-main');
        const theme = mainAdmin && window.PATheme && typeof PATheme.getGlobalTheme === 'function'
            ? PATheme.getGlobalTheme()
            : null;
        return request('saveAll', { tables, theme });
    }

    window.PACloud = {
        CONFIG,
        boot,
        request,
        loadScript,
        syncKey,
        saveKeyNow,
        upsertRecordNow,
        deleteRecordNow,
        approvePendaftarNow,
        resetPassword,
        registerTutor,
        syncTheme,
        fileBase64,
        forceSyncAll,
        driveImageUrl,
        imageSrc,
        isConfigured
    };
})();
