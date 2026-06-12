(function () {
    const form = document.getElementById('forgotPasswordForm');
    const status = document.getElementById('forgotStatus');
    const submitButton = form.querySelector('button[type="submit"]');

    function setStatus(text, type) {
        status.textContent = text;
        status.className = 'pa-login-status ' + (type || '');
    }

    if (!PACloud.isConfigured()) {
        setStatus('Fitur lupa password belum aktif karena URL Web App Google Apps Script belum diisi di cloud.js.', 'error');
    }

    form.addEventListener('submit', async function (event) {
        event.preventDefault();
        const username = document.getElementById('forgotUsername').value.trim();
        const identity = document.getElementById('forgotIdentity').value.trim();
        const newPassword = document.getElementById('forgotNewPassword').value;
        const confirmPassword = document.getElementById('forgotConfirmPassword').value;

        if (newPassword.length < 6) {
            setStatus('Password baru minimal 6 karakter.', 'error');
            return;
        }
        if (newPassword !== confirmPassword) {
            setStatus('Konfirmasi password belum sama.', 'error');
            return;
        }

        submitButton.disabled = true;
        submitButton.textContent = 'Memeriksa Data...';
        setStatus('Mencocokkan akun dengan Google Spreadsheet...', '');

        try {
            const result = await PACloud.resetPassword(username, identity, newPassword);
            if (!result.success) {
                setStatus(result.message || 'Password belum dapat diperbarui.', 'error');
                return;
            }

            PAAuth.clearSession();
            form.reset();
            setStatus(result.message || 'Password berhasil diperbarui.', 'success');
            setTimeout(() => { window.location.href = 'login.html?reset=success'; }, 1500);
        } catch (error) {
            console.error(error);
            setStatus(error.message || 'Gagal memperbarui password.', 'error');
        } finally {
            submitButton.disabled = false;
            submitButton.textContent = 'Simpan Password Baru';
        }
    });
})();
