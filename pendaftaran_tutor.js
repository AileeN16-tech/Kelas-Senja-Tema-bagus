(function () {
    const form = document.getElementById('formTutor');
    const previewBtn = document.getElementById('btnPreviewTutor');
    const resetBtn = document.getElementById('btnResetTutor');
    const preview = document.getElementById('tutorPreview');
    const fotoInput = document.getElementById('tutorFoto');
    const pilihFotoBtn = document.getElementById('btnPilihFoto');
    const fotoPreview = document.getElementById('tutorFotoPreview');
    const credentialCard = document.getElementById('credentialCard');

    if (!form) return;

    let tutorFotoData = '';

    function showToast(text, color = '#333') {
        let toast = document.getElementById('tutorToast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'tutorToast';
            toast.style.position = 'fixed';
            toast.style.right = '20px';
            toast.style.bottom = '20px';
            toast.style.background = color;
            toast.style.color = 'white';
            toast.style.padding = '14px 20px';
            toast.style.borderRadius = '8px';
            toast.style.boxShadow = '0 5px 15px rgba(0,0,0,0.2)';
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(25px)';
            toast.style.transition = '0.3s';
            toast.style.zIndex = '99999';
            document.body.appendChild(toast);
        }
        toast.textContent = text;
        toast.style.background = color;
        toast.style.opacity = '1';
        toast.style.transform = 'translateY(0)';
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(25px)';
        }, 2500);
    }

    function compressImage(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = function (event) {
                const img = new Image();
                img.onload = function () {
                    const max = 650;
                    let width = img.width;
                    let height = img.height;
                    if (width > height && width > max) {
                        height = Math.round(height * max / width);
                        width = max;
                    } else if (height >= width && height > max) {
                        width = Math.round(width * max / height);
                        height = max;
                    }
                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    resolve(canvas.toDataURL('image/jpeg', 0.78));
                };
                img.onerror = reject;
                img.src = event.target.result;
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    function updateFotoPreview() {
        if (!tutorFotoData) {
            fotoPreview.innerHTML = '<span>👤</span>';
            return;
        }
        fotoPreview.innerHTML = `<img src="${tutorFotoData}" alt="Foto Tutor">`;
    }

    pilihFotoBtn.addEventListener('click', () => fotoInput.click());

    fotoInput.addEventListener('change', async function () {
        const file = fotoInput.files && fotoInput.files[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            showToast('File harus berupa gambar.', '#c0392b');
            return;
        }
        try {
            tutorFotoData = await compressImage(file);
            updateFotoPreview();
            showToast('Foto profil berhasil ditambahkan ✅', '#25D366');
        } catch (error) {
            showToast('Gagal membaca gambar.', '#c0392b');
        }
    });

    function getData() {
        return {
            nama: document.getElementById('tutorNama').value.trim(),
            wa: PAAuth.normalizeWA(document.getElementById('tutorWA').value.trim()),
            email: document.getElementById('tutorEmail').value.trim(),
            domisili: document.getElementById('tutorDomisili').value.trim(),
            pendidikan: document.getElementById('tutorPendidikan').value,
            mapel: document.getElementById('tutorMapel').value.trim(),
            jenjang: document.getElementById('tutorJenjang').value.trim(),
            pengalaman: document.getElementById('tutorPengalaman').value.trim(),
            jadwal: document.getElementById('tutorJadwal').value.trim(),
            foto: tutorFotoData
        };
    }

    function validate(data) {
        const wajib = [data.nama, data.wa, data.email, data.domisili, data.pendidikan, data.mapel, data.jenjang, data.pengalaman, data.jadwal];
        if (wajib.some(value => !value)) {
            showToast('Lengkapi data tutor terlebih dahulu ❌', '#c0392b');
            return false;
        }
        return true;
    }

    function renderPreview() {
        const data = getData();
        if (!validate(data)) return;

        preview.classList.add('show');
        preview.innerHTML = `
            <h3>Preview Data Tutor</h3>
            ${data.foto ? `<img src="${data.foto}" alt="${PAAuth.escapeHTML(data.nama)}" class="tutor-preview-photo">` : ''}
            <p><strong>Nama:</strong> ${PAAuth.escapeHTML(data.nama)}</p>
            <p><strong>WhatsApp:</strong> ${PAAuth.escapeHTML(data.wa)}</p>
            <p><strong>Email:</strong> ${PAAuth.escapeHTML(data.email)}</p>
            <p><strong>Domisili:</strong> ${PAAuth.escapeHTML(data.domisili)}</p>
            <p><strong>Pendidikan:</strong> ${PAAuth.escapeHTML(data.pendidikan)}</p>
            <p><strong>Mapel:</strong> ${PAAuth.escapeHTML(data.mapel)}</p>
            <p><strong>Jenjang:</strong> ${PAAuth.escapeHTML(data.jenjang)}</p>
            <p><strong>Pengalaman:</strong> ${PAAuth.escapeHTML(data.pengalaman)}</p>
            <p><strong>Jadwal:</strong> ${PAAuth.escapeHTML(data.jadwal)}</p>
        `;
        showToast('Preview berhasil dibuat 👁️', '#0056b3');
    }

    previewBtn.addEventListener('click', renderPreview);

    resetBtn.addEventListener('click', function () {
        form.reset();
        tutorFotoData = '';
        fotoInput.value = '';
        updateFotoPreview();
        preview.classList.remove('show');
        preview.innerHTML = '';
        credentialCard.style.display = 'none';
        credentialCard.innerHTML = '';
        showToast('Form tutor berhasil direset 🔄', '#777');
    });

    async function saveTutorOnline(tutor) {
        if (window.PACloud && typeof PACloud.registerTutor === 'function') {
            return await PACloud.registerTutor(tutor, {
                uploadText: 'Mengupload foto dan membuat akun tutor...',
                successText: 'Data tutor tersimpan online ✅'
            });
        }
        throw new Error('Pendaftaran tutor online belum dikonfigurasi.');
    }

    form.addEventListener('submit', async function (event) {
        event.preventDefault();
        const data = getData();
        if (!validate(data)) return;

        const tutor = {
            id: PAAuth.makeId('tutor'),
            ...data,
            showOnHome: false,
            tampilBeranda: false,
            createdAt: new Date().toISOString()
        };

        const submitBtn = form.querySelector('button[type="submit"]');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Menyimpan online...';
        }

        let savedTutor = tutor;
        try {
            savedTutor = await saveTutorOnline(tutor);
        } catch (error) {
            console.error(error);
            showToast('Gagal menyimpan data tutor online. Coba lagi.', '#c0392b');
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = '✅ Daftar & Buat Akun';
            }
            return;
        }

        credentialCard.style.display = 'block';
        credentialCard.innerHTML = `
            <h3>✅ Akun Tutor Berhasil Dibuat</h3>
            <p>Simpan username dan password ini untuk login ke halaman laporan harian.</p>
            <div class="pa-credential-row"><span>Username</span><strong>${PAAuth.escapeHTML(savedTutor.username)}</strong></div>
            <div class="pa-credential-row"><span>Password</span><strong>${PAAuth.escapeHTML(savedTutor.password)}</strong></div>
            <div class="pa-credential-actions">
                <button type="button" class="tutor-secondary-btn" id="copyCredential">Salin Login</button>
                <a href="login.html" class="cta-button">Login Sekarang</a>
            </div>
        `;

        document.getElementById('copyCredential').addEventListener('click', function () {
            navigator.clipboard.writeText(`Username: ${savedTutor.username}\nPassword: ${savedTutor.password}`);
            showToast('Username dan password disalin ✅', '#25D366');
        });

        const message = `👨‍🏫 *Pendaftaran Tutor Kelas Senja*\n\n` +
            `Nama: ${savedTutor.nama}\n` +
            `WhatsApp: ${savedTutor.wa}\n` +
            `Email: ${savedTutor.email}\n` +
            `Domisili: ${savedTutor.domisili}\n` +
            `Pendidikan: ${savedTutor.pendidikan}\n` +
            `Mapel: ${savedTutor.mapel}\n` +
            `Jenjang: ${savedTutor.jenjang}\n\n` +
            `Username Login: ${savedTutor.username}\n` +
            `Password Login: ${savedTutor.password}\n\n` +
            `Pengalaman:\n${savedTutor.pengalaman}\n\n` +
            `Jadwal Tersedia:\n${savedTutor.jadwal}`;

        const adminWA = '6285930317914';
        const url = `https://wa.me/${adminWA}?text=${encodeURIComponent(message)}`;

        showToast('Akun tutor tersimpan online. Membuka WhatsApp... 📲', '#25D366');
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = '✅ Daftar & Buat Akun';
        }
        setTimeout(() => window.open(url, '_blank'), 700);
    });
})();
