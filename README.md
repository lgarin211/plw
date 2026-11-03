# Playwright Automation & Recorder 2

Proyek automasi Playwright berbasis Node.js dengan fitur perekam skenario otomatis (*codegen*).

## Struktur File

- [`record.js`](file:///mnt/c/Users/Asani/plw2/record.js): Script untuk merekam aktivitas browser dan menyimpannya ke `skenario.js`.
- [`skenario.js`](file:///mnt/c/Users/Asani/plw2/skenario.js): File skenario automasi yang dihasilkan dari perekaman atau ditulis manual.
- [`package.json`](file:///mnt/c/Users/Asani/plw2/package.json): Konfigurasi proyek dan dependensi.

---

## Cara Penggunaan

### 1. Merekam Skenario Otomatis

Jalankan perintah berikut:
```bash
node record.js
```
atau dengan npm script:
```bash
npm run record
```

Anda juga bisa langsung menyertakan URL tujuan:
```bash
node record.js https://example.com
```

**Langkah saat perekaman:**
1. Browser Chromium dan jendela *Playwright Inspector* akan muncul.
2. Lakukan aksi di browser (klik tombol, ketik teks, navigasi halaman).
3. Playwright akan merekam semua aksi tersebut secara otomatis dalam format JavaScript.
4. Jika sudah selesai, tutup jendela browser. Hasil rekaman otomatis tersimpan ke `skenario.js`.

---

### 2. Menjalankan Skenario Automasi

Setelah skenario tersimpan, jalankan dengan:
```bash
node skenario.js
```
atau:
```bash
npm start
```

Secara default, browser akan muncul (`headless: false`) sehingga Anda dapat melihat automasi berjalan secara langsung. Untuk menjalankannya di latar belakang tanpa membuka jendela browser, ubah `headless: false` menjadi `headless: true` di dalam file `skenario.js`.
