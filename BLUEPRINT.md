# Blueprint Seni Bina Pilihan A: US Stock Analyst & Trader (Versi 3.8)

Rujukan Dokumen Pusat: [HOM-114](https://crew.julietmike.net/HOM/issues/HOM-114)  
Pemohon: Jefri  

---

## Prinsip Teras Seni Bina (L0 -> L4)
1. **L0: Infrastruktur & Screener Deterministik**: Moomoo OpenD Daemon, Screener Dwi-Lorong (Momentum & Setup) menjana `watchlist.json`.
2. **L1: Kecerdasan Pasaran**: Tariq (Teknikal, Wyckoff, SMC) & Nawwar (Sentimen, Berita, Tapisan Earnings).
3. **L2: Sintesis Strategi & Saiz Posisi**: Haziq (Skor Komposit $S_{total} = 0.65 \times S_{tech} + 0.35 \times S_{sent\_norm}$, formula risiko 1.5% modal efektif, Stop Loss 1.5 ATR14).
4. **L3: Audit Risiko & Pematuhan**: Danial (8 Hard Rules deterministik, pencegahan pembelian berulang, had siling modal portfolio).
5. **L4: Pelaksanaan & Operasi**: Moomoo OpenD Broker API (`MOOMOO_TRD_ENV=SIMULATE`), pengesahan Authentik SSO & Cloudflare Named Tunnel (`*.beta.julietmike.net`).

---

## MEMO Mandatori Blueprint (Arahan Terkini Jefri 2026-11-16)

### 1. MEMO Rekabentuk Antaramuka (Dilarang Label Cliché)
- **DILARANG** menambah label-label cliché, kad penerangan berulang, atau teks hiasan yang tidak mempunyai kegunaan operasi dan tidak diperlukan oleh pengguna (contoh: kad prinsip teori saiz posisi institusi, penjelasan berulang fungsi ejen, atau label bertindan L1/L2/L3 yang mengelirukan).
- Antaramuka mestilah kemas, padat, berfungsi (*utilitarian*), dan terus memaparkan kawalan atau metrik tindakan pengguna.

### 2. MEMO Integriti Data & Visualisasi Ejen (Wajib Data Sebenar)
- **WAJIB** guna DATA SEBENAR daripada saluran paip (`watchlist.json` / broker). **DILARANG** menggunakan senarai calon mockup/rekaan yang tiada kaitan dengan senarai pantau (*watchlist*) semasa.
- Buang label kod teknikal dalaman yang tidak diperlukan (seperti `(L1_TECHNICAL)`, `(L4_DISPATCH)` pada chip pilihan kaunter).
- Halaman pemantauan aktiviti ejen (`#/agents`) wajib memaparkan bilangan sebenar kaunter semasa yang lulus (cth. `Kaunter Semasa Lulus: X / Y`) berserta pengekodan warna (*color-coding*) yang jelas: Hijau (*Success*) bagi kaunter yang lulus/diterima dan Neutral/Muted bagi kaunter yang ditolak.

### 3. Logik Keputusan Pembelian Bila > 1 Kaunter Lulus
Jika terdapat lebih daripada 1 kaunter yang lulus semua tapisan (L1, L2, L3) secara serentak dalam satu kitaran:
1. **Penyusunan Keutamaan Mengikut Skor Komposit**: Haziq menyusun kaunter mengikut ranking $S_{total}$ tertinggi:
   $$S_{total} = (0.65 \times S_{tech}) + (0.35 \times S_{sent\_norm})$$
2. **Peruntukan Modal Berdisiplin**: Pesanan dieksekusi mengikut urutan ranking berdasarkan saiz risiko 1.5% modal efektif setiap kaunter (maksimum 20% nilai posisi).
3. **Penguatkuasaan Had Siling Modal Danial**: Sebaik sahaja had siling modal maksimum portfolio (atau had modal yang dikonfigurasi) dipenuhi, sebarang kaunter seterusnya disekat secara automatik oleh Danial (Rule 1 & Rule 6) untuk mengelakkan *overexposure*.
