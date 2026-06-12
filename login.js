(function () {
    const form = document.getElementById('loginForm');
    const status = document.getElementById('loginStatus');
    const submitButton = form.querySelector('button[type="submit"]');
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

    if (params.get('reset') === 'success') {
        setStatus('Password berhasil diperbarui. Silakan login dengan password baru.', 'success');
    } else if (!PACloud.isConfigured()) {
        setStatus('Login online belum aktif. Isi URL Web App Google Apps Script pada file cloud.js terlebih dahulu.', 'error');
    } else if (existing && existing.token) {
        setStatus(`Sudah login sebagai ${existing.nama}. Mengalihkan ke dashboard...`, 'success');
        setTimeout(() => { window.location.href = 'jadwal_laporan.html'; }, 700);
    }

    form.addEventListener('submit', async function (event) {
        event.preventDefault();
        const username = document.getElementById('loginUsername').value.trim();
        const password = document.getElementById('loginPassword').value;

        submitButton.disabled = true;
        submitButton.textContent = 'Memeriksa Spreadsheet...';
        setStatus('Mencocokkan username dan password dengan Google Spreadsheet...', '');

        try {
            const result = await PAAuth.login(username, password);
            if (!result.success) {
                setStatus(result.message || 'Username atau password tidak sesuai dengan data spreadsheet.', 'error');
                return;
            }

            setStatus('Login berhasil. Mengalihkan...', 'success');
            setTimeout(() => { window.location.href = from; }, 700);
        } catch (error) {
            console.error(error);
            setStatus(error.message || 'Tidak dapat terhubung ke sistem login.', 'error');
        } finally {
            submitButton.disabled = false;
            submitButton.textContent = 'Masuk';
        }
    });
})();
