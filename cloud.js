/*
  Kelas Senja Cloud Sync — local-first
  - Dashboard membaca dan menyimpan data dari cache akun terlebih dahulu.
  - Data baru dikirim/ditarik saat tombol "Sinkronkan" ditekan.
  - Halaman publik tetap dapat memakai sinkronisasi langsung untuk pendaftaran/galeri.
*/
(function () {
    'use strict';

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
    const QUEUE_PREFIX = 'pa_sync_queue_v3:';
    const LAST_SYNC_PREFIX = 'pa_last_cloud_sync_v2:';
    const DASHBOARD_TABLES = new Set(['tutors', 'siswa', 'jadwal', 'laporan', 'invoice', 'pendaftar']);
    let syncing = false;

    function isConfigured() {
        return Boolean(CONFIG.SCRIPT_URL && !CONFIG.SCRIPT_URL.includes('PASTE_URL_WEB_APP'));
    }

    function getSession() {
        return window.PAAuth && typeof PAAuth.getSession === 'function' ? PAAuth.getSession() : null;
    }

    function identity() {
        const session = getSession();
        if (window.PAAuth && typeof PAAuth.sessionIdentity === 'function') return PAAuth.sessionIdentity(session);
        return String((session && (session.userId || session.tutorId || session.username)) || 'guest').replace(/[^a-zA-Z0-9_-]/g, '_');
    }

    function queueStorageKey() {
        return QUEUE_PREFIX + identity();
    }

    function lastSyncStorageKey() {
        return LAST_SYNC_PREFIX + identity();
    }

    function safeJSON(value, fallback) {
        try {
            const parsed = JSON.parse(value);
            return parsed === null || parsed === undefined ? fallback : parsed;
        } catch (error) {
            return fallback;
        }
    }

    function getQueue() {
        const value = safeJSON(localStorage.getItem(queueStorageKey()) || '[]', []);
        return Array.isArray(value) ? value.filter(item => item && DASHBOARD_TABLES.has(item.table)) : [];
    }

    function setQueue(queue) {
        const safeQueue = Array.isArray(queue) ? queue.filter(item => item && DASHBOARD_TABLES.has(item.table)) : [];
        localStorage.setItem(queueStorageKey(), JSON.stringify(safeQueue));
        emitSyncState();
        return safeQueue;
    }

    function queueOperation(operation) {
        if (!operation || !DASHBOARD_TABLES.has(operation.table)) return getQueue();
        const id = String(operation.id || (operation.record && operation.record.id) || '');
        if (!id) return getQueue();
        const queueId = operation.table + ':' + id;
        const next = getQueue().filter(item => item.queueId !== queueId);
        next.push({
            queueId,
            table: operation.table,
            type: operation.type === 'delete' ? 'delete' : 'upsert',
            id,
            record: operation.type === 'delete' ? undefined : operation.record,
            queuedAt: new Date().toISOString()
        });
        return setQueue(next);
    }

    function queueTableDiff(table, previousRecords, nextRecords) {
        if (!DASHBOARD_TABLES.has(table)) return;
        const previous = Array.isArray(previousRecords) ? previousRecords : [];
        const next = Array.isArray(nextRecords) ? nextRecords : [];
        const oldMap = new Map(previous.filter(item => item && item.id).map(item => [String(item.id), item]));
        const newMap = new Map(next.filter(item => item && item.id).map(item => [String(item.id), item]));

        oldMap.forEach((item, id) => {
            if (!newMap.has(id)) queueOperation({ table, type: 'delete', id });
        });
        newMap.forEach((item, id) => {
            const oldItem = oldMap.get(id);
            if (!oldItem || JSON.stringify(oldItem) !== JSON.stringify(item)) {
                queueOperation({ table, type: 'upsert', id, record: item });
            }
        });
    }

    function getDirtyTables() {
        return [...new Set(getQueue().map(item => item.table))];
    }

    function markDirty(keyOrTable) {
        const table = KEY_TO_TABLE[keyOrTable] || keyOrTable;
        const key = TABLE_TO_KEY[table];
        if (!DASHBOARD_TABLES.has(table) || !key) return getDirtyTables();
        readDashboardLocal(key).forEach(record => {
            if (record && record.id) queueOperation({ table, type: 'upsert', id: record.id, record });
        });
        return getDirtyTables();
    }

    function clearDirty(tables) {
        const remove = new Set(tables || getDirtyTables());
        setQueue(getQueue().filter(item => !remove.has(item.table)));
        return getDirtyTables();
    }

    function removeQueuedOperation(queueId) {
        setQueue(getQueue().filter(item => item.queueId !== queueId));
    }

    function getLastSync() {
        return localStorage.getItem(lastSyncStorageKey()) || '';
    }

    function setLastSync(value) {
        localStorage.setItem(lastSyncStorageKey(), value || new Date().toISOString());
        emitSyncState();
    }

    function getSyncState() {
        const dirtyTables = getDirtyTables();
        return {
            dirtyTables,
            pendingCount: dirtyTables.length,
            pendingOperations: getQueue().length,
            lastSync: getLastSync(),
            configured: isConfigured(),
            syncing
        };
    }

    function emitSyncState(extra) {
        window.dispatchEvent(new CustomEvent('pa-sync-state', { detail: { ...getSyncState(), ...(extra || {}) } }));
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
            el.className = 'pa-cloud-toast';
            el.setAttribute('role', 'status');
            el.setAttribute('aria-live', 'polite');
            document.body.appendChild(el);
        }
        el.textContent = text;
        el.dataset.type = type || 'info';
        el.classList.add('show');
        clearTimeout(el._hideTimer);
        el._hideTimer = setTimeout(() => el.classList.remove('show'), type === 'error' ? 4200 : 2500);
    }

    async function request(action, payload = {}, options = {}) {
        if (!isConfigured()) {
            const error = new Error('URL Google Apps Script belum diisi pada cloud.js.');
            error.code = 'CLOUD_NOT_CONFIGURED';
            throw error;
        }

        const session = getSession();
        const body = { action, ...payload };
        if (!options.skipToken && session && session.token && !body.token) body.token = session.token;

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), Number(options.timeout || 20000));
        try {
            const response = await fetch(CONFIG.SCRIPT_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify(body),
                signal: controller.signal,
                cache: 'no-store'
            });
            const result = await response.json();
            if (!result || result.ok !== true) {
                const error = new Error((result && result.message) || 'Permintaan ke server gagal.');
                error.code = (result && result.code) || 'REQUEST_FAILED';
                throw error;
            }
            return result;
        } catch (error) {
            if (error && error.name === 'AbortError') {
                const timeoutError = new Error('Koneksi terlalu lama. Coba tekan Sinkronkan lagi.');
                timeoutError.code = 'TIMEOUT';
                throw timeoutError;
            }
            throw error;
        } finally {
            clearTimeout(timeout);
        }
    }

    function loadScript(src) {
        return new Promise((resolve, reject) => {
            const existing = [...document.scripts].find(script => script.src && script.src.endsWith('/' + src));
            if (existing) {
                if (existing.dataset.loaded === 'true') resolve(existing);
                else existing.addEventListener('load', () => resolve(existing), { once: true });
                return;
            }
            const script = document.createElement('script');
            script.src = src;
            script.defer = true;
            script.addEventListener('load', () => {
                script.dataset.loaded = 'true';
                resolve(script);
            }, { once: true });
            script.addEventListener('error', reject, { once: true });
            document.body.appendChild(script);
        });
    }

    function readDashboardLocal(key) {
        if (window.PAAuth && typeof PAAuth.loadUserJSON === 'function') return PAAuth.loadUserJSON(key, []);
        return safeJSON(localStorage.getItem(key) || '[]', []);
    }

    function writeDashboardLocal(key, value) {
        if (window.PAAuth && typeof PAAuth.saveUserJSON === 'function') return PAAuth.saveUserJSON(key, value);
        localStorage.setItem(key, JSON.stringify(value));
        return value;
    }

    function readPublicLocal(key) {
        return window.PAAuth && typeof PAAuth.loadJSON === 'function'
            ? PAAuth.loadJSON(key, [])
            : safeJSON(localStorage.getItem(key) || '[]', []);
    }

    function writePublicLocal(key, value) {
        if (window.PAAuth && typeof PAAuth.saveJSON === 'function') return PAAuth.saveJSON(key, value);
        localStorage.setItem(key, JSON.stringify(value));
        return value;
    }

    function isDashboardLocalFirst(key) {
        const table = KEY_TO_TABLE[key];
        return Boolean(getSession() && DASHBOARD_TABLES.has(table));
    }

    function saveLocalTable(key, value, options = {}) {
        const table = KEY_TO_TABLE[key];
        const records = Array.isArray(value) ? value : [];
        const previous = readDashboardLocal(key);
        writeDashboardLocal(key, records);
        queueTableDiff(table, previous, records);
        if (options.toast !== false) showCloudStatus(options.localText || 'Tersimpan di perangkat • belum disinkronkan', 'local');
        return records;
    }

    async function saveKeyNow(key, value, options = {}) {
        const table = KEY_TO_TABLE[key];
        const records = Array.isArray(value) ? value : [];

        if (isDashboardLocalFirst(key)) return saveLocalTable(key, records, options);

        writePublicLocal(key, records);
        if (!table || !isConfigured()) return records;

        showCloudStatus(options.uploadText || 'Menyimpan online...', 'info');
        const result = await request('saveTable', { table, records });
        const savedRecords = result.records || records;
        writePublicLocal(key, savedRecords);
        showCloudStatus(options.successText || 'Data tersimpan online ✅', 'ok');
        return savedRecords;
    }

    async function upsertRecordNow(key, record, options = {}) {
        const table = KEY_TO_TABLE[key];
        const localFirst = isDashboardLocalFirst(key);
        const list = localFirst ? readDashboardLocal(key) : readPublicLocal(key);
        const next = [record, ...list.filter(item => item && item.id !== record.id)];

        if (localFirst) {
            saveLocalTable(key, next, options);
            return record;
        }

        writePublicLocal(key, next);
        if (!table || !isConfigured()) return record;

        showCloudStatus(options.uploadText || 'Menyimpan online...', 'info');
        const publicRegistration = !getSession() && table === 'pendaftar';
        const result = publicRegistration
            ? await request('registerStudent', { record }, { skipToken: true })
            : await request('upsertRecord', { table, record });
        const savedRecord = result.record || record;
        writePublicLocal(key, [savedRecord, ...list.filter(item => item && item.id !== savedRecord.id)]);
        showCloudStatus(options.successText || 'Data tersimpan online ✅', 'ok');
        return savedRecord;
    }

    async function deleteRecordNow(key, id, options = {}) {
        const table = KEY_TO_TABLE[key];
        const localFirst = isDashboardLocalFirst(key);
        const list = localFirst ? readDashboardLocal(key) : readPublicLocal(key);
        const next = list.filter(item => item && item.id !== id);

        if (localFirst) {
            saveLocalTable(key, next, options);
            return next;
        }

        writePublicLocal(key, next);
        if (!table || !isConfigured()) return next;

        showCloudStatus(options.uploadText || 'Menghapus online...', 'info');
        const result = await request('deleteRecord', { table, id });
        const records = result.records || next;
        writePublicLocal(key, records);
        showCloudStatus(options.successText || 'Data terhapus online ✅', 'ok');
        return records;
    }

    async function approvePendaftarNow(registrationId, tutorId, options = {}) {
        if (!registrationId || !tutorId) throw new Error('Pendaftar dan tutor wajib dipilih.');
        const siswaKey = TABLE_TO_KEY.siswa;
        const pendaftarKey = TABLE_TO_KEY.pendaftar;
        const siswaLocal = readDashboardLocal(siswaKey);
        const pendaftarLocal = readDashboardLocal(pendaftarKey);
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
        const remaining = pendaftarLocal.filter(row => row && row.id !== registrationId);
        saveLocalTable(siswaKey, [siswa, ...siswaLocal], { toast: false });
        saveLocalTable(pendaftarKey, remaining, { toast: false });
        showCloudStatus(options.localText || 'Pendaftar disetujui lokal • tekan Sinkronkan', 'local');
        return { siswa, pendaftar: remaining };
    }

    function storeCloudData(data, options = {}) {
        const payload = data || {};
        Object.keys(TABLE_TO_KEY).forEach(table => {
            if (!Object.prototype.hasOwnProperty.call(payload, table)) return;
            const key = TABLE_TO_KEY[table];
            if (DASHBOARD_TABLES.has(table) && getSession()) writeDashboardLocal(key, payload[table] || []);
            else writePublicLocal(key, payload[table] || []);
        });

        if (payload.theme) {
            if (window.PATheme && typeof PATheme.receiveGlobalTheme === 'function') PATheme.receiveGlobalTheme(payload.theme);
            else localStorage.setItem('pa_theme_global_v2', JSON.stringify(payload.theme));
        }

        if (options.markSynced !== false) setLastSync(new Date().toISOString());
        window.dispatchEvent(new CustomEvent('pa-cloud-data-updated', { detail: payload }));
        return payload;
    }

    async function boot(options = {}) {
        if (!options.publicOnly) {
            emitSyncState();
            return { localFirst: true, data: null };
        }
        if (!isConfigured()) return { offline: true, data: null };
        try {
            const result = await request('getPublic', {}, { skipToken: true });
            storeCloudData(result.data || {}, { markSynced: false });
            return result.data || {};
        } catch (error) {
            console.error(error);
            return { offline: true, error: error.message };
        }
    }

    async function syncNow(options = {}) {
        if (syncing) return null;
        const session = getSession();
        if (!session || !session.token) {
            const error = new Error('Silakan login kembali sebelum sinkronisasi.');
            error.code = 'UNAUTHORIZED';
            throw error;
        }
        if (!isConfigured()) {
            const error = new Error('URL Google Apps Script belum diisi di cloud.js.');
            error.code = 'CLOUD_NOT_CONFIGURED';
            throw error;
        }

        const dirty = getDirtyTables();
        syncing = true;
        emitSyncState({ syncing: true });
        showCloudStatus(dirty.length ? 'Mengirim perubahan lokal...' : 'Memeriksa data terbaru...', 'info');

        try {
            const queuedOperations = getQueue();
            for (const operation of queuedOperations) {
                if (operation.type === 'delete') {
                    await request('deleteRecord', { table: operation.table, id: operation.id });
                } else {
                    await request('upsertRecord', { table: operation.table, record: operation.record });
                }
                removeQueuedOperation(operation.queueId);
            }

            const result = await request('getAll');
            const data = storeCloudData(result.data || {});
            clearDirty();
            showCloudStatus('Sinkronisasi selesai ✅', 'ok');
            syncing = false;
            emitSyncState({ syncing: false, success: true });
            return data;
        } catch (error) {
            console.error(error);
            syncing = false;
            emitSyncState({ syncing: false, error: error.message });
            if (error.code === 'UNAUTHORIZED') {
                showCloudStatus('Sesi cloud habis. Login kembali untuk sinkronisasi.', 'error');
            } else {
                showCloudStatus(error.message || 'Sinkronisasi gagal.', 'error');
            }
            throw error;
        }
    }

    async function syncTheme(theme) {
        if (!isConfigured()) throw new Error('URL Google Apps Script belum diisi di cloud.js.');
        const session = getSession();
        const mainAdmin = window.PATheme && typeof PATheme.isMainAdmin === 'function'
            ? PATheme.isMainAdmin(session)
            : Boolean(session && session.role === 'admin' && String(session.userId || '') === 'admin-main');
        if (!mainAdmin) {
            const error = new Error('Hanya admin utama yang dapat menerapkan tema untuk semua pengguna.');
            error.code = 'FORBIDDEN';
            throw error;
        }
        const result = await request('saveTheme', { theme });
        showCloudStatus('Tema utama tersimpan online ✅', 'ok');
        return result.theme || theme;
    }

    async function resetPassword(username, identityValue, newPassword) {
        const result = await request('resetPassword', { username, identity: identityValue, newPassword }, { skipToken: true });
        return result.result || { success: false };
    }

    async function registerTutor(record, options = {}) {
        if (!isConfigured()) throw new Error('Pendaftaran tutor membutuhkan koneksi Google Spreadsheet.');
        showCloudStatus(options.uploadText || 'Menyimpan pendaftaran tutor...', 'info');
        const result = await request('registerTutor', { record }, { skipToken: true });
        showCloudStatus(options.successText || 'Akun tutor tersimpan online ✅', 'ok');
        return result.tutor;
    }

    async function fileBase64(fileId) {
        if (!fileId || !isConfigured()) return null;
        const result = await request('fileBase64', { fileId });
        return result.dataUrl || null;
    }

    // Kompatibilitas dengan kode lama: sekarang hanya menandai perubahan lokal.
    function syncKey(key) {
        markDirty(key);
    }

    function forceSyncAll() {
        return syncNow();
    }

    window.PACloud = {
        CONFIG,
        KEY_TO_TABLE,
        TABLE_TO_KEY,
        boot,
        request,
        loadScript,
        syncKey,
        saveLocalTable,
        saveKeyNow,
        upsertRecordNow,
        deleteRecordNow,
        approvePendaftarNow,
        resetPassword,
        registerTutor,
        syncTheme,
        syncNow,
        forceSyncAll,
        markDirty,
        clearDirty,
        getSyncState,
        getDirtyTables,
        getQueue,
        getLastSync,
        fileBase64,
        driveImageUrl,
        imageSrc,
        showCloudStatus,
        isConfigured
    };

    setTimeout(emitSyncState, 0);
})();
