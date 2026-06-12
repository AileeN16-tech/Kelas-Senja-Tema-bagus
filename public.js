(function () {
    const REG_KEY = 'pa_public_registrations_v1';

    function isTutorShownOnHome(tutor) {
        return tutor && (
            tutor.showOnHome === true ||
            tutor.showOnHome === 'true' ||
            tutor.showOnHome === 1 ||
            tutor.showOnHome === '1' ||
            tutor.tampilBeranda === true ||
            tutor.tampilBeranda === 'true' ||
            tutor.tampilBeranda === 1 ||
            tutor.tampilBeranda === '1'
        );
    }

    function getTutorPhotoSrc(tutor) {
        if (window.PACloud && typeof PACloud.imageSrc === 'function') {
            return PACloud.imageSrc(tutor, 'foto');
        }
        return tutor.foto || '';
    }

    function renderPublicTutors() {
        const target = document.getElementById('publicTutorList');
        if (!target || !window.PAAuth) return;

        const allTutors = PAAuth.loadTutors();
        const tutors = allTutors.filter(isTutorShownOnHome);

        if (tutors.length === 0) {
            target.innerHTML = `
                <div class="pa-empty-card">
                    <div style="font-size:42px;">👨‍🏫</div>
                    <h3>Belum ada tutor yang ditampilkan</h3>
                    <p>Admin utama bisa memilih tutor dari Dashboard → Data Tutor → Tampilkan di Beranda.</p>
                    <a href="pendaftaran_tutor.html" class="cta-button">Daftar Tutor</a>
                </div>
            `;
            return;
        }

        target.innerHTML = tutors.map(tutor => `
            <div class="pa-public-tutor-card">
                <div class="pa-public-tutor-photo">
                    ${getTutorPhotoSrc(tutor) ? `<img src="${getTutorPhotoSrc(tutor)}" alt="${PAAuth.escapeHTML(tutor.nama)}">` : '<span>👤</span>'}
                </div>
                <h4>${PAAuth.escapeHTML(tutor.nama)}</h4>
                <p>${PAAuth.escapeHTML(tutor.mapel || '-')}</p>
                <small>${PAAuth.escapeHTML(tutor.jenjang || '-')}</small>
            </div>
        `).join('');
    }

    function showResult(message, type) {
        const box = document.getElementById('publicDaftarResult');
        if (!box) return;
        box.style.display = 'block';
        box.style.borderLeft = type === 'ok' ? '5px solid #25D366' : '5px solid #c0392b';
        box.innerHTML = message;
    }

    function initPublicRegistration() {
        const form = document.getElementById('formDaftarSiswaUmum');
        if (!form || !window.PAAuth || form.dataset.initialized === 'true') return;

        form.dataset.initialized = 'true';

        form.addEventListener('submit', async function (event) {
            event.preventDefault();

            const data = {
                id: PAAuth.makeId('pendaftar'),
                namaSiswa: document.getElementById('publicNamaSiswa').value.trim(),
                namaOrtu: document.getElementById('publicNamaOrtu').value.trim(),
                waOrtu: PAAuth.normalizeWA(document.getElementById('publicWaOrtu').value.trim()),
                email: document.getElementById('publicEmail').value.trim(),
                jenjang: document.getElementById('publicJenjang').value,
                catatan: document.getElementById('publicCatatan').value.trim(),
                status: 'Baru',
                createdAt: new Date().toISOString()
            };

            if (!data.namaSiswa || !data.namaOrtu || !data.waOrtu || !data.jenjang) {
                showResult('<strong>Data belum lengkap.</strong><br>Nama siswa, nama orang tua, nomor WA, dan jenjang wajib diisi.', 'error');
                return;
            }

            const submitBtn = form.querySelector('button[type="submit"]');
            const oldText = submitBtn ? submitBtn.textContent : '';
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = 'Mengirim pendaftaran...';
            }

            try {
                if (window.PACloud && typeof PACloud.upsertRecordNow === 'function') {
                    await PACloud.upsertRecordNow(REG_KEY, data, {
                        uploadText: 'Mengirim pendaftaran online...',
                        successText: 'Pendaftaran terkirim online ✅'
                    });
                } else {
                    const registrations = PAAuth.loadJSON(REG_KEY, []);
                    registrations.unshift(data);
                    PAAuth.saveJSON(REG_KEY, registrations);
                }
            } catch (error) {
                console.error(error);
                showResult('<strong>Gagal mengirim pendaftaran.</strong><br>Cek koneksi atau URL Apps Script, lalu coba lagi.', 'error');
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = oldText;
                }
                return;
            }

            const pesan = `🎓 *Pendaftaran Siswa Baru Kelas Senja*\n\n` +
                `👦 Nama Siswa: ${data.namaSiswa}\n` +
                `👨‍👩‍👧 Orang Tua/Wali: ${data.namaOrtu}\n` +
                `📲 WA Orang Tua: ${data.waOrtu}\n` +
                `📧 Email: ${data.email || '-'}\n` +
                `🏫 Jenjang: ${data.jenjang}\n` +
                `📝 Catatan: ${data.catatan || '-'}\n\n` +
                `Mohon info pendaftaran selanjutnya. Terima kasih 🙏`;

            showResult(`
                <strong>Pendaftaran berhasil dikirim ✅</strong><br>
                Data tersimpan dan akan diproses admin.<br><br>
                <a class="cta-button" style="margin-top:0;" href="https://wa.me/6285930317914?text=${encodeURIComponent(pesan)}" target="_blank">Buka WhatsApp Admin</a>
            `, 'ok');

            form.reset();
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = oldText;
            }
        });
    }

    function initPublicPage() {
        renderPublicTutors();
        initPublicRegistration();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initPublicPage);
    } else {
        initPublicPage();
    }

    window.renderPublicTutors = renderPublicTutors;
})();
