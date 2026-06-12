(function () {
    const session = PAAuth.requireLogin();
    if (!session) return;

    const isAdmin = session.role === 'admin';
    const STORAGE = {
        tutors: 'pa_tutors_v3',
        siswa: 'pa_students_v3',
        laporan: 'pa_reports_v3',
        jadwal: 'pa_schedules_v3',
        invoice: 'pa_invoices_v1',
        pendaftar: 'pa_public_registrations_v1'
    };

    let tutors = PAAuth.loadTutors();
    let siswaData = PAAuth.loadJSON(STORAGE.siswa, []);
    let laporanData = PAAuth.loadJSON(STORAGE.laporan, []);
    let jadwalData = PAAuth.loadJSON(STORAGE.jadwal, []);
    let invoiceData = PAAuth.loadJSON(STORAGE.invoice, []);
    let pendaftarData = PAAuth.loadJSON(STORAGE.pendaftar, []);
    let selectedRating = 0;
    let selectedImages = [];
    let calendarDate = new Date();

    function saveSiswa() { PAAuth.saveJSON(STORAGE.siswa, siswaData); }
    function saveLaporan() { PAAuth.saveJSON(STORAGE.laporan, laporanData); }
    function saveJadwal() { PAAuth.saveJSON(STORAGE.jadwal, jadwalData); }
    function saveInvoice() { PAAuth.saveJSON(STORAGE.invoice, invoiceData); }
    function saveTutors() { PAAuth.saveTutors(tutors); }
    async function saveTutorsOnline() {
        if (window.PACloud && typeof PACloud.saveKeyNow === 'function') {
            tutors = await PACloud.saveKeyNow(STORAGE.tutors, tutors, {
                uploadText: 'Menyimpan pilihan tutor online...',
                successText: 'Pilihan tutor tersinkron ✅'
            });
            return tutors;
        }
        saveTutors();
        return tutors;
    }
    function savePendaftar() { PAAuth.saveJSON(STORAGE.pendaftar, pendaftarData); }

    function getTutorPhotoSrc(tutor) {
        if (window.PACloud && typeof PACloud.imageSrc === 'function') {
            return PACloud.imageSrc(tutor, 'foto');
        }
        return tutor && tutor.foto ? tutor.foto : '';
    }

    function showToast(message, color = '#333') {
        let toast = document.getElementById('paToast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'paToast';
            toast.className = 'pa-toast';
            document.body.appendChild(toast);
        }
        toast.textContent = message;
        toast.style.background = color;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 2600);
    }

    function toLocalISO(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    function formatTanggalID(dateString) {
        if (!dateString) return '-';
        const date = new Date(dateString + 'T00:00:00');
        return date.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    }

    function getTutor(id) {
        return tutors.find(tutor => tutor.id === id);
    }

    function getSiswa(id) {
        return siswaData.find(siswa => siswa.id === id);
    }

    function visibleStudents() {
        return isAdmin ? siswaData : siswaData.filter(siswa => siswa.tutorId === session.tutorId);
    }

    function visibleSchedules() {
        return isAdmin ? jadwalData : jadwalData.filter(jadwal => jadwal.tutorId === session.tutorId);
    }

    function visibleReports() {
        return isAdmin ? laporanData : laporanData.filter(laporan => laporan.tutorId === session.tutorId);
    }

    function applyRoleUI() {
        document.querySelectorAll('.admin-only').forEach(el => {
            el.style.display = isAdmin ? '' : 'none';
        });
        document.querySelectorAll('.tutor-only').forEach(el => {
            el.style.display = isAdmin ? 'none' : '';
        });
        const desc = document.getElementById('roleDescription');
        if (desc) {
            desc.textContent = isAdmin
                ? 'Admin utama bisa mengakses semua tutor, siswa, jadwal, invoice, laporan, statistik, dan download data.'
                : 'Tutor hanya melihat jadwal, siswa, dan laporan miliknya sendiri.';
        }
        const note = document.getElementById('siswaRoleNote');
        if (note) {
            note.textContent = isAdmin
                ? 'Admin utama bisa menambah siswa dan menentukan siswa tersebut dipegang tutor siapa.'
                : 'Daftar ini hanya berisi siswa yang sudah diberikan admin utama ke akun tutor ini.';
        }
    }

    function updateLiveDate() {
        const now = new Date();
        const tanggal = document.getElementById('paTanggalHariIni');
        const jam = document.getElementById('paJamHariIni');
        if (tanggal) tanggal.textContent = now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        if (jam) tanggal && (jam.textContent = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }));
    }

    function switchTab(tabName) {
        if ((tabName === 'tutor' || tabName === 'pendaftar' || tabName === 'invoice') && !isAdmin) return;
        document.querySelectorAll('.pa-tab').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tabName));
        document.querySelectorAll('.pa-panel').forEach(panel => panel.classList.toggle('active', panel.id === 'tab-' + tabName));
        if (tabName === 'jadwal') { renderCalendar(); renderTodaySchedule(); }
        if (tabName === 'laporan') { syncAllSelects(); }
        if (tabName === 'siswa') renderSiswa();
        if (tabName === 'invoice') { syncSiswaSelects(); renderInvoice(); }
        if (tabName === 'riwayat') renderRiwayat();
        if (tabName === 'statistik') renderStatistik();
        if (tabName === 'tutor') renderTutorAdmin();
        if (tabName === 'pendaftar') renderPendaftar();
    }

    document.querySelectorAll('.pa-tab').forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));

    /***********************
     * SELECTS
     ***********************/
    function option(value, label) {
        return `<option value="${PAAuth.escapeHTML(value)}">${PAAuth.escapeHTML(label)}</option>`;
    }

    function syncTutorSelects() {
        const empty = option('', '— Pilih Tutor —');
        const html = empty + tutors.map(tutor => option(tutor.id, `${tutor.nama} (${tutor.username})`)).join('');
        ['jadwalTutor', 'siswaTutor', 'lapTutor'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = html;
        });
    }

    function syncSiswaSelects() {
        const students = visibleStudents();
        const empty = option('', '— Pilih Siswa —');
        const html = empty + students.map(siswa => option(siswa.id, `${siswa.nama} - ${siswa.kelas || 'Tanpa kelas'}`)).join('');
        ['jadwalSiswa', 'lapSiswa', 'invoiceSiswa'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = html;
        });
    }

    function syncAllSelects() {
        tutors = PAAuth.loadTutors();
        syncTutorSelects();
        syncSiswaSelects();
    }

    /***********************
     * DATA SISWA
     ***********************/
    const formSiswa = document.getElementById('formSiswa');
    if (formSiswa && isAdmin) {
        formSiswa.addEventListener('submit', async function (event) {
            event.preventDefault();
            const id = document.getElementById('siswaId').value || PAAuth.makeId('siswa');
            const data = {
                id,
                nama: document.getElementById('siswaNama').value.trim(),
                kelas: document.getElementById('siswaKelas').value.trim(),
                ortu: document.getElementById('siswaOrtu').value.trim(),
                wa: PAAuth.normalizeWA(document.getElementById('siswaWA').value.trim()),
                tutorId: document.getElementById('siswaTutor').value,
                createdAt: new Date().toISOString()
            };

            if (!data.nama) return showToast('Nama siswa wajib diisi.', '#c0392b');
            if (!data.tutorId) return showToast('Pilih tutor yang memegang siswa ini.', '#c0392b');

            const submitBtn = formSiswa.querySelector('button[type="submit"]');
            if (submitBtn) submitBtn.disabled = true;

            try {
                if (window.PACloud && typeof PACloud.upsertRecordNow === 'function') {
                    const saved = await PACloud.upsertRecordNow(STORAGE.siswa, data, {
                        uploadText: 'Menyimpan siswa online...',
                        successText: 'Data siswa tersimpan online ✅'
                    });
                    const index = siswaData.findIndex(item => item.id === saved.id);
                    if (index >= 0) siswaData[index] = saved;
                    else siswaData.unshift(saved);
                } else {
                    const index = siswaData.findIndex(item => item.id === id);
                    if (index >= 0) siswaData[index] = data;
                    else siswaData.push(data);
                    saveSiswa();
                }
            } catch (error) {
                console.error(error);
                showToast('Gagal menyimpan siswa online.', '#c0392b');
                if (submitBtn) submitBtn.disabled = false;
                return;
            }

            if (submitBtn) submitBtn.disabled = false;
            formSiswa.reset();
            document.getElementById('siswaId').value = '';
            renderSiswa();
            syncSiswaSelects();
            renderStatistik();
            showToast('Data siswa berhasil disimpan ✅', '#25D366');
        });
    }

    const btnResetSiswa = document.getElementById('btnResetSiswa');
    if (btnResetSiswa) {
        btnResetSiswa.addEventListener('click', function () {
            formSiswa.reset();
            document.getElementById('siswaId').value = '';
        });
    }

    function renderSiswa() {
        const target = document.getElementById('daftarSiswa');
        if (!target) return;
        const students = visibleStudents();

        if (students.length === 0) {
            target.innerHTML = `<p class="pa-empty">${isAdmin ? 'Belum ada data siswa.' : 'Belum ada siswa yang diberikan admin ke akun tutor ini.'}</p>`;
            return;
        }

        target.innerHTML = students.map(siswa => {
            const tutor = getTutor(siswa.tutorId);
            return `
                <div class="pa-list-item">
                    <div>
                        <strong>${PAAuth.escapeHTML(siswa.nama)}</strong>
                        <span>${PAAuth.escapeHTML(siswa.kelas || '-')} · Ortu: ${PAAuth.escapeHTML(siswa.ortu || '-')} · WA: ${PAAuth.escapeHTML(siswa.wa || '-')} · Tutor: ${PAAuth.escapeHTML(tutor ? tutor.nama : '-')}</span>
                    </div>
                    ${isAdmin ? `
                    <div class="pa-list-actions">
                        <button type="button" data-edit-siswa="${siswa.id}">Edit</button>
                        <button type="button" data-delete-siswa="${siswa.id}">Hapus</button>
                    </div>` : ''}
                </div>
            `;
        }).join('');

        target.querySelectorAll('[data-edit-siswa]').forEach(btn => btn.addEventListener('click', () => editSiswa(btn.dataset.editSiswa)));
        target.querySelectorAll('[data-delete-siswa]').forEach(btn => btn.addEventListener('click', () => hapusSiswa(btn.dataset.deleteSiswa)));
    }

    function editSiswa(id) {
        const siswa = getSiswa(id);
        if (!siswa || !isAdmin) return;
        document.getElementById('siswaId').value = siswa.id;
        document.getElementById('siswaNama').value = siswa.nama || '';
        document.getElementById('siswaKelas').value = siswa.kelas || '';
        document.getElementById('siswaOrtu').value = siswa.ortu || '';
        document.getElementById('siswaWA').value = siswa.wa || '';
        document.getElementById('siswaTutor').value = siswa.tutorId || '';
        switchTab('siswa');
    }

    async function hapusSiswa(id) {
        if (!isAdmin || !confirm('Hapus data siswa ini?')) return;
        try {
            if (window.PACloud && typeof PACloud.deleteRecordNow === 'function') {
                siswaData = await PACloud.deleteRecordNow(STORAGE.siswa, id, {
                    uploadText: 'Menghapus siswa online...',
                    successText: 'Data siswa terhapus online ✅'
                });
            } else {
                siswaData = siswaData.filter(item => item.id !== id);
                saveSiswa();
            }
            renderSiswa();
            syncSiswaSelects();
            renderStatistik();
            showToast('Data siswa dihapus.', '#c0392b');
        } catch (error) {
            console.error(error);
            showToast('Gagal menghapus siswa online.', '#c0392b');
        }
    }

    /***********************
     * INVOICE & TAGIHAN
     ***********************/
    function formatRupiah(value) {
        const amount = Number(value || 0);
        return new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR',
            maximumFractionDigits: 0
        }).format(Number.isFinite(amount) ? amount : 0);
    }

    function invoiceCopyText(invoice) {
        return [
            'Assalamu’alaikum Ayah/Bunda,',
            '',
            'Berikut rincian tagihan bimbingan belajar Kelas Senja:',
            `Nama Siswa: ${invoice.namaSiswa || '-'}`,
            `Jumlah Sesi: ${Number(invoice.jumlahSesi || 0)} sesi`,
            `Total Tagihan: ${formatRupiah(invoice.total)}`,
            '',
            'Terima kasih telah mempercayakan proses belajar putra/putri Ayah/Bunda bersama Kelas Senja. 🙏'
        ].join('\n');
    }

    async function copyTextToClipboard(text) {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
            return;
        }

        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        const copied = document.execCommand('copy');
        textarea.remove();
        if (!copied) throw new Error('Browser tidak mengizinkan penyalinan otomatis.');
    }

    const formInvoice = document.getElementById('formInvoice');
    if (formInvoice && isAdmin) {
        formInvoice.addEventListener('submit', async function (event) {
            event.preventDefault();

            const siswaId = document.getElementById('invoiceSiswa').value;
            const siswa = getSiswa(siswaId);
            const jumlahSesi = Number(document.getElementById('invoiceJumlahSesi').value);
            const total = Number(document.getElementById('invoiceTotal').value);

            if (!siswa) return showToast('Pilih nama siswa terlebih dahulu.', '#c0392b');
            if (!Number.isInteger(jumlahSesi) || jumlahSesi < 1) return showToast('Jumlah sesi minimal 1.', '#c0392b');
            if (!Number.isFinite(total) || total <= 0) return showToast('Total tagihan harus lebih dari Rp0.', '#c0392b');

            const invoice = {
                id: PAAuth.makeId('invoice'),
                siswaId,
                namaSiswa: siswa.nama || '',
                jumlahSesi,
                total,
                lunas: false,
                createdAt: new Date().toISOString()
            };

            const submitBtn = formInvoice.querySelector('button[type="submit"]');
            if (submitBtn) submitBtn.disabled = true;

            try {
                if (window.PACloud && typeof PACloud.upsertRecordNow === 'function') {
                    const saved = await PACloud.upsertRecordNow(STORAGE.invoice, invoice, {
                        uploadText: 'Menyimpan tagihan online...',
                        successText: 'Tagihan tersimpan online ✅'
                    });
                    invoiceData = [saved, ...invoiceData.filter(item => item.id !== saved.id)];
                } else {
                    invoiceData.unshift(invoice);
                    saveInvoice();
                }

                formInvoice.reset();
                renderInvoice();
                showToast('Tagihan berhasil dibuat ✅', '#25D366');
            } catch (error) {
                console.error(error);
                showToast('Gagal menyimpan tagihan.', '#c0392b');
            } finally {
                if (submitBtn) submitBtn.disabled = false;
            }
        });
    }

    function renderInvoice() {
        const target = document.getElementById('invoiceList');
        const counter = document.getElementById('invoiceCount');
        if (!target) return;

        const invoices = [...invoiceData].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
        if (counter) counter.textContent = `${invoices.length} invoice`;

        if (invoices.length === 0) {
            target.innerHTML = `
                <div class="pa-invoice-empty">
                    <span class="pa-invoice-empty-icon" aria-hidden="true">🧾</span>
                    <strong>Belum ada invoice</strong>
                    <p>Buat tagihan pertama melalui formulir di samping.</p>
                </div>
            `;
            return;
        }

        target.innerHTML = invoices.map(invoice => {
            const isPaid = invoice.lunas === true || invoice.lunas === 'true';
            return `
                <article class="pa-invoice-item ${isPaid ? 'is-paid' : ''}">
                    <div class="pa-invoice-main">
                        <div class="pa-invoice-avatar" aria-hidden="true">${PAAuth.escapeHTML((invoice.namaSiswa || '?').trim().charAt(0).toUpperCase() || '?')}</div>
                        <div class="pa-invoice-info">
                            <div class="pa-invoice-name-row">
                                <h3>${PAAuth.escapeHTML(invoice.namaSiswa || 'Tanpa nama')}</h3>
                                <span class="pa-invoice-status ${isPaid ? 'is-paid' : ''}">${isPaid ? 'Lunas' : 'Belum Lunas'}</span>
                            </div>
                            <div class="pa-invoice-details">
                                <span><strong>${Number(invoice.jumlahSesi || 0)}</strong> sesi</span>
                                <span class="pa-invoice-total">${PAAuth.escapeHTML(formatRupiah(invoice.total))}</span>
                            </div>
                        </div>
                    </div>

                    <div class="pa-invoice-actions">
                        <button type="button" class="pa-invoice-paid-btn ${isPaid ? 'is-active' : ''}" data-toggle-invoice-paid="${PAAuth.escapeHTML(invoice.id)}" aria-pressed="${isPaid}">
                            <span class="pa-action-icon" aria-hidden="true">✓</span>
                            Sudah Lunas
                        </button>
                        <button type="button" class="pa-invoice-copy-btn" data-copy-invoice="${PAAuth.escapeHTML(invoice.id)}">
                            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 8h11v11H8z"></path><path d="M5 16H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v1"></path></svg>
                            Salin Tagihan
                        </button>
                        <button type="button" class="pa-invoice-delete-btn" data-delete-invoice="${PAAuth.escapeHTML(invoice.id)}" aria-label="Hapus tagihan ${PAAuth.escapeHTML(invoice.namaSiswa || '')}" title="Hapus tagihan">
                            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"></path><path d="M8 6V4h8v2"></path><path d="M19 6l-1 14H6L5 6"></path><path d="M10 11v5M14 11v5"></path></svg>
                        </button>
                    </div>
                </article>
            `;
        }).join('');

        target.querySelectorAll('[data-toggle-invoice-paid]').forEach(button => {
            button.addEventListener('click', () => toggleInvoicePaid(button.dataset.toggleInvoicePaid));
        });
        target.querySelectorAll('[data-copy-invoice]').forEach(button => {
            button.addEventListener('click', () => copyInvoice(button.dataset.copyInvoice));
        });
        target.querySelectorAll('[data-delete-invoice]').forEach(button => {
            button.addEventListener('click', () => deleteInvoice(button.dataset.deleteInvoice));
        });
    }

    async function toggleInvoicePaid(id) {
        if (!isAdmin) return;
        const current = invoiceData.find(item => item.id === id);
        if (!current) return;

        const updated = {
            ...current,
            lunas: !(current.lunas === true || current.lunas === 'true'),
            updatedAt: new Date().toISOString()
        };

        try {
            if (window.PACloud && typeof PACloud.upsertRecordNow === 'function') {
                const saved = await PACloud.upsertRecordNow(STORAGE.invoice, updated, {
                    uploadText: 'Memperbarui status pembayaran...',
                    successText: 'Status pembayaran diperbarui ✅'
                });
                invoiceData = invoiceData.map(item => item.id === id ? saved : item);
            } else {
                invoiceData = invoiceData.map(item => item.id === id ? updated : item);
                saveInvoice();
            }
            renderInvoice();
            showToast(updated.lunas ? 'Invoice ditandai sudah lunas ✅' : 'Status lunas dibatalkan.', updated.lunas ? '#25D366' : '#333');
        } catch (error) {
            console.error(error);
            showToast('Gagal memperbarui status invoice.', '#c0392b');
        }
    }

    async function copyInvoice(id) {
        const invoice = invoiceData.find(item => item.id === id);
        if (!invoice) return;
        try {
            await copyTextToClipboard(invoiceCopyText(invoice));
            showToast('Tagihan berhasil disalin 📋', '#25D366');
        } catch (error) {
            console.error(error);
            showToast('Tagihan tidak dapat disalin otomatis.', '#c0392b');
        }
    }

    async function deleteInvoice(id) {
        if (!isAdmin) return;
        const invoice = invoiceData.find(item => item.id === id);
        if (!invoice) return;
        if (!confirm(`Hapus tagihan atas nama ${invoice.namaSiswa || 'siswa ini'}?`)) return;

        try {
            if (window.PACloud && typeof PACloud.deleteRecordNow === 'function') {
                invoiceData = await PACloud.deleteRecordNow(STORAGE.invoice, id, {
                    uploadText: 'Menghapus tagihan online...',
                    successText: 'Tagihan berhasil dihapus ✅'
                });
            } else {
                invoiceData = invoiceData.filter(item => item.id !== id);
                saveInvoice();
            }
            renderInvoice();
            showToast('Tagihan berhasil dihapus.', '#c0392b');
        } catch (error) {
            console.error(error);
            showToast('Gagal menghapus tagihan.', '#c0392b');
        }
    }

    /***********************
     * JADWAL
     ***********************/
    const formJadwal = document.getElementById('formJadwal');
    if (formJadwal && isAdmin) {
        document.getElementById('jadwalTanggal').value = toLocalISO(new Date());
        formJadwal.addEventListener('submit', function (event) {
            event.preventDefault();
            const id = document.getElementById('jadwalId').value || PAAuth.makeId('jadwal');
            const siswaId = document.getElementById('jadwalSiswa').value;
            const siswa = getSiswa(siswaId);
            const item = {
                id,
                tanggal: document.getElementById('jadwalTanggal').value,
                jam: document.getElementById('jadwalJam').value,
                tutorId: document.getElementById('jadwalTutor').value,
                siswaId,
                siswa: siswa ? siswa.nama : '',
                mapel: document.getElementById('jadwalMapel').value.trim(),
                warna: document.getElementById('jadwalWarna').value,
                catatan: document.getElementById('jadwalCatatan').value.trim(),
                createdAt: new Date().toISOString()
            };

            if (!item.tanggal || !item.jam || !item.tutorId || !item.siswaId || !item.mapel) {
                return showToast('Lengkapi data jadwal terlebih dahulu.', '#c0392b');
            }

            const index = jadwalData.findIndex(jadwal => jadwal.id === id);
            if (index >= 0) jadwalData[index] = item;
            else jadwalData.push(item);

            saveJadwal();
            resetJadwalForm();
            renderCalendar();
            renderTodaySchedule();
            showToast('Jadwal berhasil disimpan ✅', '#25D366');
        });
    }

    const btnResetJadwal = document.getElementById('btnResetJadwal');
    if (btnResetJadwal) btnResetJadwal.addEventListener('click', resetJadwalForm);

    const btnHapusJadwal = document.getElementById('btnHapusJadwal');
    if (btnHapusJadwal) {
        btnHapusJadwal.addEventListener('click', function () {
            if (!isAdmin) return;
            const id = document.getElementById('jadwalId').value;
            if (!id) return showToast('Pilih jadwal yang ingin dihapus dulu.');
            if (!confirm('Hapus jadwal ini?')) return;
            jadwalData = jadwalData.filter(item => item.id !== id);
            saveJadwal();
            resetJadwalForm();
            renderCalendar();
            renderTodaySchedule();
            showToast('Jadwal dihapus.', '#c0392b');
        });
    }

    function resetJadwalForm() {
        if (!formJadwal) return;
        formJadwal.reset();
        document.getElementById('jadwalId').value = '';
        document.getElementById('jadwalTanggal').value = toLocalISO(new Date());
    }

    function editJadwal(id) {
        const item = jadwalData.find(jadwal => jadwal.id === id);
        if (!item) return;
        if (!isAdmin) {
            const tutor = getTutor(item.tutorId);
            alert(`${item.jam} · ${item.siswa}\n${item.mapel}\nTutor: ${tutor ? tutor.nama : '-'}\n${item.catatan || ''}`);
            return;
        }
        document.getElementById('jadwalId').value = item.id;
        document.getElementById('jadwalTanggal').value = item.tanggal;
        document.getElementById('jadwalJam').value = item.jam;
        document.getElementById('jadwalTutor').value = item.tutorId || '';
        document.getElementById('jadwalSiswa').value = item.siswaId || '';
        document.getElementById('jadwalMapel').value = item.mapel || '';
        document.getElementById('jadwalWarna').value = item.warna || 'pink';
        document.getElementById('jadwalCatatan').value = item.catatan || '';
        switchTab('jadwal');
        document.getElementById('jadwalFormCard').scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    function renderTodaySchedule() {
        const today = toLocalISO(new Date());
        const list = visibleSchedules().filter(item => item.tanggal === today).sort((a, b) => String(a.jam).localeCompare(String(b.jam)));
        const title = document.getElementById('todayScheduleTitle');
        const count = document.getElementById('todayScheduleCount');
        const target = document.getElementById('todayScheduleList');
        if (!target) return;
        title.textContent = formatTanggalID(today);
        count.textContent = list.length ? `${list.length} sesi mengajar hari ini` : 'Belum ada sesi mengajar hari ini';
        target.innerHTML = list.map(item => {
            const tutor = getTutor(item.tutorId);
            return `
                <div class="pa-today-item color-${PAAuth.escapeHTML(item.warna || 'pink')}">
                    <strong>${PAAuth.escapeHTML(item.jam)} · ${PAAuth.escapeHTML(item.siswa)}</strong>
                    <span>${PAAuth.escapeHTML(item.mapel)} ${isAdmin ? '· ' + PAAuth.escapeHTML(tutor ? tutor.nama : '-') : ''}</span>
                </div>
            `;
        }).join('') || '<p style="color:#ddd;">Tidak ada jadwal.</p>';
    }

    function renderCalendar() {
        const grid = document.getElementById('calendarGrid');
        const title = document.getElementById('calendarTitle');
        if (!grid || !title) return;

        const year = calendarDate.getFullYear();
        const month = calendarDate.getMonth();
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const startPad = firstDay.getDay();
        const totalDays = lastDay.getDate();
        const schedules = visibleSchedules();

        title.textContent = calendarDate.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
        let html = '';
        for (let i = 0; i < startPad; i++) html += '<div class="pa-calendar-day muted"></div>';

        for (let day = 1; day <= totalDays; day++) {
            const date = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const daySchedules = schedules.filter(item => item.tanggal === date).sort((a, b) => String(a.jam).localeCompare(String(b.jam)));
            html += `
                <div class="pa-calendar-day ${date === toLocalISO(new Date()) ? 'today' : ''}">
                    <div class="pa-day-num">${day}</div>
                    <div class="pa-day-events">
                        ${daySchedules.map(item => {
                            const tutor = getTutor(item.tutorId);
                            const label = isAdmin ? `${item.jam} ${item.siswa} · ${tutor ? tutor.nama : '-'}` : `${item.jam} ${item.siswa}`;
                            return `<button type="button" class="pa-event-dot color-${PAAuth.escapeHTML(item.warna || 'pink')}" data-edit-jadwal="${item.id}">${PAAuth.escapeHTML(label)}</button>`;
                        }).join('')}
                    </div>
                </div>
            `;
        }
        grid.innerHTML = html;
        grid.querySelectorAll('[data-edit-jadwal]').forEach(btn => btn.addEventListener('click', () => editJadwal(btn.dataset.editJadwal)));
    }

    const prevMonth = document.getElementById('prevMonth');
    const nextMonth = document.getElementById('nextMonth');
    const goToday = document.getElementById('goToday');
    if (prevMonth) prevMonth.addEventListener('click', () => { calendarDate.setMonth(calendarDate.getMonth() - 1); renderCalendar(); });
    if (nextMonth) nextMonth.addEventListener('click', () => { calendarDate.setMonth(calendarDate.getMonth() + 1); renderCalendar(); });
    if (goToday) goToday.addEventListener('click', () => { calendarDate = new Date(); renderCalendar(); });

    /***********************
     * LAPORAN
     ***********************/
    const formLaporan = document.getElementById('formLaporan');
    const lapSiswa = document.getElementById('lapSiswa');
    const lapTutor = document.getElementById('lapTutor');
    if (formLaporan) {
        document.getElementById('lapTanggal').value = toLocalISO(new Date());
        formLaporan.addEventListener('submit', function (event) {
            event.preventDefault();
            const data = getLaporanFormData();
            if (!data) return;

            const id = document.getElementById('laporanId').value || PAAuth.makeId('laporan');
            const laporan = { id, ...data, createdAt: new Date().toISOString() };
            const index = laporanData.findIndex(item => item.id === id);
            if (index >= 0) laporanData[index] = laporan;
            else laporanData.unshift(laporan);

            saveLaporan();
            resetLaporanForm();
            renderRiwayat();
            renderStatistik();
            showToast('Laporan harian berhasil disimpan ✅', '#25D366');
        });
    }

    if (lapSiswa) {
        lapSiswa.addEventListener('change', function () {
            const siswa = getSiswa(lapSiswa.value);
            if (!siswa) return;
            document.getElementById('lapKelas').value = siswa.kelas || '';
            if (isAdmin && lapTutor) lapTutor.value = siswa.tutorId || '';
        });
    }

    document.querySelectorAll('#lapRating button').forEach(btn => {
        btn.addEventListener('click', function () {
            selectedRating = Number(btn.dataset.star);
            updateRatingUI();
        });
    });

    function updateRatingUI() {
        document.querySelectorAll('#lapRating button').forEach(btn => btn.classList.toggle('active', Number(btn.dataset.star) <= selectedRating));
    }

    const lapGambar = document.getElementById('lapGambar');
    if (lapGambar) {
        lapGambar.addEventListener('change', async function () {
            const files = Array.from(lapGambar.files || []);
            for (const file of files) {
                if (!file.type.startsWith('image/')) continue;
                const data = await compressImage(file, 900);
                selectedImages.push({ id: PAAuth.makeId('img'), name: file.name, data });
            }
            lapGambar.value = '';
            renderImagePreview();
        });
    }

    function compressImage(file, max = 900) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = function (event) {
                const img = new Image();
                img.onload = function () {
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
                    canvas.getContext('2d').drawImage(img, 0, 0, width, height);
                    resolve(canvas.toDataURL('image/jpeg', 0.82));
                };
                img.onerror = reject;
                img.src = event.target.result;
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    function imageSrc(img) {
        if (window.PACloud && typeof PACloud.imageSrc === 'function') {
            return PACloud.imageSrc(img, 'src');
        }
        return (img && (img.data || img.src || img.url || img.directUrl || img.viewUrl)) || '';
    }

    async function imageBase64ForExcel(img) {
        if (!img) return null;
        if (img.data) return img.data;
        if (img.fileId && window.PACloud && PACloud.isConfigured()) {
            try {
                return await PACloud.fileBase64(img.fileId);
            } catch (error) {
                console.warn('Gagal mengambil gambar dari Drive', error);
                return null;
            }
        }
        return null;
    }

    function renderImagePreview() {
        const target = document.getElementById('lapImagePreview');
        if (!target) return;
        target.innerHTML = selectedImages.map(img => `
            <div class="pa-preview-img">
                <img src="${imageSrc(img)}" alt="${PAAuth.escapeHTML(img.name)}">
                <button type="button" data-remove-img="${img.id}">×</button>
            </div>
        `).join('');
        target.querySelectorAll('[data-remove-img]').forEach(btn => btn.addEventListener('click', function () {
            selectedImages = selectedImages.filter(img => img.id !== btn.dataset.removeImg);
            renderImagePreview();
        }));
    }

    function getLaporanFormData() {
        const siswa = getSiswa(document.getElementById('lapSiswa').value);
        if (!siswa) {
            showToast('Pilih siswa terlebih dahulu.', '#c0392b');
            return null;
        }
        const tutorId = isAdmin ? document.getElementById('lapTutor').value : session.tutorId;
        if (!tutorId) {
            showToast('Pilih tutor terlebih dahulu.', '#c0392b');
            return null;
        }
        const tutor = getTutor(tutorId);
        const mapel = document.getElementById('lapMapel').value.trim();
        const materi = document.getElementById('lapMateri').value.trim();
        if (!mapel || !materi) {
            showToast('Mata pelajaran dan materi wajib diisi.', '#c0392b');
            return null;
        }
        return {
            tutorId,
            tutorNama: tutor ? tutor.nama : '',
            siswaId: siswa.id,
            nama: siswa.nama,
            tanggal: document.getElementById('lapTanggal').value,
            mulai: document.getElementById('lapMulai').value,
            selesai: document.getElementById('lapSelesai').value,
            kehadiran: document.getElementById('lapKehadiran').value,
            kelas: document.getElementById('lapKelas').value.trim() || siswa.kelas || '',
            mapel,
            materi,
            aktivitas: document.getElementById('lapAktivitas').value.trim(),
            pr: document.getElementById('lapPR').value.trim(),
            nilai: document.getElementById('lapNilai').value,
            rating: selectedRating,
            catatan: document.getElementById('lapCatatan').value.trim(),
            images: selectedImages
        };
    }

    const btnPreviewLaporan = document.getElementById('btnPreviewLaporan');
    if (btnPreviewLaporan) btnPreviewLaporan.addEventListener('click', function () {
        const data = getLaporanFormData();
        if (data) renderPreviewLaporan(data);
    });

    const btnResetLaporan = document.getElementById('btnResetLaporan');
    if (btnResetLaporan) btnResetLaporan.addEventListener('click', resetLaporanForm);

    const btnKirimWa = document.getElementById('btnKirimWa');
    if (btnKirimWa) btnKirimWa.addEventListener('click', sendLaporanWA);

    function resetLaporanForm() {
        if (!formLaporan) return;
        formLaporan.reset();
        document.getElementById('laporanId').value = '';
        document.getElementById('lapTanggal').value = toLocalISO(new Date());
        selectedRating = 0;
        selectedImages = [];
        updateRatingUI();
        renderImagePreview();
        document.getElementById('previewLaporan').classList.remove('show');
        document.getElementById('previewLaporan').innerHTML = '';
        syncAllSelects();
    }

    function renderPreviewLaporan(data) {
        const target = document.getElementById('previewLaporan');
        target.classList.add('show');
        target.innerHTML = `
            <h3>Laporan Belajar Harian</h3>
            <div class="pa-preview-lines">
                <p><strong>Tentor:</strong> ${PAAuth.escapeHTML(data.tutorNama || '-')}</p>
                <p><strong>Nama Siswa:</strong> ${PAAuth.escapeHTML(data.nama)}</p>
                <p><strong>Tanggal:</strong> ${formatTanggalID(data.tanggal)}</p>
                <p><strong>Waktu:</strong> ${PAAuth.escapeHTML(data.mulai || '-')} - ${PAAuth.escapeHTML(data.selesai || '-')}</p>
                <p><strong>Kehadiran:</strong> ${PAAuth.escapeHTML(data.kehadiran)}</p>
                <p><strong>Kelas:</strong> ${PAAuth.escapeHTML(data.kelas || '-')}</p>
                <p><strong>Mapel:</strong> ${PAAuth.escapeHTML(data.mapel)}</p>
                <p><strong>Materi:</strong> ${PAAuth.escapeHTML(data.materi)}</p>
                <p><strong>Aktivitas:</strong> ${PAAuth.escapeHTML(data.aktivitas || '-')}</p>
                <p><strong>PR:</strong> ${PAAuth.escapeHTML(data.pr || '-')}</p>
                <p><strong>Nilai:</strong> ${PAAuth.escapeHTML(data.nilai || '-')}</p>
                <p><strong>Rating:</strong> ${'⭐'.repeat(data.rating || 0) || '-'}</p>
                <p><strong>Catatan:</strong> ${PAAuth.escapeHTML(data.catatan || '-')}</p>
            </div>
            ${data.images && data.images.length ? `<div class="pa-report-images">${data.images.map(img => `<img src="${imageSrc(img)}" alt="${PAAuth.escapeHTML(img.name || 'Gambar laporan')}">`).join('')}</div>` : ''}
        `;
        showToast('Preview laporan dibuat 👁️');
    }

    function sendLaporanWA() {
        const data = getLaporanFormData();
        if (!data) return;
        const siswa = getSiswa(data.siswaId);
        if (!siswa || !siswa.wa) return showToast('Nomor WA orang tua belum diisi di data siswa.', '#c0392b');
        const text = `Halo Ayah/Bunda 👋\n\nBerikut laporan belajar hari ini:\n\n` +
            `👨‍🏫 Tutor: ${data.tutorNama || '-'}\n` +
            `📚 Nama: ${data.nama}\n` +
            `🏫 Kelas: ${data.kelas || '-'}\n` +
            `📅 Tanggal: ${formatTanggalID(data.tanggal)}\n` +
            `⏰ Waktu: ${data.mulai || '-'} - ${data.selesai || '-'}\n` +
            `✅ Kehadiran: ${data.kehadiran}\n` +
            `📖 Mata Pelajaran: ${data.mapel}\n` +
            `⭐ Rating: ${'⭐'.repeat(data.rating || 0) || '-'}\n` +
            `📝 Materi: ${data.materi}\n` +
            `📌 Aktivitas: ${data.aktivitas || '-'}\n` +
            `🎯 Nilai: ${data.nilai || '-'}\n` +
            `📚 PR: ${data.pr || '-'}\n\n` +
            `💬 Catatan Guru:\n${data.catatan || '-'}\n\nTerima kasih 🙏`;
        window.open(`https://wa.me/${siswa.wa}?text=${encodeURIComponent(text)}`, '_blank');
    }

    /***********************
     * RIWAYAT
     ***********************/
    const searchRiwayat = document.getElementById('searchRiwayat');
    if (searchRiwayat) searchRiwayat.addEventListener('input', renderRiwayat);

    function renderRiwayat() {
        const target = document.getElementById('riwayatList');
        if (!target) return;
        const keyword = String(searchRiwayat ? searchRiwayat.value : '').toLowerCase();
        let reports = visibleReports();
        if (keyword) {
            reports = reports.filter(item => [item.nama, item.tutorNama, item.mapel, item.tanggal, item.materi].join(' ').toLowerCase().includes(keyword));
        }
        if (reports.length === 0) {
            target.innerHTML = '<p class="pa-empty">Belum ada riwayat laporan.</p>';
            return;
        }
        target.innerHTML = reports.map(item => `
            <div class="pa-list-item">
                <div>
                    <strong>${PAAuth.escapeHTML(item.nama)} · ${PAAuth.escapeHTML(item.mapel)}</strong>
                    <span>${formatTanggalID(item.tanggal)} · Tutor: ${PAAuth.escapeHTML(item.tutorNama || '-')} · Nilai: ${PAAuth.escapeHTML(item.nilai || '-')} · Gambar: ${(item.images || []).length}</span>
                </div>
                <div class="pa-list-actions">
                    <button type="button" data-preview-report="${item.id}">Preview</button>
                    <button type="button" data-send-report="${item.id}">WA</button>
                    <button type="button" data-delete-report="${item.id}">Hapus</button>
                </div>
            </div>
        `).join('');
        target.querySelectorAll('[data-preview-report]').forEach(btn => btn.addEventListener('click', () => {
            const item = laporanData.find(r => r.id === btn.dataset.previewReport);
            if (item) { switchTab('laporan'); renderPreviewLaporan(item); document.getElementById('previewLaporan').scrollIntoView({ behavior: 'smooth' }); }
        }));
        target.querySelectorAll('[data-send-report]').forEach(btn => btn.addEventListener('click', () => {
            const item = laporanData.find(r => r.id === btn.dataset.sendReport);
            if (!item) return;
            const siswa = getSiswa(item.siswaId);
            if (!siswa || !siswa.wa) return showToast('Nomor WA orang tua belum ada.', '#c0392b');
            const text = `Halo Ayah/Bunda 👋\n\nLaporan belajar ${item.nama}:\n${formatTanggalID(item.tanggal)}\nMapel: ${item.mapel}\nMateri: ${item.materi}\nNilai: ${item.nilai || '-'}\nCatatan: ${item.catatan || '-'}\n\nTerima kasih 🙏`;
            window.open(`https://wa.me/${siswa.wa}?text=${encodeURIComponent(text)}`, '_blank');
        }));
        target.querySelectorAll('[data-delete-report]').forEach(btn => btn.addEventListener('click', () => hapusLaporan(btn.dataset.deleteReport)));
    }

    function hapusLaporan(id) {
        const item = laporanData.find(r => r.id === id);
        if (!item) return;
        if (!isAdmin && item.tutorId !== session.tutorId) return;
        if (!confirm('Hapus laporan ini?')) return;
        laporanData = laporanData.filter(r => r.id !== id);
        saveLaporan();
        renderRiwayat();
        renderStatistik();
        showToast('Laporan dihapus.', '#c0392b');
    }

    /***********************
     * STATISTIK
     ***********************/
    function renderStatistik() {
        const students = visibleStudents();
        const reports = visibleReports();
        document.getElementById('statSiswa').textContent = students.length;
        document.getElementById('statLaporan').textContent = reports.length;
        document.getElementById('statHadir').textContent = reports.filter(r => r.kehadiran === 'Hadir').length;
        const nilai = reports.map(r => Number(r.nilai)).filter(n => Number.isFinite(n) && n > 0);
        document.getElementById('statNilai').textContent = nilai.length ? Math.round(nilai.reduce((a, b) => a + b, 0) / nilai.length) : 0;
        const mapel = {};
        reports.forEach(r => {
            String(r.mapel || '').split(',').map(x => x.trim()).filter(Boolean).forEach(m => mapel[m] = (mapel[m] || 0) + 1);
        });
        const target = document.getElementById('mapelStats');
        const entries = Object.entries(mapel).sort((a, b) => b[1] - a[1]);
        target.innerHTML = entries.length ? entries.map(([name, count]) => `
            <div class="pa-bar-row">
                <span>${PAAuth.escapeHTML(name)}</span>
                <div><i style="width:${Math.min(count * 20, 100)}%"></i></div>
                <strong>${count}</strong>
            </div>
        `).join('') : '<p class="pa-empty">Belum ada data statistik mapel.</p>';
    }

    /***********************
     * PENDAFTAR SISWA BARU
     ***********************/
    function renderPendaftar() {
        if (!isAdmin) return;
        pendaftarData = PAAuth.loadJSON(STORAGE.pendaftar, []);
        tutors = PAAuth.loadTutors();
        const target = document.getElementById('pendaftarList');
        if (!target) return;

        if (pendaftarData.length === 0) {
            target.innerHTML = '<p class="pa-empty">Belum ada pendaftar siswa baru dari halaman umum.</p>';
            return;
        }

        target.innerHTML = pendaftarData.map(item => `
            <div class="pa-list-item">
                <div>
                    <strong>${PAAuth.escapeHTML(item.namaSiswa || '-')}</strong>
                    <span>${PAAuth.escapeHTML(item.jenjang || '-')} · Ortu: ${PAAuth.escapeHTML(item.namaOrtu || '-')} · WA: ${PAAuth.escapeHTML(item.waOrtu || '-')} · Status: ${PAAuth.escapeHTML(item.status || 'Baru')}</span>
                    ${item.catatan ? `<span>Catatan: ${PAAuth.escapeHTML(item.catatan)}</span>` : ''}
                    <span style="color:#0056b3;font-weight:700;">Pilih tutor lalu klik Setujui agar langsung masuk ke Data Siswa.</span>
                </div>
                <div class="pa-list-actions pa-approve-actions">
                    <select data-approve-tutor style="padding:9px 10px;border:1px solid #ddd;border-radius:8px;min-width:190px;">
                        <option value="">— Pilih Tutor —</option>
                        ${tutors.map(tutor => `<option value="${PAAuth.escapeHTML(tutor.id)}">${PAAuth.escapeHTML(tutor.nama)} - ${PAAuth.escapeHTML(tutor.mapel || '-')}</option>`).join('')}
                    </select>
                    <button type="button" data-approve-pendaftar="${item.id}" style="background:#25D366;color:white;">Setujui</button>
                    ${item.waOrtu ? `<button type="button" data-wa-pendaftar="${item.waOrtu}">WA</button>` : ''}
                    <button type="button" data-delete-pendaftar="${item.id}">Hapus</button>
                </div>
            </div>
        `).join('');

        target.querySelectorAll('[data-approve-pendaftar]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = btn.dataset.approvePendaftar;
                const row = btn.closest('.pa-list-item');
                const select = row ? row.querySelector('[data-approve-tutor]') : null;
                const tutorId = select ? select.value : '';
                if (!tutorId) return showToast('Pilih tutor untuk siswa ini dulu.', '#c0392b');

                btn.disabled = true;
                if (select) select.disabled = true;

                try {
                    let savedSiswa = null;
                    if (window.PACloud && typeof PACloud.approvePendaftarNow === 'function') {
                        const result = await PACloud.approvePendaftarNow(id, tutorId, {
                            uploadText: 'Menyetujui pendaftar...',
                            successText: 'Pendaftar masuk ke Data Siswa ✅'
                        });
                        savedSiswa = result.siswa || null;
                        if (Array.isArray(result.pendaftar)) pendaftarData = result.pendaftar;
                    } else {
                        const item = pendaftarData.find(row => row.id === id);
                        if (!item) throw new Error('Data pendaftar tidak ditemukan.');
                        savedSiswa = {
                            id: PAAuth.makeId('siswa'),
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
                        siswaData.unshift(savedSiswa);
                        pendaftarData = pendaftarData.filter(row => row.id !== id);
                        saveSiswa();
                        savePendaftar();
                    }

                    if (savedSiswa) {
                        siswaData = [savedSiswa, ...siswaData.filter(row => row.id !== savedSiswa.id)];
                    }
                    renderPendaftar();
                    syncSiswaSelects();
                    renderStatistik();
                    switchTab('siswa');
                    showToast('Pendaftar disetujui dan sudah masuk Data Siswa ✅', '#25D366');
                } catch (error) {
                    console.error(error);
                    showToast(error.message || 'Gagal menyetujui pendaftar.', '#c0392b');
                    btn.disabled = false;
                    if (select) select.disabled = false;
                }
            });
        });

        target.querySelectorAll('[data-wa-pendaftar]').forEach(btn => {
            btn.addEventListener('click', () => window.open(`https://wa.me/${btn.dataset.waPendaftar}`, '_blank'));
        });

        target.querySelectorAll('[data-delete-pendaftar]').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (!confirm('Hapus data pendaftar ini?')) return;
                btn.disabled = true;
                try {
                    if (window.PACloud && typeof PACloud.deleteRecordNow === 'function') {
                        pendaftarData = await PACloud.deleteRecordNow(STORAGE.pendaftar, btn.dataset.deletePendaftar, {
                            uploadText: 'Menghapus pendaftar online...',
                            successText: 'Pendaftar terhapus online ✅'
                        });
                    } else {
                        pendaftarData = pendaftarData.filter(item => item.id !== btn.dataset.deletePendaftar);
                        savePendaftar();
                    }
                    renderPendaftar();
                    showToast('Data pendaftar dihapus.', '#c0392b');
                } catch (error) {
                    console.error(error);
                    btn.disabled = false;
                    showToast('Gagal menghapus pendaftar online.', '#c0392b');
                }
            });
        });
    }

    /***********************
     * DATA TUTOR ADMIN
     ***********************/
    function renderTutorAdmin() {
        if (!isAdmin) return;
        const target = document.getElementById('adminTutorList');
        if (!target) return;

        tutors = PAAuth.loadTutors();

        if (tutors.length === 0) {
            target.innerHTML = '<p class="pa-empty">Belum ada tutor terdaftar.</p>';
            return;
        }

        target.innerHTML = tutors.map(tutor => {
            const shown = tutor.showOnHome === true || tutor.showOnHome === 'true' || tutor.tampilBeranda === true || tutor.tampilBeranda === 'true';
            return `
                <div class="pa-list-item pa-tutor-admin-item">
                    <div class="pa-tutor-admin-left">
                        <div class="pa-tutor-admin-photo">${getTutorPhotoSrc(tutor) ? `<img src="${getTutorPhotoSrc(tutor)}" alt="${PAAuth.escapeHTML(tutor.nama)}">` : '<span>👤</span>'}</div>
                        <div>
                            <strong>${PAAuth.escapeHTML(tutor.nama)}</strong>
                            <span>${PAAuth.escapeHTML(tutor.mapel || '-')} · ${PAAuth.escapeHTML(tutor.jenjang || '-')}</span>
                            <span>Login: ${PAAuth.escapeHTML(tutor.username)} / ${PAAuth.escapeHTML(tutor.password)}</span>
                            <span style="font-weight:700;color:${shown ? '#25D366' : '#777'};">${shown ? '✅ Tampil di beranda' : '⏳ Belum tampil di beranda'}</span>
                        </div>
                    </div>
                    <div class="pa-list-actions">
                        <button type="button" data-toggle-home-tutor="${tutor.id}" style="${shown ? 'background:#fff3cd;color:#9a6a00;' : 'background:#e8fff1;color:#128c7e;'}">
                            ${shown ? 'Sembunyikan dari Beranda' : 'Tampilkan di Beranda'}
                        </button>
                        ${tutor.wa ? `<button type="button" data-wa-tutor="${tutor.wa}">WA</button>` : ''}
                        <button type="button" data-delete-tutor="${tutor.id}">Hapus</button>
                    </div>
                </div>
            `;
        }).join('');

        target.querySelectorAll('[data-toggle-home-tutor]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = btn.dataset.toggleHomeTutor;
                const current = PAAuth.loadTutors();
                let updatedTutor = null;
                tutors = current.map(tutor => {
                    if (tutor.id !== id) return tutor;
                    const shown = tutor.showOnHome === true || tutor.showOnHome === 'true' || tutor.tampilBeranda === true || tutor.tampilBeranda === 'true';
                    updatedTutor = {
                        ...tutor,
                        showOnHome: !shown,
                        tampilBeranda: !shown
                    };
                    return updatedTutor;
                });

                btn.disabled = true;
                try {
                    if (updatedTutor && window.PACloud && typeof PACloud.upsertRecordNow === 'function') {
                        await PACloud.upsertRecordNow(STORAGE.tutors, updatedTutor, {
                            uploadText: 'Menyimpan pilihan tutor online...',
                            successText: 'Pilihan tutor tersinkron ✅'
                        });
                    } else {
                        await saveTutorsOnline();
                    }
                    renderTutorAdmin();
                    showToast('Status tampilan tutor di beranda berhasil diubah dan sinkron ✅', '#25D366');
                } catch (error) {
                    console.error(error);
                    showToast('Gagal menyimpan pilihan tutor online.', '#c0392b');
                    btn.disabled = false;
                }
            });
        });

        target.querySelectorAll('[data-wa-tutor]').forEach(btn => btn.addEventListener('click', () => window.open(`https://wa.me/${btn.dataset.waTutor}`, '_blank')));

        target.querySelectorAll('[data-delete-tutor]').forEach(btn => btn.addEventListener('click', async () => {
            if (!confirm('Hapus tutor ini? Data siswa/jadwal/laporan tidak ikut terhapus, tapi tutor tidak bisa login lagi.')) return;
            btn.disabled = true;
            const id = btn.dataset.deleteTutor;
            tutors = tutors.filter(tutor => tutor.id !== id);
            try {
                if (window.PACloud && typeof PACloud.deleteRecordNow === 'function') {
                    tutors = await PACloud.deleteRecordNow(STORAGE.tutors, id, {
                        uploadText: 'Menghapus tutor online...',
                        successText: 'Data tutor terhapus online ✅'
                    });
                } else {
                    await saveTutorsOnline();
                }
                renderTutorAdmin();
                syncAllSelects();
                showToast('Data tutor dihapus dan sinkron.', '#c0392b');
            } catch (error) {
                console.error(error);
                showToast('Gagal menghapus tutor online.', '#c0392b');
                btn.disabled = false;
            }
        }));
    }

    /***********************
     * DOWNLOAD
     ***********************/
    function downloadFile(filename, content, type = 'text/plain;charset=utf-8') {
        const blob = new Blob([content], { type });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(link.href);
    }

    function csvEscape(value) {
        return '"' + String(value ?? '').replace(/"/g, '""') + '"';
    }

    function toCSV(headers, rows) {
        return [headers.map(csvEscape).join(','), ...rows.map(row => headers.map(h => csvEscape(row[h])).join(','))].join('\n');
    }

    function downloadReportsCSV() {
        const headers = ['tanggal','tutor','siswa','kelas','kehadiran','mapel','materi','aktivitas','pr','nilai','rating','catatan','jumlah_gambar'];
        const rows = visibleReports().map(r => ({
            tanggal: r.tanggal,
            tutor: r.tutorNama,
            siswa: r.nama,
            kelas: r.kelas,
            kehadiran: r.kehadiran,
            mapel: r.mapel,
            materi: r.materi,
            aktivitas: r.aktivitas,
            pr: r.pr,
            nilai: r.nilai,
            rating: r.rating,
            catatan: r.catatan,
            jumlah_gambar: (r.images || []).length
        }));
        downloadFile('laporan_peta_academy.csv', toCSV(headers, rows), 'text/csv;charset=utf-8');
    }

    async function downloadReportsExcel() {
        const reports = visibleReports();
        if (reports.length === 0) return showToast('Belum ada laporan untuk didownload.');
        if (!window.ExcelJS) {
            return showToast('ExcelJS belum termuat. Pastikan internet aktif lalu coba lagi.', '#c0392b');
        }
        const workbook = new ExcelJS.Workbook();
        const ws = workbook.addWorksheet('Laporan');
        ws.columns = [
            { header: 'Tanggal', key: 'tanggal', width: 18 },
            { header: 'Tutor', key: 'tutor', width: 22 },
            { header: 'Siswa', key: 'siswa', width: 22 },
            { header: 'Kelas', key: 'kelas', width: 16 },
            { header: 'Kehadiran', key: 'kehadiran', width: 14 },
            { header: 'Mapel', key: 'mapel', width: 24 },
            { header: 'Materi', key: 'materi', width: 35 },
            { header: 'Aktivitas', key: 'aktivitas', width: 35 },
            { header: 'PR', key: 'pr', width: 25 },
            { header: 'Nilai', key: 'nilai', width: 10 },
            { header: 'Rating', key: 'rating', width: 12 },
            { header: 'Catatan', key: 'catatan', width: 35 },
            { header: 'Gambar Laporan', key: 'gambar', width: 28 }
        ];
        ws.getRow(1).font = { bold: true };

        for (const r of reports) {
            const row = ws.addRow({
                tanggal: r.tanggal,
                tutor: r.tutorNama,
                siswa: r.nama,
                kelas: r.kelas,
                kehadiran: r.kehadiran,
                mapel: r.mapel,
                materi: r.materi,
                aktivitas: r.aktivitas,
                pr: r.pr,
                nilai: r.nilai,
                rating: r.rating,
                catatan: r.catatan,
                gambar: (r.images || []).length ? `${(r.images || []).length} gambar` : '-'
            });
            row.height = (r.images || []).length ? 90 : 22;

            for (const [imgIndex, img] of (r.images || []).slice(0, 3).entries()) {
                try {
                    const base64 = await imageBase64ForExcel(img);
                    if (!base64) continue;
                    const extension = base64.startsWith('data:image/png') ? 'png' : 'jpeg';
                    const imageId = workbook.addImage({ base64, extension });
                    ws.addImage(imageId, {
                        tl: { col: 12 + imgIndex * 1.5, row: row.number - 1 },
                        ext: { width: 120, height: 85 }
                    });
                } catch (error) {
                    console.warn('Gagal memasukkan gambar ke Excel', error);
                }
            }
        }

        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'laporan_peta_academy_dengan_gambar.xlsx';
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(link.href);
    }

    function downloadTutorCSV() {
        const headers = ['nama','username','password','wa','email','domisili','pendidikan','mapel','jenjang','pengalaman','jadwal','tampil_beranda'];
        const rows = tutors.map(t => ({
            nama: t.nama, username: t.username, password: t.password, wa: t.wa, email: t.email, domisili: t.domisili,
            pendidikan: t.pendidikan, mapel: t.mapel, jenjang: t.jenjang, pengalaman: t.pengalaman, jadwal: t.jadwal, tampil_beranda: (t.showOnHome === true || t.showOnHome === 'true' || t.tampilBeranda === true || t.tampilBeranda === 'true') ? 'Ya' : 'Tidak'
        }));
        downloadFile('data_tutor_peta_academy.csv', toCSV(headers, rows), 'text/csv;charset=utf-8');
    }

    function downloadSiswaCSV() {
        const headers = ['nama','kelas','orang_tua','wa','tutor'];
        const rows = visibleStudents().map(s => ({
            nama: s.nama, kelas: s.kelas, orang_tua: s.ortu, wa: s.wa, tutor: (getTutor(s.tutorId) || {}).nama || ''
        }));
        downloadFile('data_siswa_peta_academy.csv', toCSV(headers, rows), 'text/csv;charset=utf-8');
    }

    function downloadJadwalCSV() {
        const headers = ['tanggal','jam','tutor','siswa','mapel','warna','catatan'];
        const rows = visibleSchedules().map(j => ({
            tanggal: j.tanggal, jam: j.jam, tutor: (getTutor(j.tutorId) || {}).nama || '', siswa: j.siswa,
            mapel: j.mapel, warna: j.warna, catatan: j.catatan
        }));
        downloadFile('jadwal_peta_academy.csv', toCSV(headers, rows), 'text/csv;charset=utf-8');
    }

    function downloadPendaftarCSV() {
        const headers = ['tanggal_daftar','nama_siswa','nama_ortu','wa_ortu','email','jenjang','catatan','status'];
        const rows = pendaftarData.map(p => ({
            tanggal_daftar: p.createdAt || '',
            nama_siswa: p.namaSiswa || '',
            nama_ortu: p.namaOrtu || '',
            wa_ortu: p.waOrtu || '',
            email: p.email || '',
            jenjang: p.jenjang || '',
            catatan: p.catatan || '',
            status: p.status || 'Baru'
        }));
        downloadFile('pendaftar_siswa_baru_peta_academy.csv', toCSV(headers, rows), 'text/csv;charset=utf-8');
    }

    function downloadAllJSON() {
        if (!isAdmin) return;
        const data = { tutors, siswa: siswaData, jadwal: jadwalData, laporan: laporanData, invoice: invoiceData, pendaftar: pendaftarData, gallery: PAAuth.loadJSON('pa_gallery_v3', []), exportedAt: new Date().toISOString() };
        downloadFile('backup_semua_data_peta_academy.json', JSON.stringify(data, null, 2), 'application/json;charset=utf-8');
    }

    const reportExcelBtn = document.getElementById('btnDownloadLaporanExcel');
    if (reportExcelBtn) reportExcelBtn.addEventListener('click', downloadReportsExcel);
    const reportCsvBtn = document.getElementById('btnDownloadLaporanCSV');
    if (reportCsvBtn) reportCsvBtn.addEventListener('click', downloadReportsCSV);
    const tutorCsvBtn = document.getElementById('btnDownloadTutorCSV');
    if (tutorCsvBtn) tutorCsvBtn.addEventListener('click', downloadTutorCSV);
    const siswaCsvBtn = document.getElementById('btnDownloadSiswaCSV');
    if (siswaCsvBtn) siswaCsvBtn.addEventListener('click', downloadSiswaCSV);
    const jadwalCsvBtn = document.getElementById('btnDownloadJadwalCSV');
    if (jadwalCsvBtn) jadwalCsvBtn.addEventListener('click', downloadJadwalCSV);
    const pendaftarCsvBtn = document.getElementById('btnDownloadPendaftarCSV');
    if (pendaftarCsvBtn) pendaftarCsvBtn.addEventListener('click', downloadPendaftarCSV);
    const allJsonBtn = document.getElementById('btnDownloadSemuaJSON');
    if (allJsonBtn) allJsonBtn.addEventListener('click', downloadAllJSON);

    /***********************
     * INIT
     ***********************/
    function init() {
        applyRoleUI();
        PAAuth.updateAuthNav();
        updateLiveDate();
        setInterval(updateLiveDate, 30000);
        syncAllSelects();
        renderSiswa();
        renderInvoice();
        renderCalendar();
        renderTodaySchedule();
        renderRiwayat();
        renderStatistik();
        renderTutorAdmin();
        renderPendaftar();
        resetLaporanForm();
    }

    init();
})();
