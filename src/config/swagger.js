'use strict';

const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Crime Dashboard API',
      version: '1.0.0',
      description: `
## Sistem Informasi Kriminalitas — Backend API

API untuk dashboard mapping kejahatan, analitik geospasial, dan AI insight berbasis data LP Model A & B Kepolisian Indonesia.

### Autentikasi
Semua endpoint (kecuali \`/auth/login\` dan \`/health\`) memerlukan **Bearer Token** di header:
\`\`\`
Authorization: Bearer <access_token>
\`\`\`

### Role & Akses
| Role | Deskripsi |
|------|-----------|
| admin | Akses penuh ke semua fitur & wilayah |
| manager | Baca semua data, kelola setting |
| polda | Data terbatas pada wilayah polda sendiri |
| polres | Data terbatas pada wilayah polres sendiri |

### Filter Waktu (LP Endpoints)
\`from\`, \`to\` dalam format \`YYYY-MM-DD\`, \`from_hour\`/\`to_hour\` dalam format \`HH:mm:ss\`.
Field yang difilter ditentukan oleh parameter \`showby\`.
      `,
      contact: { name: 'Support', email: 'admin@polri.go.id' },
      license: { name: 'Internal Use Only' },
    },
    servers: [
      { url: `http://localhost:${process.env.PORT || 5000}/api/${process.env.API_VERSION || 'v1'}`, description: 'Development' },
      { url: `https://api.crimedash.polri.go.id/api/v1`, description: 'Production' },
    ],
    components: {
      securitySchemes: {
        BearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
      schemas: {
        SuccessResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            message: { type: 'string', example: 'Success' },
            data: { type: 'object' },
          },
        },
        PaginatedResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
            meta: {
              type: 'object',
              properties: {
                total: { type: 'integer' },
                per_page: { type: 'integer' },
                current_page: { type: 'integer' },
                last_page: { type: 'integer' },
                from: { type: 'integer' },
                to: { type: 'integer' },
              },
            },
            data: { type: 'array', items: {} },
          },
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string' },
            errors: { type: 'array', items: { type: 'object' } },
          },
        },
        LaporanA: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            no_laporan: { type: 'string' },
            kategori: { type: 'string', example: 'lp_model_a' },
            waktu_kejadian: { type: 'string', format: 'date-time' },
            tempat_kejadian: { type: 'string' },
            koordinat_lat: { type: 'number' },
            koordinat_lng: { type: 'number' },
            apa_terjadi: { type: 'string' },
            uraian_kejadian: { type: 'string' },
            kerugian: { type: 'integer' },
            nama_polda: { type: 'string' },
            nama_polres: { type: 'string' },
            nama_kategori_kejahatan: { type: 'string' },
            provinsi: { type: 'string' },
            updated_at: { type: 'string', format: 'date-time' },
          },
        },
        User: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            nama: { type: 'string' },
            username: { type: 'string' },
            email: { type: 'string', format: 'email' },
            role: { type: 'string', enum: ['admin', 'manager', 'polda', 'polres'] },
            id_polda: { type: 'string', nullable: true },
            id_polres: { type: 'string', nullable: true },
            is_active: { type: 'boolean' },
            last_login: { type: 'string', format: 'date-time', nullable: true },
          },
        },
      },
    },
    security: [{ BearerAuth: [] }],
    paths: {
      '/health': {
        get: {
          tags: ['System'],
          summary: 'Health check',
          security: [],
          responses: { 200: { description: 'API aktif' } },
        },
      },
      '/auth/login': {
        post: {
          tags: ['Auth'],
          summary: 'Login user',
          security: [],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['username', 'password'],
                  properties: {
                    username: { type: 'string', example: 'admin' },
                    password: { type: 'string', example: 'Admin@1234' },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: 'Login berhasil',
              content: {
                'application/json': {
                  schema: {
                    allOf: [
                      { $ref: '#/components/schemas/SuccessResponse' },
                      {
                        properties: {
                          data: {
                            type: 'object',
                            properties: {
                              access_token: { type: 'string' },
                              refresh_token: { type: 'string' },
                              token_type: { type: 'string', example: 'Bearer' },
                              expires_in: { type: 'string', example: '8h' },
                              user: { $ref: '#/components/schemas/User' },
                            },
                          },
                        },
                      },
                    ],
                  },
                },
              },
            },
            401: { description: 'Username atau password salah' },
            429: { description: 'Terlalu banyak percobaan login' },
          },
        },
      },
      '/auth/me': {
        get: { tags: ['Auth'], summary: 'Profil user aktif', responses: { 200: { description: 'Data user' } } },
      },
      '/auth/logout': {
        post: { tags: ['Auth'], summary: 'Logout & invalidate refresh token', responses: { 200: { description: 'Logout berhasil' } } },
      },
      '/auth/refresh': {
        post: {
          tags: ['Auth'], summary: 'Refresh access token', security: [],
          requestBody: {
            content: { 'application/json': { schema: { type: 'object', properties: { refresh_token: { type: 'string' } } } } },
          },
          responses: { 200: { description: 'Token baru' }, 401: { description: 'Refresh token tidak valid' } },
        },
      },
      '/laporan/a': {
        get: {
          tags: ['Laporan'],
          summary: 'List LP Model A dengan filter & pagination',
          parameters: [
            { name: 'from', in: 'query', schema: { type: 'string', example: '2026-04-15' }, description: 'Tanggal mulai (YYYY-MM-DD)' },
            { name: 'to', in: 'query', schema: { type: 'string', example: '2026-04-16' } },
            { name: 'from_hour', in: 'query', schema: { type: 'string', example: '10:30:01' } },
            { name: 'to_hour', in: 'query', schema: { type: 'string', example: '11:00:00' } },
            { name: 'showby', in: 'query', schema: { type: 'string', enum: ['updated_at', 'created_at', 'tgl_laporan', 'waktu_kejadian'] } },
            { name: 'order_by', in: 'query', schema: { type: 'string', example: 'updated_at' } },
            { name: 'sort', in: 'query', schema: { type: 'string', enum: ['ASC', 'DESC'] } },
            { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 50, maximum: 500 } },
            { name: 'id_polda', in: 'query', schema: { type: 'string' } },
            { name: 'id_polres', in: 'query', schema: { type: 'string' } },
            { name: 'kategori_kejahatan', in: 'query', schema: { type: 'string', example: 'Narkotika' } },
            { name: 'q', in: 'query', schema: { type: 'string' }, description: 'Pencarian bebas' },
          ],
          responses: {
            200: {
              description: 'Daftar LP Model A',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/PaginatedResponse' } } },
            },
          },
        },
      },
      '/laporan/b': {
        get: { tags: ['Laporan'], summary: 'List LP Model B — parameter sama dengan LP/A' },
      },
      '/laporan/search': {
        get: {
          tags: ['Laporan'], summary: 'Pencarian gabungan LP A & B',
          parameters: [{ name: 'q', in: 'query', required: true, schema: { type: 'string', example: 'narkoba benda' } }],
        },
      },
      '/dashboard/summary': {
        get: { tags: ['Dashboard'], summary: 'Ringkasan total laporan, kerugian, per-kategori & wilayah' },
      },
      '/dashboard/heatmap': {
        get: { tags: ['Dashboard'], summary: 'Titik koordinat untuk heatmap geospasial' },
      },
      '/dashboard/trend': {
        get: {
          tags: ['Dashboard'], summary: 'Tren temporal kejahatan',
          parameters: [{ name: 'granularity', in: 'query', schema: { type: 'string', enum: ['day', 'week', 'month'] } }],
        },
      },
      '/dashboard/drilldown': {
        get: {
          tags: ['Dashboard'], summary: 'Drill-down wilayah (polda → polres → polsek)',
          parameters: [{ name: 'level', in: 'query', schema: { type: 'string', enum: ['polda', 'polres', 'polsek'] } }],
        },
      },
      '/dashboard/anomaly': {
        get: {
          tags: ['Dashboard'], summary: 'Deteksi anomali lonjakan kejahatan per wilayah',
          parameters: [{ name: 'threshold', in: 'query', schema: { type: 'number', default: 2.0 }, description: 'Z-score threshold' }],
        },
      },
      '/dashboard/clustering': {
        get: { tags: ['Dashboard'], summary: 'Grid clustering untuk crime hotspot' },
      },
      '/insight/classify': {
        post: {
          tags: ['Insight'], summary: 'NLP: Klasifikasi otomatis teks laporan kejadian',
          requestBody: {
            content: {
              'application/json': {
                schema: { type: 'object', required: ['uraian'], properties: { uraian: { type: 'string', example: 'Pada hari Kamis...' } } },
              },
            },
          },
        },
      },
      '/insight/briefing': {
        get: {
          tags: ['Insight'], summary: 'Buat briefing harian otomatis berbasis AI',
          parameters: [{ name: 'date', in: 'query', schema: { type: 'string', example: '2026-04-16' } }],
        },
      },
      '/insight/smart-search': {
        get: {
          tags: ['Insight'], summary: 'Pencarian semantik menggunakan AI',
          parameters: [{ name: 'q', in: 'query', required: true, schema: { type: 'string', example: 'curanmor malam hari di pemukiman bulan April' } }],
        },
      },
      '/insight/forecast': {
        get: { tags: ['Insight'], summary: 'Predictive policing: prediksi zona & waktu rawan kejahatan' },
      },
      '/settings': {
        get: { tags: ['Settings'], summary: 'List semua konfigurasi sistem' },
      },
      '/settings/{key}': {
        get: { tags: ['Settings'], summary: 'Detail satu setting', parameters: [{ name: 'key', in: 'path', required: true, schema: { type: 'string' } }] },
        put: { tags: ['Settings'], summary: 'Update nilai setting (admin only)' },
      },
      '/settings/sync/trigger': {
        post: {
          tags: ['Settings'], summary: 'Trigger manual sinkronisasi data',
          parameters: [{ name: 'tipe', in: 'query', schema: { type: 'string', enum: ['a', 'b'] }, description: 'Kosongkan untuk sync semua' }],
        },
      },
      '/settings/sync/logs': {
        get: { tags: ['Settings'], summary: 'Log riwayat sinkronisasi data' },
      },
    },
  },
  apis: [],
};

const specs = swaggerJsdoc(options);
module.exports = specs;
