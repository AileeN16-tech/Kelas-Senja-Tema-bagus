(function () {
    'use strict';

    const form = document.getElementById('loginForm');
    const status = document.getElementById('loginStatus');
    if (!form || !status) return;

    const submitButton = form.querySelector('button[type="submit"]');
    const usernameInput = document.getElementById('loginUsername');
    const passwordInput = document.getElementById('loginPassword');
    const existing = PAAuth.getSession();
    const params = new URLSearchParams(window.location.search);
    const requestedFrom = params.get('from') || 'jadwal_laporan.html';
    const from = /^[a-zA-Z0-9_.-]+(?:\?[a-zA-Z0-9_=&%.-]*)?$/.test(requestedFrom)
        ? requestedFrom
        : 'jadwal_laporan.html';

    function setStatus(text, type) {
        status.textContent = text;
        status.className = 'pa-login-status ' + (type || '');
    }

    const lastUsername = PAAuth.getLastUsername ? PAAuth.getLastUsername() : '';
    if (lastUsername && usernameInput && !usernameInput.value) usernameInput.value = lastUsername;

    if (params.get('reset') === 'success') {
        setStatus('Password berhasil diperbarui. Silakan login dengan password baru.', 'success');
    } else if (existing && existing.token) {
        setStatus(`Sesi ${existing.nama} masih aktif. Membuka dashboard...`, 'success');
        window.location.replace(from);
        return;
    } else if (!PACloud.isConfigured()) {
        setStatus('Login online belum aktif. Isi URL Web App Google Apps Script pada file cloud.js terlebih dahulu.', 'error');
    } else {
        setStatus('Sesi login akan disimpan agar kunjungan berikutnya lebih cepat.', '');
    }

    form.addEventListener('submit', async function (event) {
        event.preventDefault();
        const username = usernameInput.value.trim();
        const password = passwordInput.value;

        submitButton.disabled = true;
        submitButton.textContent = 'Masuk...';
        setStatus('Memeriksa akun...', '');

        try {
            const result = await PAAuth.login(username, password);
            if (!result.success) {
                setStatus(result.message || 'Username atau password tidak sesuai.', 'error');
                passwordInput.focus();
                passwordInput.select();
                return;
            }

            setStatus('Login berhasil. Membuka dashboard...', 'success');
            window.location.replace(from);
        } catch (error) {
            console.error(error);
            setStatus(error.message || 'Tidak dapat terhubung ke sistem login.', 'error');
        } finally {
            submitButton.disabled = false;
            submitButton.textContent = 'Masuk';
        }
    });
})();
