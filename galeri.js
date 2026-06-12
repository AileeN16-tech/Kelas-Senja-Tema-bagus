(function () {
    const GALLERY_KEY = 'pa_gallery_v3';
    const grid = document.getElementById('galleryGrid');
    const control = document.getElementById('galleryControl');
    const input = document.getElementById('galleryInput');
    const button = document.getElementById('btnTambahGaleri');

    if (!grid) return;

    function loadGallery() {
        return PAAuth.loadJSON(GALLERY_KEY, []);
    }

    function saveGallery(items) {
        PAAuth.saveJSON(GALLERY_KEY, items);
    }

    async function saveGalleryOnline(items, options = {}) {
        if (window.PACloud && typeof PACloud.saveKeyNow === 'function') {
            return await PACloud.saveKeyNow(GALLERY_KEY, items, options);
        }
        saveGallery(items);
        return items;
    }

    function getGalleryImageSrc(item) {
        if (window.PACloud && typeof PACloud.imageSrc === 'function') {
            return PACloud.imageSrc(item, 'src');
        }
        return item.src || item.url || item.data || '';
    }

    function isAdmin() {
        const session = PAAuth.getSession();
        return session && session.role === 'admin';
    }

    function showToast(text, color = '#333') {
        let toast = document.getElementById('galleryToast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'galleryToast';
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
        }, 2400);
    }

    function compressImage(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = function (event) {
                const img = new Image();

                img.onload = function () {
                    const max = 800;
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

                    resolve(canvas.toDataURL('image/jpeg', 0.76));
                };

                img.onerror = reject;
                img.src = event.target.result;
            };

            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    function renderGallery() {
        const admin = isAdmin();
        const items = loadGallery();

        // Tombol tambah gambar hanya muncul untuk admin utama.
        if (control) {
            control.style.display = admin ? 'block' : 'none';
        }

        if (items.length === 0) {
            grid.innerHTML = `
                <div class="pa-empty-card">
                    <div style="font-size:42px;">🖼️</div>
                    <h3>Galeri masih kosong</h3>
                    <p>${admin ? 'Klik tombol tambah gambar untuk menambahkan dokumentasi kegiatan.' : 'Galeri akan tampil setelah admin menambahkan gambar.'}</p>
                </div>
            `;
            return;
        }

        grid.innerHTML = items.map(item => `
            <div class="pa-gallery-item">
                <img src="${getGalleryImageSrc(item)}" alt="${PAAuth.escapeHTML(item.caption || 'Galeri Kelas Senja')}">
                <div class="pa-gallery-caption">
                    <strong>${PAAuth.escapeHTML(item.caption || 'Kegiatan Kelas Senja')}</strong>
                    <span>${PAAuth.escapeHTML(item.by || 'Kelas Senja')}</span>
                    ${admin ? `<button type="button" data-delete-gallery="${item.id}">Hapus</button>` : ''}
                </div>
            </div>
        `).join('');

        if (admin) {
            document.querySelectorAll('[data-delete-gallery]').forEach(btn => {
                btn.addEventListener('click', async function () {
                    if (!confirm('Hapus gambar ini dari galeri?')) return;

                    const id = btn.getAttribute('data-delete-gallery');
                    btn.disabled = true;
                    try {
                        if (window.PACloud && typeof PACloud.deleteRecordNow === 'function') {
                            await PACloud.deleteRecordNow(GALLERY_KEY, id, {
                                uploadText: 'Menghapus gambar online...',
                                successText: 'Gambar terhapus dan sinkron ✅'
                            });
                        } else {
                            await saveGalleryOnline(loadGallery().filter(item => item.id !== id), {
                                uploadText: 'Menghapus gambar online...',
                                successText: 'Gambar terhapus dan sinkron ✅'
                            });
                        }
                        renderGallery();
                        showToast('Gambar galeri dihapus dan tersinkron.', '#c0392b');
                    } catch (error) {
                        console.error(error);
                        btn.disabled = false;
                        showToast('Gagal menghapus gambar online.', '#c0392b');
                    }
                });
            });
        }
    }

    if (button && input) {
        button.addEventListener('click', function () {
            const session = PAAuth.getSession();

            if (!session) {
                window.location.href = 'login.html';
                return;
            }

            if (session.role !== 'admin') {
                showToast('Hanya admin utama yang bisa menambahkan gambar galeri.', '#c0392b');
                return;
            }

            input.click();
        });

        input.addEventListener('change', async function () {
            const session = PAAuth.getSession();

            if (!session || session.role !== 'admin') {
                input.value = '';
                showToast('Hanya admin utama yang bisa menambahkan gambar galeri.', '#c0392b');
                return;
            }

            const file = input.files && input.files[0];

            if (!file) return;

            if (!file.type.startsWith('image/')) {
                showToast('File harus berupa gambar.', '#c0392b');
                return;
            }

            try {
                button.disabled = true;
                showToast('Mengupload gambar agar sinkron online...', '#333');

                const src = await compressImage(file);
                const caption = prompt('Tulis keterangan gambar:', 'Kegiatan Belajar Kelas Senja') || 'Kegiatan Belajar Kelas Senja';
                const item = {
                    id: PAAuth.makeId('galeri'),
                    src,
                    caption,
                    by: session.nama || 'Admin Kelas Senja',
                    role: 'admin',
                    createdAt: new Date().toISOString()
                };

                if (window.PACloud && typeof PACloud.upsertRecordNow === 'function') {
                    await PACloud.upsertRecordNow(GALLERY_KEY, item, {
                        uploadText: 'Mengupload 1 gambar ke Drive...',
                        successText: 'Gambar tersimpan online ✅'
                    });
                } else {
                    const gallery = loadGallery();
                    gallery.unshift(item);
                    await saveGalleryOnline(gallery, {
                        uploadText: 'Mengupload gambar ke Drive...',
                        successText: 'Gambar tersimpan online ✅'
                    });
                }
                input.value = '';

                renderGallery();
                showToast('Gambar berhasil ditambahkan dan sinkron ✅', '#25D366');
            } catch (error) {
                console.error(error);
                showToast('Gagal upload/simpan gambar.', '#c0392b');
            } finally {
                button.disabled = false;
            }
        });
    }

    // Karena galeri.js dimuat secara dinamis lewat PACloud.loadScript(),
    // kadang event DOMContentLoaded sudah lewat. Jadi render harus dipanggil langsung.
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', renderGallery);
    } else {
        renderGallery();
    }

    window.renderGallery = renderGallery;
})();
