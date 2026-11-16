# Plan: Migrasi Autentikasi Dashboard ke Authentik (auth.julietmike.net)
Branch: feat/hom-142-authentik-auth
Issue: https://crew.julietmike.net/HOM/issues/HOM-142
Status: waiting for go (implementation NOT started)

## 1. Goal
Menggantikan sistem autentikasi Dashboard sedia ada (Cloudflare Access JWT) dengan **Authentik SSO (`auth.julietmike.net`)** berasaskan arahan eksplisit pemohon (Jefri) pada tiket HOM-114. Migrasi ini merangkumi sokongan Authentik Forward Auth / OIDC JWT verification di origin, butang log keluar (Logout) pantas satu-klik yang mematikan sesi serta-merta, pengekalan token servis dalaman (`X-Service-Token`), dan ujian keselamatan regresi automatik.

---

## 2. Findings / Root Cause
1. **Punca Migrasi**:
   - Pada HOM-114, pemohon (Jefri) menghadapi kesukaran untuk log keluar daripada Dashboard yang dilindungi Cloudflare Access ("cane nk logout ni. cam bodo je").
   - Cloudflare Access menguruskan sesi di edge (`CF_Authorization` cookie), menyebabkan pemadaman sesi secara terus dari aplikasi rumit dan memerlukan pengguna membuka URL edge Cloudflare secara manual.
   - Jefri mengarahkan: *"ubah dalam plan & implementation untuk ganti authentication dashboard ni dengan authentik. auth.julietmike.net"*.
2. **Keadaan Semasa Kod**:
   - `dashboard/server.js`: Mengikat secara keras (`fail-fast`) kepada `CF_ACCESS_AUD`, `CF_ACCESS_TEAM_DOMAIN`, dan `CF_ACCESS_CERTS_URL` (lines 19–27). Memeriksa header `cf-access-jwt-assertion` dan cookie `CF_Authorization`.
   - `dashboard/test_dashboard_auth.js`: Menguji regresi fail-fast Cloudflare AUD dan verifikasi RS256 Cloudflare Access.
   - `docker-compose.yml`: Mengandungi pembolehubah persekitaran `CF_ACCESS_AUD`, `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_CERTS_URL` untuk kontena `trading-dashboard`.
   - `.env.example`: Mengandungi templat konfigurasi Cloudflare Zero Trust.
3. **Infrastruktur Authentik Sedia Ada**:
   - Pelayan Authentik telah aktif di `https://auth.julietmike.net/` (Authentik release 2026.8.5, disahkan melalui header `x-authentik-id`).

---

## 3. User Review Required (Keputusan & Titik Semakan Pemohon)
- **Mod Integrasi**: Pendekatan hibrid (Authentik Forward Auth / OIDC Header + Origin JWT Verification). Reverse proxy (NPM) menghalakan pengguna tidak sah ke `auth.julietmike.net`, manakala Dashboard mengesahkan integriti token JWT Authentik (`X-authentik-jwt` / `Authorization: Bearer`) bagi menjamin prinsip keselamatan *defense-in-depth*.
- **Aliran Log Keluar (Logout)**: Butang Logout di Dashboard menghapuskan kuki lokal dan serta-merta mengalihkan pelayar ke `https://auth.julietmike.net/flows/-/default/invalidation/`, membolehkan pemadaman sesi menyeluruh satu-klik.
- **Tiada Kod Sebelum Kelulusan**: Selaras dengan peraturan HOM-142 dan SDLC, tiada fail kod aplikasi diubah sehingga kad pengesahan ini diluluskan oleh Jefri.

---

## 4. Proposed Changes (Perubahan Terperinci Mengikut Komponen)

### A. Dashboard Backend (`dashboard/server.js`) - `[MODIFY]`
- **Konfigurasi Baharu**:
  - Gantikan pembolehubah Cloudflare dengan Authentik:
    - `AUTHENTIK_ISSUER_URL` (lalai: `https://auth.julietmike.net/application/o/stock-trader/`)
    - `AUTHENTIK_JWKS_URL` (lalai: `https://auth.julietmike.net/application/o/stock-trader/jwks/`)
    - `AUTHENTIK_CLIENT_ID` (ID aplikasi/klien Authentik)
    - `AUTHENTIK_LOGOUT_URL` (lalai: `https://auth.julietmike.net/flows/-/default/invalidation/`)
    - `BRIDGE_SERVICE_TOKEN` (dikekalkan untuk komunikasi servis dalaman)
- **Fail-Fast Validation**:
  - Validasi mandatori semasa startup untuk konfigurasi Authentik (ganti semakan `CF_ACCESS_AUD`).
- **Middleware Autentikasi (`authenticateDashboard`)**:
  - Salur 1: Semakan `X-Service-Token` menggunakan perbandingan selamat masa (`crypto.timingSafeEqual`) untuk servis dalaman.
  - Salur 2: Semakan token Authentik melalui header `X-authentik-jwt`, `Authorization: Bearer <token>`, atau cookie sesi.
  - Pengesahan kriptografi RS256 JWT terhadap JWKS Authentik (`AUTHENTIK_JWKS_URL`), mengesahkan `iss`, `aud`, dan `exp`.
  - Pengekstrakan identiti pengguna: `req.authUser = payload.email || payload.preferred_username || payload.sub`.
  - Salur 3: Paparan borang akses atau pengalihan automatik ke `AUTHENTIK_LOGIN_URL` jika diakses melalui pelayar web.
- **Endpoint Log Keluar Baharu (`GET /logout`)**:
  - Memadamkan sebarang kuki sesi lokal dan memulangkan HTTP 302 Redirect ke `AUTHENTIK_LOGOUT_URL`.
- **UI Dashboard**:
  - Menambah butang merah **"Log Keluar (Logout)"** pada header navigasi Dashboard (`/`) yang berpaut terus ke `/logout`.
  - Memaparkan lencana pengguna Authentik (`Log Masuk sebagai: <email>`).

### B. Ujian Regresi Autentikasi (`dashboard/test_dashboard_auth.js`) - `[MODIFY]`
- Kemas kini suite ujian automatik:
  1. *Fail-Fast Test*: Memastikan pelayan serta-merta gagal/terhenti jika pembolehubah mandatori Authentik tidak diisi.
  2. *Unauthorized Rejection*: Permintaan tanpa token/kredensial ditolak dengan status HTTP 401 Unauthorized.
  3. *Tampered / None Algorithm Rejection*: Token dengan `alg: "none"` ditolak 401.
  4. *RS256 Signature Verification*: Token RS256 yang ditandatangani dengan kunci sah Authentik berjaya melepasi pengesahan dengan status 200 OK.
  5. *Audience / Issuer Mismatch*: Token dengan audiens atau pengeluar berbeza ditolak 401.
  6. *Service Token Validation*: `X-Service-Token` sah mendapat 200 OK; token salah ditolak 401.
  7. *Logout Endpoint Test*: `/logout` memulangkan status 302 dengan header `Location` menghala ke `AUTHENTIK_LOGOUT_URL` dan arahan `Set-Cookie` pembersihan sesi.

### C. Konfigurasi Kontena & Persekitaran (`docker-compose.yml` & `.env.example`) - `[MODIFY]`
- Kemas kini persekitaran kontena `trading-dashboard`:
  - Buang konfigurasi usang `CF_ACCESS_*`.
  - Masukkan pembolehubah `AUTHENTIK_ISSUER_URL`, `AUTHENTIK_JWKS_URL`, `AUTHENTIK_CLIENT_ID`, `AUTHENTIK_LOGOUT_URL`.
- Kemas kini `.env.example` dengan penerangan tetapan Authentik bagi panduan deployment.

---

## 5. Explicitly NOT Changing (Di Luar Skop)
- **Komponen L0 (OpenD & Python Screener)**: Tiada perubahan pada logik soket Moomoo, gateway port 11111/22222, atau penjanaan fail `watchlist.json`.
- **Komponen L1–L4 (AI Agents & MCP Bridge)**: Tiada perubahan pada prompt ejen (Tariq, Nawwar, Haziq, Danial) atau logik dagangan/risiko backend bridge.
- **Konfigurasi Dalaman Pelayan Authentik**: Pelayan teras Authentik diuruskan pada peringkat infrastruktur syarikat; task ini hanya membina konfigurasi integrasi klien Dashboard dan proksi NPM.

---

## 6. Verification Plan & SDLC Checklist
1. **Kriteria Penerimaan Pengguna (Acceptance Criteria)**:
   - *AC 1*: Bila pengguna yang belum disahkan membuka Dashboard di pelayar, sistem mengalihkan capaian atau meminta pengesahan Authentik (`auth.julietmike.net`).
   - *AC 2*: Bila pengguna berjaya disahkan oleh Authentik, pengguna dapat mengakses Dashboard dan identiti penggunanya dipaparkan dengan betul.
   - *AC 3*: Bila pengguna menekan butang "Log Keluar", sesi ditamatkan dan pelayar dialihkan ke URL invalidasi Authentik.
   - *AC 4*: Bila servis dalaman (Bridge/Agent) menghantar `X-Service-Token` yang sah, data Dashboard (`/api/data`) dapat dicapai terus tanpa halangan SSO.
2. **SDLC 3 (Unit & Boundary Value Analysis - BVA)**:
   - Menjalankan `npm test` dalam direktori `dashboard/` bagi menguji semua sempadan input (token kosong, format cacat, tandatangan palsu, audiens tidak sah).
3. **SDLC 4 (End-to-End API & Integration Test)**:
   - Menjalankan ujian HTTP sebenar terhadap kontena Dashboard lokal dengan senario pengguna sah, pengguna tidak sah, dan log keluar.
4. **SDLC 5a (Semakan Keselamatan & Auth)**:
   - Sahkan sambungan TLS HTTPS (`https://stock-trader.beta.julietmike.net/`), sokongan HTTP/2, dan sanitasi kredensial.
5. **Rujukan Fizikal & Laporan**:
   - Menyediakan laporan semakan fizikal maksimum 3 baris mengikut piawaian SDLC sebelum diserahkan kepada QA Zahrin.
