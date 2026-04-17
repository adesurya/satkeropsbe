# 🚔 Crime Dashboard API

Backend Node.js MVC untuk Sistem Informasi Kriminalitas — Dashboard Mapping Geospasial & AI Insight berbasis data LP Model A & B Kepolisian Indonesia.

---

## 📐 Arsitektur

```
src/
├── app.js                    # Entry point Express
├── config/
│   ├── database.js           # Sequelize MySQL config
│   └── swagger.js            # OpenAPI 3.0 spec
├── controllers/
│   ├── auth.controller.js    # Login, logout, refresh, me
│   ├── user.controller.js    # User CRUD + RBAC
│   ├── laporan.controller.js # LP/A & LP/B list, detail, search
│   ├── dashboard.controller.js # Summary, heatmap, trend, drilldown, anomaly
│   ├── insight.controller.js # AI classify, briefing, smart-search, forecast
│   └── setting.controller.js # Parameter & sync interval management
├── middleware/
│   ├── auth.js               # JWT verification
│   ├── rbac.js               # Role-based access + wilayah scope
│   ├── validate.js           # Joi input validation
│   ├── rateLimiter.js        # Express rate limiting
│   └── errorHandler.js       # Global error handler
├── models/
│   ├── User.js               # Users table + bcrypt hooks
│   ├── LaporanA.js           # LP Model A
│   ├── LaporanB.js           # LP Model B
│   ├── Terlibat.js           # Korban, pelaku, saksi, pelapor
│   ├── ApiSetting.js         # Key-value settings
│   └── SyncLog.js            # Sync history
├── routes/
│   └── index.js              # Semua route definitions
├── services/
│   ├── sync.service.js       # Fetch & upsert dari API sumber
│   └── scheduler.service.js  # node-cron based auto-sync
└── utils/
    ├── apiResponse.js        # Standar response builder
    ├── pagination.js         # Pagination & date filter helper
    └── logger.js             # Winston daily rotate logger
migrations/
├── run.js                    # Sync semua tabel ke DB
└── seed.js                   # Seed admin user & default settings
```

---

## ⚙️ Tech Stack

| Layer | Library |
|-------|---------|
| Framework | Express 4.x |
| ORM | Sequelize 6 + mysql2 |
| Auth | JWT (jsonwebtoken) + bcryptjs |
| Validation | Joi 17 |
| Security | Helmet, CORS, xss-clean, rate-limit |
| Scheduler | node-cron |
| Logging | Winston + daily-rotate-file |
| API Docs | Swagger UI (OpenAPI 3.0) |
| AI Insight | OpenAI GPT-4o API |

---

## 🚀 Panduan Instalasi

### 1. Prasyarat

Pastikan sudah terinstall:

```bash
node --version   # >= 18.0.0
npm --version    # >= 9.0.0
mysql --version  # >= 8.0
```

### 2. Clone & Install Dependensi

```bash
git clone https://github.com/your-org/crime-dashboard-api.git
cd crime-dashboard-api
npm install
```

### 3. Konfigurasi Environment

```bash
cp .env.example .env
```

Edit `.env` sesuai konfigurasi Anda:

```env
# ── Database ──────────────────────────────────────
DB_HOST=localhost
DB_PORT=3306
DB_NAME=crime_dashboard
DB_USER=root
DB_PASS=your_strong_password

# ── JWT (WAJIB diganti, minimal 32 karakter) ──────
JWT_SECRET=ganti_dengan_random_string_panjang_32char
JWT_REFRESH_SECRET=ganti_dengan_random_string_lain_32char

# ── API Sumber Data ───────────────────────────────
SOURCE_API_BASE_URL=http://localhost:3000/api/v1
SOURCE_API_TOKEN=token_dari_api_sumber

# ── OpenAI (untuk fitur AI Insight) ──────────────
OPENAI_API_KEY=sk-...
```

### 4. Buat Database MySQL

```sql
CREATE DATABASE crime_dashboard
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
```

Atau via terminal:

```bash
mysql -u root -p -e "CREATE DATABASE crime_dashboard CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
```

### 5. Jalankan Migrasi (Buat Tabel)

```bash
node migrations/run.js
```

Output yang diharapkan:
```
✅ Database connected
✅ All tables synced successfully
  - users
  - laporan_a
  - laporan_b
  - terlibat
  - api_settings
  - sync_logs
```

### 6. Seed Data Awal

```bash
node migrations/seed.js
```

Output:
```
✅ Default admin user created
   Username : admin
   Password : Admin@1234!
   ⚠️  GANTI PASSWORD SEGERA SETELAH LOGIN PERTAMA!
✅ 10 setting default dibuat
🎉 Seeding selesai!
```

### 7. Jalankan Aplikasi

**Development (auto-reload):**
```bash
npm run dev
```

**Production:**
```bash
NODE_ENV=production npm start
```

Output:
```
🚀 CrimeDashboardAPI running on port 5000
📖 API Docs: http://localhost:5000/api/v1/docs
🌍 Environment: development
✅ Scheduler dimulai: setiap 60 menit
```

### 8. Konfigurasi API Sumber Data

Setelah server jalan, login dan set URL sumber API via endpoint:

```bash
# 1. Login dulu
curl -X POST http://localhost:5000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"Admin@1234!"}'

# 2. Set source API URL (gunakan token dari response login)
curl -X PUT http://localhost:5000/api/v1/settings/source_api_base_url \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"value":"http://localhost:3000/api/v1"}'

# 3. Set source API token
curl -X PUT http://localhost:5000/api/v1/settings/source_api_token \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"value":"your_source_api_token"}'

# 4. Trigger sync manual
curl -X POST "http://localhost:5000/api/v1/settings/sync/trigger" \
  -H "Authorization: Bearer <token>"
```

---

## 🔐 Role & Akses

| Role | User Mgmt | Semua Wilayah | Setting | Sync | AI Insight |
|------|-----------|---------------|---------|------|------------|
| **admin** | ✅ Full | ✅ | ✅ | ✅ | ✅ |
| **manager** | ✅ Read | ✅ | 👁️ Read | ✅ | ✅ |
| **polda** | Polres saja | Polda sendiri | ❌ | ❌ | ✅ |
| **polres** | Diri sendiri | Polres sendiri | ❌ | ❌ | ✅ |

---

## 📡 Endpoint Utama

### Auth
| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| POST | `/auth/login` | Login, dapatkan access + refresh token |
| POST | `/auth/logout` | Logout & invalidate token |
| POST | `/auth/refresh` | Refresh access token |
| GET  | `/auth/me` | Data user aktif |
| PUT  | `/auth/change-password` | Ganti password |

### User Management
| Method | Endpoint | Role |
|--------|----------|------|
| GET  | `/users` | polda+ |
| POST | `/users` | polda+ |
| PUT  | `/users/:id` | polda+ |
| DELETE | `/users/:id` | manager+ |
| PATCH | `/users/:id/toggle-active` | manager+ |
| POST | `/users/:id/unlock` | admin |

### Laporan (LP Model A & B)

Contoh request sesuai spesifikasi:

```bash
# LP Model A dengan filter waktu
curl "http://localhost:5000/api/v1/laporan/a?from=2026-04-15&to=2026-04-16&from_hour=10:30:01&to_hour=11:00:00&showby=updated_at&page=1&limit=500&order_by=updated_at" \
  -H "Authorization: Bearer <token>"

# LP Model B
curl "http://localhost:5000/api/v1/laporan/b?from=2026-04-15&to=2026-04-15&from_hour=10:30:01&to_hour=11:00:00&page=1&showby=updated_at&order_by=updated_at" \
  -H "Authorization: Bearer <token>"

# Pencarian gabungan
curl "http://localhost:5000/api/v1/laporan/search?q=narkoba" \
  -H "Authorization: Bearer <token>"
```

**Filter yang tersedia:**

| Parameter | Tipe | Contoh | Keterangan |
|-----------|------|--------|------------|
| `from` | string | `2026-04-15` | Tanggal mulai (YYYY-MM-DD) |
| `to` | string | `2026-04-16` | Tanggal akhir |
| `from_hour` | string | `10:30:01` | Jam mulai (HH:mm:ss) |
| `to_hour` | string | `11:00:00` | Jam akhir |
| `showby` | enum | `updated_at` | Field date yang difilter |
| `order_by` | enum | `updated_at` | Field urutan |
| `sort` | enum | `DESC` | ASC / DESC |
| `page` | int | `1` | Halaman |
| `limit` | int | `50` | Maks 500 |
| `id_polda` | string | `060.12` | Filter polda |
| `id_polres` | string | `060.17.30` | Filter polres |
| `kategori_kejahatan` | string | `Narkotika` | Filter kategori |
| `q` | string | `benda` | Pencarian bebas |

### Dashboard
| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| GET | `/dashboard/summary` | Total laporan, kerugian, per-kategori, per-wilayah |
| GET | `/dashboard/heatmap` | Koordinat untuk heatmap geospasial |
| GET | `/dashboard/trend?granularity=day` | Tren harian/mingguan/bulanan |
| GET | `/dashboard/drilldown?level=polres` | Drill-down polda→polres→polsek |
| GET | `/dashboard/korban-pelaku` | Profil demografi korban & pelaku |
| GET | `/dashboard/anomaly?threshold=2.0` | Deteksi lonjakan anomali |
| GET | `/dashboard/clustering?precision=2` | Grid clustering hotspot |

### AI Insight
| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| POST | `/insight/classify` | NLP klasifikasi otomatis teks laporan |
| GET  | `/insight/briefing?date=2026-04-16` | Briefing harian untuk pimpinan |
| GET  | `/insight/smart-search?q=curanmor malam` | Pencarian semantik |
| GET  | `/insight/forecast` | Prediksi zona & waktu rawan |

### Settings
| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| GET  | `/settings` | List semua konfigurasi |
| PUT  | `/settings/:key` | Update nilai (admin only) |
| POST | `/settings/sync/trigger?tipe=a` | Trigger sync manual |
| GET  | `/settings/sync/logs` | Riwayat sinkronisasi |

---

## 🔄 Format Response

### Sukses (single data)
```json
{
  "success": true,
  "message": "Success",
  "data": { ... }
}
```

### Sukses (list/paginated)
```json
{
  "success": true,
  "message": "Success",
  "meta": {
    "total": 145,
    "per_page": 50,
    "current_page": 1,
    "last_page": 3,
    "from": 1,
    "to": 50
  },
  "data": [ ... ]
}
```

### Error
```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    { "field": "from", "message": "from harus format YYYY-MM-DD" }
  ]
}
```

---

## ⏱️ Konfigurasi Interval Sinkronisasi

Ubah interval via API (admin only):

```bash
# Sync setiap 30 menit
curl -X PUT http://localhost:5000/api/v1/settings/sync_interval_minutes \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"value": "30"}'
```

| Nilai (menit) | Cron Expression | Keterangan |
|---------------|-----------------|------------|
| 15 | `*/15 * * * *` | Setiap 15 menit |
| 30 | `*/30 * * * *` | Setiap 30 menit |
| 60 | `0 * * * *` | Setiap 1 jam |
| 1440 | `0 0 * * *` | Setiap hari |

---

## 🛡️ Security Checklist

- ✅ Helmet.js (15+ HTTP security headers)
- ✅ CORS whitelist berbasis environment
- ✅ XSS sanitization (xss-clean)
- ✅ Rate limiting (global + auth endpoint)
- ✅ Joi input validation + stripUnknown
- ✅ Bcrypt password hashing (12 rounds)
- ✅ JWT access + refresh token rotation
- ✅ Account lockout (5 gagal = 15 menit)
- ✅ Soft delete (paranoid mode)
- ✅ SQL Injection prevention (Sequelize ORM + parameterized queries)
- ✅ Privilege escalation protection di RBAC
- ✅ Wilayah scope enforcement (polda/polres isolation)
- ✅ Sensitive value masking di settings response
- ✅ Winston daily-rotate logging dengan request ID

---

## 🐳 Deployment Production (Docker)

```bash
# Build image
docker build -t crime-dashboard-api .

# Run dengan environment file
docker run -d \
  --name crime-api \
  -p 5000:5000 \
  --env-file .env \
  crime-dashboard-api
```

Contoh `Dockerfile` sederhana:

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
EXPOSE 5000
CMD ["node", "src/app.js"]
```

---

## 📖 API Documentation

Setelah server jalan, akses Swagger UI:

```
http://localhost:5000/api/v1/docs
```

Raw OpenAPI spec (JSON):
```
http://localhost:5000/api/v1/docs.json
```

---

## 🔍 Troubleshooting

**Database connection refused:**
```bash
# Pastikan MySQL berjalan
sudo systemctl status mysql
# Cek kredensial di .env
```

**JWT_SECRET terlalu pendek:**
```bash
# Generate random secret
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

**Port sudah dipakai:**
```bash
# Ganti PORT di .env
PORT=5001
```

**Scheduler tidak berjalan:**
```bash
# Cek setting sync_enabled di DB
GET /api/v1/settings/sync_enabled
# Set ke true jika false
PUT /api/v1/settings/sync_enabled  body: {"value": "true"}
```




TOKEN="Bearer <access_token_anda>"

# 1. Set Base URL
curl -X PUT http://localhost:5000/api/v1/settings/source_api_base_url \
  -H "Authorization: $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"value":"https://dors.stamaops.polri.go.id/api/v1"}'

# 2. Set CLIENTID
curl -X PUT http://localhost:5000/api/v1/settings/source_api_client_id \
  -H "Authorization: $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"value":"ee368e01a04340d02ee35cb4a1dd6dfc"}'

# 3. Set Cookie (nilai terbaru dari curl Anda)
curl -X PUT http://localhost:5000/api/v1/settings/source_api_cookie \
  -H "Authorization: $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"value":"laravel_session=eyJpdiI6ImNJck1vUDdteVU2aFdZQVcyWndwRnc9PSIsInZhbHVlIjoiZ3BVWnlaSks2RHFRc1lzSE1JYkVHbllhTWNpOHViOFh1SkwxZTl6Z2JmazlaUnpXb0RWVkZ0MDZsSWdtRytXMStNWE93N2d0eER0YjBSU1ZKVVJMMmc9PSIsIm1hYyI6IjVhMjgwNDNhOWIyYWJkNTAzMTU3N2M5MTUwYmFjZTUxMjIxYmMxYWIxOWIzZDE1NzUyOTdmYzM2ZmM0OWQwZmEifQ=="}'

# 4. Verifikasi semua setting sudah tersimpan
curl http://localhost:5000/api/v1/settings \
  -H "Authorization: $TOKEN"

# 5. Trigger sync manual untuk test
curl -X POST http://localhost:5000/api/v1/settings/sync/trigger \
  -H "Authorization: $TOKEN"