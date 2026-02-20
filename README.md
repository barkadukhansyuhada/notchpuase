# PuasaNotch

PuasaNotch adalah aplikasi menubar macOS (Electron + TypeScript) dengan overlay gaya notch untuk jadwal puasa dan sholat harian.

## Fitur Utama
- Tray menu: `Toggle Overlay`, `Refresh Schedule`, `Open Settings`, `Quit`.
- Overlay notch:
  - collapsed: ringkas event berikut + countdown
  - expanded: daftar event harian + countdown per baris
- Event harian: `Sahur/Imsak`, `Subuh`, `Syuruq`, `Dhuha`, `Zuhur`, `Asar`, `Maghrib/Iftar`, `Isya`.
- Reminder default sholat wajib: `-15, -10, -5, 0` menit.
- Hitung jadwal offline (`adhan` + `luxon`), tidak wajib API eksternal.
- Settings lokasi menggunakan dropdown `Negara -> Kota` (tanpa ketik bebas), lalu lat/lon/timezone auto.
- Auto resync saat sleep/resume dan pergantian hari.

## Requirement
- macOS (Intel atau Apple Silicon)
- Node.js 20+ (disarankan LTS)
- npm 10+

## Instalasi Dependencies
```bash
npm install
```

## Menjalankan Mode Development
```bash
npm run dev
```

Yang dijalankan:
- renderer dev server (Vite)
- watcher main/preload (tsup)
- process Electron

## Menjalankan Validasi
```bash
npm run lint
npm test
npm run build
```

## Clean Build / Bersihkan Artefak
Hapus artefak build lokal:
```bash
rm -rf dist
```

Opsional bersih total file yang di-ignore Git (hati-hati):
```bash
git clean -fdX
```

## Build DMG
### Apple Silicon (arm64)
```bash
npm run dist:arm64
```
Output:
- `dist/PuasaNotch-0.2.0-arm64.dmg`

### Intel (x64)
```bash
npm run dist:x64
```
Output:
- `dist/PuasaNotch-0.2.0.dmg` (x64 target)

### Multi-arch (x64 + arm64)
```bash
npm run dist
```

## Install DMG (Unsigned Build)
Karena default build belum sign/notarize:
1. Mount DMG dan drag `PuasaNotch.app` ke `/Applications`.
2. Jalankan:
```bash
xattr -dr com.apple.quarantine /Applications/PuasaNotch.app
open /Applications/PuasaNotch.app
```

## Pakai Aplikasi
1. Buka `PuasaNotch Settings` dari tray.
2. Pilih `Negara` lalu `Kota` dari dropdown.
3. Pastikan lat/lon/timezone terisi otomatis.
4. Klik `Save Settings`.
5. Atur reminder dan opsi overlay sesuai kebutuhan.

## Troubleshooting
- Settings mentok di `Loading settings...`:
  - tutup app, buka ulang.
  - cek koneksi internet (untuk list negara/kota).
  - fallback data Indonesia tetap tersedia jika API eksternal gagal.
- Klik icon dari Dock/Launchpad tidak muncul:
  - app berjalan sebagai menubar app; pakai tray menu `Open Settings`.
  - pada build terbaru, klik activate juga membuka Settings.
- Overlay tidak menempel notch:
  - atur `Y offset fine tune`.
  - nonaktifkan `Follow mouse display` jika pakai monitor eksternal.
- Notifikasi tidak muncul:
  - aktifkan izin notifikasi app di macOS Settings.
- Jadwal terasa salah:
  - cek negara/kota yang dipilih.
  - klik `Refresh Schedule`.

## Notch Limitation (Electron)
Electron belum expose API notch rect resmi. Posisi overlay memakai heuristik:
- layar notch-like: anchor ke `display.bounds.y + yOffset`
- layar biasa: anchor ke `display.workArea.y + yOffset`

## Struktur Penting
- `src/main/app.ts`
- `src/main/windows/WindowManager.ts`
- `src/main/services/ScheduleService.ts`
- `src/main/services/NotificationService.ts`
- `src/main/services/LocationService.ts`
- `src/main/store/SettingsStore.ts`
- `src/preload/index.ts`
- `src/renderer/overlay/*`
- `src/renderer/settings/*`

## Signing + Notarization (Placeholder)
Untuk distribusi production:
1. Setup Developer ID Application certificate.
2. Set `CSC_NAME` / `CSC_LINK` / `CSC_KEY_PASSWORD`.
3. Pastikan hardened runtime + entitlements aktif.
4. Notarize dengan `notarytool`.
5. Staple ticket ke `.app` / `.dmg`.

## Dokumen
- `PRD.md`
- `TECH_DESIGN.md`
