# Product Requirements Document (PRD)

**Nama Produk:** Antigravity Safe Auto Approve  
**Tanggal Dibuat:** 26 September 2026  
**Penulis / Kreator:** Ananda Ibrahim (foolstuck)  
**Referensi Proyek Sebelumnya:** Agent Sound Notifier  
**Status:** Draft / Ready for Development  

---

## 1. Ringkasan Eksekutif (Executive Summary)
**Antigravity Safe Auto Approve** adalah ekstensi untuk IDE Antigravity (berbasis VS Code) yang berfungsi untuk mengotomatisasi persetujuan (approval) terhadap aksi yang dilakukan oleh AI Agent. Ekstensi ini didesain dengan prinsip *safety-first*, di mana ia hanya akan memberikan persetujuan otomatis (seperti klik tombol *"Yes, allow this time"*) pada perintah-perintah yang masuk dalam daftar aman (*whitelist*), dan akan mengabaikan perintah yang berpotensi merusak (*destructive commands*). 

## 2. Latar Belakang & Masalah (Background & Problem)
Saat menggunakan fitur AI Agent di Antigravity, agen sering kali meminta izin melalui *popup* UI sebelum mengeksekusi perintah terminal atau menyimpan perubahan file. Memilih "Allow" secara manual berulang-ulang sangat mengganggu alur kerja (*workflow*). Namun, memberikan izin "Always Allow" pada semua tindakan sangat berisiko. Oleh karena itu, dibutuhkan sebuah *auto-clicker* pintar yang bekerja berdasarkan aturan spesifik, bukan sekadar menekan tombol secara membabi buta.

## 3. Pendekatan Teknis (Technical Approach)
Karena arsitektur Antigravity memisahkan *webview* agen dari konteks ekstensi VS Code standar, ekstensi ini **wajib menggunakan UI Automation atau Chrome DevTools Protocol (CDP)** untuk memonitor DOM dan menyimulasikan klik pada elemen UI (tombol persetujuan agen) di dalam IDE.

## 4. Spesifikasi Fitur Utama (Core Features)

### 4.1. Smart Approval Engine
Mesin utama yang akan mendeteksi *popup* persetujuan dan membaca isi permintaan.
*   **Safe Commands (Whitelist):** Perintah pengembangan standar akan otomatis diberikan izin satu kali eksekusi (*Allow this time*).
    *   *Contoh:* `php artisan`, `composer`, `npm`, `git`, `vendor/bin/pint`.
*   **Suspicious Commands (Blacklist):** Perintah yang memodifikasi sistem atau berisiko tinggi akan diabaikan. Ekstensi tidak akan melakukan klik apa pun.
    *   *Contoh:* `rm -rf`, `format`, `diskpart`, `reg delete`, `powershell`.
*   **File Changes:** Kemampuan untuk secara terpisah menyetujui perubahan kode yang diajukan oleh agen pada file (*Accept All*).

### 4.2. Logic Flow (Alur Kerja Ekstensi)
1.  **Detect Approval Popup:** Memantau munculnya dialog persetujuan.
2.  **Analyze Request:** Mengekstrak teks *command* dari *popup*.
3.  **Decision Making:**
    *   Jika perintah termasuk dalam *Whitelist* -> **Eksekusi klik "Allow this time"** (opsi pertama).
    *   Jika perintah termasuk dalam *Blacklist* atau tidak dikenali -> **Do Nothing** (biarkan *popup* tetap terbuka).

### 4.3. Native Configuration UI (Antarmuka Pengaturan)
Pengaturan ekstensi harus terintegrasi langsung dengan antarmuka **Settings** bawaan VS Code/Antigravity (tanpa perlu UI kustom terpisah atau konfigurasi via terminal).

**Kunci Pengaturan (Settings Keys) yang akan diimplementasikan (dalam bahasa Inggris):**

*   `antigravityAutoApprove.enabled` (Type: Boolean, Default: `true`)
    *   *Deskripsi:* Mengaktifkan atau menonaktifkan ekstensi.
*   `antigravityAutoApprove.mode` (Type: String, Default: `"Safe"`)
    *   *Deskripsi:* Strategi persetujuan. Opsi: `"Safe"`, `"Strict"`.
*   `antigravityAutoApprove.defaultChoice` (Type: String, Default: `"Allow this time"`)
    *   *Deskripsi:* Pilihan tombol default saat ada beberapa opsi yang tersedia.
*   `antigravityAutoApprove.autoAcceptChanges` (Type: Boolean, Default: `true`)
    *   *Deskripsi:* Otomatis klik tombol "Accept All" pada perubahan file yang dilakukan oleh agen.
*   `antigravityAutoApprove.autoApproveTerminalCommands` (Type: Boolean, Default: `true`)
    *   *Deskripsi:* Mengizinkan persetujuan otomatis untuk perintah terminal yang ada di *whitelist*.
*   `antigravityAutoApprove.allowAlwaysAllow` (Type: String, Default: `"Never"`)
    *   *Deskripsi:* Mencegah ekstensi memilih opsi permanen ("Always allow").

## 5. Kebutuhan Sistem & Arsitektur (System Requirements)
*   **Platform:** Windows 10 / Windows 11, macOS, Linux (Memperhitungkan sistem persetujuan Antigravity khusus Windows seperti *Request Review*, *Proceed in Sandbox*).
*   **Framework:** Node.js, VS Code Extension API.
*   **Library Tambahan:** *Puppeteer-core* atau *Chrome DevTools Protocol (CDP) client* untuk VS Code Electron environment guna melakukan intervensi pada antarmuka *webview* agen.

## 6. Target Penyelesaian Tahap Pertama (Milestone 1)
1.  Inisialisasi proyek ekstensi VS Code dengan nama *Antigravity Safe Auto Approve*.
2.  Implementasi koneksi CDP ke *webview* Antigravity.
3.  Pembuatan logika pendeteksian tombol *Accept All* dan *Yes, allow this time*.
4.  Implementasi *JSON Config* dan integrasi ke Settings UI VS Code.
5.  Uji coba dengan menjalankan perintah aman (`php artisan`) dan perintah berbahaya (`rm -rf`) untuk memastikan *Safe Mode* berjalan dengan benar.