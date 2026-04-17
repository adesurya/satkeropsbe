'use strict';

const axios = require('axios');
const moment = require('moment');
const { LaporanA, LaporanB, Terlibat, ApiSetting, SyncLog } = require('../models');
const { sequelize } = require('../config/database');
const cache = require('../utils/cache');
const logger = require('../utils/logger');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Parse koordinat from tempat_kejadian string
 * Handles both: "TITIK KOORDINAT -6.566,106.284" and "TITIK KOORDINAT -6.566, 106.284"
 */
const parseKoordinat = (tempat) => {
  if (!tempat) return { lat: null, lng: null };
  const match = tempat.match(/TITIK KOORDINAT\s*([-\d.]+)\s*,\s*([-\d.]+)/i);
  if (match) {
    const lat = parseFloat(match[1]);
    const lng = parseFloat(match[2]);
    // Sanity check: valid Indonesia coordinates
    if (lat >= -11 && lat <= 6 && lng >= 95 && lng <= 141) {
      return { lat, lng };
    }
  }
  return { lat: null, lng: null };
};

/**
 * Parse kerugian — handles "500.000", "1.500.000", "0", null
 */
const parseKerugian = (val) => {
  if (!val || val === '0' || val === '-') return 0;
  // Remove dots used as thousand separators, keep only digits
  const cleaned = String(val).replace(/\./g, '').replace(/[^\d]/g, '');
  return parseInt(cleaned) || 0;
};

/**
 * Strip HTML tags from string
 */
const stripHtml = (str) => {
  if (!str) return null;
  return String(str).replace(/<[^>]*>/g, '').trim() || null;
};

/**
 * Get setting value from DB with fallback
 */
const getSetting = async (key, defaultVal = null) => {
  try {
    const s = await ApiSetting.findOne({ where: { key } });
    return s?.value ?? defaultVal;
  } catch {
    return defaultVal;
  }
};

/**
 * Build Axios client using CLIENTID + Cookie auth (dors.stamaops.polri.go.id style)
 */
const getApiClient = async () => {
  const baseURL = (await getSetting('source_api_base_url', ''))
    || process.env.SOURCE_API_BASE_URL
    || 'https://dors.stamaops.polri.go.id/api/v1';

  const clientId = (await getSetting('source_api_client_id', ''))
    || process.env.SOURCE_API_CLIENT_ID
    || '';

  const cookie = (await getSetting('source_api_cookie', ''))
    || process.env.SOURCE_API_COOKIE
    || '';

  const headers = { 'Content-Type': 'application/json' };
  if (clientId) headers['CLIENTID'] = clientId;
  if (cookie)   headers['Cookie']   = cookie;

  return axios.create({
    baseURL,
    timeout: parseInt(process.env.SOURCE_API_TIMEOUT || '30000'),
    headers,
  });
};

/**
 * Map raw API record to DB columns
 */
const mapLaporan = (raw) => {
  const { lat, lng } = parseKoordinat(raw.tempat_kejadian);
  return {
    id:                     raw.id,
    id_satuan:              raw.id_satuan,
    id_polda:               raw.id_polda,
    id_polres:              raw.id_polres,
    id_polsek:              raw.id_polsek || null,
    id_unit_terusan:        raw.id_unit_terusan,
    no_laporan:             raw.no_laporan,
    no_sttlp:               raw.no_sttlp || null,
    kategori:               raw.kategori,
    tgl_laporan:            raw.tgl_laporan,
    zona_waktu:             raw.zona_waktu,
    waktu_kejadian:         raw.waktu_kejadian || null,
    waktu_kejadian_faktual: raw.waktu_kejadian_faktual,
    tempat_kejadian:        raw.tempat_kejadian,
    koordinat_lat:          lat,
    koordinat_lng:          lng,
    apa_terjadi:            stripHtml(raw.apa_terjadi),
    bagaimana_terjadi:      raw.bagaimana_terjadi || null,
    uraian_kejadian:        raw.uraian_kejadian || null,
    uraian_singkat_kejadian: raw.uraian_singkat_kejadian || null,
    nrp_penerima:           raw.nrp_penerima,
    nrp_mengetahui:         raw.nrp_mengetahui,
    nama_mengetahui:        raw.nama_mengetahui,
    pangkat_mengetahui:     raw.pangkat_mengetahui,
    nrp_pembuat:            raw.nrp_pembuat || null,
    nama_pembuat:           raw.nama_pembuat || null,
    pangkat_pembuat:        raw.pangkat_pembuat || null,
    kerugian:               parseKerugian(raw.kerugian),
    id_pasal_kamtibmas:     raw.id_pasal_kamtibmas,
    id_kategori_lokasi:     raw.id_kategori_lokasi,
    tkp_id_provinsi:        raw.tkp_id_provinsi,
    tkp_id_kota:            raw.tkp_id_kota,
    tkp_id_kecamatan:       raw.tkp_id_kecamatan,
    tkp_id_desa:            raw.tkp_id_desa,
    id_emp_sasaran_kejahatan: raw.id_emp_sasaran_kejahatan,
    id_emp_modus_operandi:  raw.id_emp_modus_operandi,
    id_emp_motif_kejahatan: raw.id_emp_motif_kejahatan,
    status_aktif:           raw.status_aktif ?? true,
    id_operasi:             raw.id_operasi || null,
    dilimpahkan:            raw.dilimpahkan || 0,
    pelimpahan:             raw.pelimpahan || 0,
    id_hubungan_korban_pelaku: raw.id_hubungan_korban_pelaku,
    perhatian_publik:       raw.perhatian_publik || false,
    // Denormalized fields for query performance
    nama_polda:             raw.polda?.nama || null,
    nama_polres:            raw.polres?.nama || null,
    nama_polsek:            raw.polsek?.nama || null,
    nama_kategori_kejahatan: raw.kategori_gk?.keterangan
                              || stripHtml(raw.apa_terjadi)
                              || null,
    nama_kategori_lokasi:   raw.kategori_lokasi?.lokasi || null,
    provinsi:               raw.tkp_provinsi?.provinsi || null,
    kabupaten:              raw.tkp_kota?.kabupaten || null,
    kecamatan:              raw.tkp_kecamatan?.kecamatan || null,
    desa:                   raw.tkp_desa?.desa || null,
    raw_json:               raw,
    synced_at:              new Date(),
    updated_at:             raw.updated_at ? new Date(raw.updated_at) : new Date(),
    created_at:             raw.created_at ? new Date(raw.created_at) : new Date(),
  };
};

/**
 * Map terlibat records to DB columns
 */
const mapTerlibat = (terlibat, id_laporan, tipe) =>
  terlibat.map(t => ({
    id:               t.id,
    id_laporan,
    tipe_laporan:     tipe,
    nik:              t.nik || null,
    keterlibatan:     ['pelapor', 'korban', 'saksi', 'terlapor'].includes(t.keterlibatan)
                        ? t.keterlibatan : null,
    nama:             t.nama || null,
    gender:           t.gender || null,
    tempat_lahir:     t.tempat_lahir || null,
    tgl_lahir:        t.tgl_lahir || null,
    kewarganegaraan:  t.kewarganegaraan || null,
    pekerjaan:        t.pekerjaan || null,
    alamat:           t.alamat || null,
    no_hp:            t.no_hp || null,
    agama:            t.agama || null,
    status_korban:    t.status_korban || null,
    jenis_identitas:  t.jenis_identitas || null,
    pendidikan_terakhir: t.pendidikan_terakhir || null,
    suku:             t.suku || null,
    jenis_kelamin:    t.jenis_kelamin || null,
  }));

/**
 * Extract a meaningful error message from any error type (Axios, DB, generic)
 */
const extractErrorMessage = (error) => {
  // Axios HTTP error (got a response from server)
  if (error.response) {
    const status = error.response.status;
    const body   = JSON.stringify(error.response.data ?? '').substring(0, 300);
    return `HTTP ${status} — ${body}`;
  }
  // Axios network error (no response, e.g. timeout, DNS fail, connection refused)
  if (error.request) {
    return `Network error — ${error.code || 'NO_RESPONSE'}: ${error.message || 'Tidak ada response dari server'}`;
  }
  // Generic JS error
  return error.message || String(error) || 'Unknown error';
};

/**
 * Sync ONE specific date for one endpoint type
 * API is filtered per-day: from=YYYY-MM-DD to=YYYY-MM-DD
 */
const syncDay = async (tipe, dateStr, client) => {
  const Model = tipe === 'a' ? LaporanA : LaporanB;
  const limit = 500;
  let page = 1;
  let hasMore = true;
  let total_fetched = 0, total_inserted = 0, total_updated = 0, total_skipped = 0;

  while (hasMore) {
    logger.info(`[Sync LP${tipe.toUpperCase()}] date=${dateStr} page=${page}`);

    const response = await client.get(`/lp_${tipe}`, {
      params: {
        from:      dateStr,
        to:        dateStr,
        from_hour: '00:00:00',   // ambil data full 1 hari penuh
        to_hour:   '23:59:59',
        showby:    'updated_at',
        order_by:  'updated_at',
        page,
        limit,
      },
    });

    const data = response.data;
    const records = data?.data || [];
    total_fetched += records.length;

    if (records.length === 0) break;

    // Upsert in transaction — duplicates are handled gracefully (INSERT ON DUPLICATE KEY UPDATE)
    await sequelize.transaction(async (t) => {
      for (const raw of records) {
        try {
          const mapped = mapLaporan(raw);

          // Sequelize upsert: INSERT if new, UPDATE if duplicate (based on primary key `id`)
          // Duplicate records will NOT throw — they are silently updated
          const [, created] = await Model.upsert(mapped, {
            transaction: t,
            returning: false, // perf: skip returning full object
          });

          if (created) total_inserted++;
          else total_updated++;

          // Upsert terlibat — same duplicate-safe behavior
          if (Array.isArray(raw.terlibat) && raw.terlibat.length > 0) {
            const terlibatData = mapTerlibat(raw.terlibat, raw.id, tipe);
            for (const td of terlibatData) {
              try {
                await Terlibat.upsert(td, { transaction: t, returning: false });
              } catch (tErr) {
                // Log terlibat upsert error but don't abort the whole transaction
                logger.warn(`[Sync] terlibat id=${td.id} upsert warning: ${tErr.message}`);
                total_skipped++;
              }
            }
          }
        } catch (recordErr) {
          // Log individual record error but continue processing other records
          logger.warn(`[Sync LP${tipe.toUpperCase()}] Record id=${raw.id} skipped: ${recordErr.message}`);
          total_skipped++;
        }
      }
    });

    logger.info(
      `[Sync LP${tipe.toUpperCase()}] date=${dateStr} page=${page}: ` +
      `fetched=${records.length} inserted=${total_inserted} updated=${total_updated} skipped=${total_skipped}`
    );

    // Pagination check
    const lastPage = data.last_page ?? 1;
    if (page >= lastPage || records.length < limit) {
      hasMore = false;
    } else {
      page++;
    }

    if (page > 50) {
      hasMore = false;
      logger.warn(`[Sync LP${tipe.toUpperCase()}] Safety cap 50 pages reached for date=${dateStr}`);
    }
  }

  return { total_fetched, total_inserted, total_updated, total_skipped };
};

// ─── Check if new data available (startup probe) ──────────────────────────────

/**
 * Probe the API for today's data without full sync.
 * Returns { hasNew: bool, total: number }
 */
const checkForNewData = async (tipe = 'a') => {
  try {
    const client = await getApiClient();
    const today = moment().format('YYYY-MM-DD');
    const response = await client.get(`/lp_${tipe}`, {
      params: { from: today, to: today, from_hour: '00:00:00', to_hour: '23:59:59', showby: 'updated_at', page: 1, limit: 1 },
    });
    const total = response.data?.total || 0;
    logger.info(`[Probe LP${tipe.toUpperCase()}] today=${today} total=${total}`);
    return { hasNew: total > 0, total, date: today };
  } catch (err) {
    const detail = extractErrorMessage(err);
    logger.warn(`[Probe LP${tipe.toUpperCase()}] Gagal: ${detail}`);
    return { hasNew: false, total: 0, error: detail };
  }
};

// ─── Main Sync Functions ──────────────────────────────────────────────────────

/**
 * Sync a date range day-by-day for one endpoint type
 * @param {string} tipe - 'a' or 'b'
 * @param {string} fromDate - YYYY-MM-DD
 * @param {string} toDate   - YYYY-MM-DD
 * @param {string} triggeredBy - 'scheduler' | 'startup' | 'manual'
 */
const syncEndpoint = async (tipe, fromDate, toDate, triggeredBy = 'scheduler') => {
  const startTime = Date.now();
  const log = await SyncLog.create({
    tipe:         `lp_${tipe}`,
    status:       'running',
    params_used:  { from: fromDate, to: toDate, triggeredBy },
    started_at:   new Date(),
    triggered_by: triggeredBy,
  });

  let total_fetched = 0, total_inserted = 0, total_updated = 0, total_skipped = 0;

  try {
    // Validate credentials before starting — give clear error instead of empty message
    const clientId = (await getSetting('source_api_client_id', '')) || process.env.SOURCE_API_CLIENT_ID || '';
    const cookie   = (await getSetting('source_api_cookie',    '')) || process.env.SOURCE_API_COOKIE    || '';
    if (!clientId) {
      throw new Error('Kredensial CLIENTID belum diset. Gunakan: PUT /api/v1/settings/source_api_client_id');
    }
    if (!cookie) {
      throw new Error('Kredensial Cookie belum diset. Gunakan: PUT /api/v1/settings/source_api_cookie');
    }

    const client = await getApiClient();

    // Build list of dates from fromDate to toDate (day-by-day)
    const dates = [];
    const cur = moment(fromDate);
    const end = moment(toDate);
    while (cur.isSameOrBefore(end, 'day')) {
      dates.push(cur.format('YYYY-MM-DD'));
      cur.add(1, 'day');
    }

    logger.info(`[Sync LP${tipe.toUpperCase()}] Syncing ${dates.length} day(s): ${fromDate} → ${toDate}`);

    for (const dateStr of dates) {
      const result = await syncDay(tipe, dateStr, client);
      total_fetched  += result.total_fetched;
      total_inserted += result.total_inserted;
      total_updated  += result.total_updated;
      total_skipped  += result.total_skipped || 0;
    }

    // Invalidate dashboard cache after successful sync
    await cache.delPattern('dashboard:*');
    await cache.delPattern('laporan:*');
    logger.info('[Sync] Redis cache invalidated after sync');

    await log.update({
      status:         'success',
      total_fetched,
      total_inserted,
      total_updated,
      total_skipped,
      finished_at:    new Date(),
      duration_ms:    Date.now() - startTime,
    });

    logger.info(
      `[Sync LP${tipe.toUpperCase()}] ✅ Done — ` +
      `Fetched:${total_fetched} Inserted:${total_inserted} Updated:${total_updated} Skipped:${total_skipped} ` +
      `(${((Date.now() - startTime) / 1000).toFixed(1)}s)`
    );
  } catch (error) {
    const errMsg = extractErrorMessage(error);
    await log.update({
      status:        'failed',
      total_fetched,
      total_inserted,
      total_updated,
      total_skipped,
      error_message: errMsg.substring(0, 1000),
      finished_at:   new Date(),
      duration_ms:   Date.now() - startTime,
    });
    logger.error(`[Sync LP${tipe.toUpperCase()}] ❌ Failed: ${errMsg}`);
    throw error;
  }

  return { total_fetched, total_inserted, total_updated };
};

/**
 * Sync all enabled endpoint types for a date range
 */
const syncAll = async (options = {}) => {
  const {
    tipe       = null,           // null = both, 'a', or 'b'
    triggeredBy = 'scheduler',
    daysBack   = null,           // null = use DB setting
  } = options;

  const syncA = await getSetting('sync_lp_a_enabled', 'true');
  const syncB = await getSetting('sync_lp_b_enabled', 'true');
  const back  = daysBack ?? parseInt(await getSetting('sync_days_back', '2'));

  const toDate   = moment().format('YYYY-MM-DD');
  const fromDate = moment().subtract(back, 'days').format('YYYY-MM-DD');

  const results = {};

  if ((!tipe || tipe === 'a') && syncA === 'true') {
    results.a = await syncEndpoint('a', fromDate, toDate, triggeredBy)
      .catch(e => ({ error: e.message }));
  }
  if ((!tipe || tipe === 'b') && syncB === 'true') {
    results.b = await syncEndpoint('b', fromDate, toDate, triggeredBy)
      .catch(e => ({ error: e.message }));
  }

  return { from: fromDate, to: toDate, results };
};

/**
 * Startup sync: always sync last 2 days on boot.
 * Probe is informational only — sync runs regardless of result.
 * Duplicate records are safely handled by upsert (no error if data already exists).
 */
const startupSync = async () => {
  logger.info('[Startup] ═══════════════════════════════════════════');
  logger.info('[Startup] Memulai initial sync 2 hari terakhir...');
  logger.info('[Startup] Duplikasi data akan diabaikan secara otomatis (upsert)');
  logger.info('[Startup] ═══════════════════════════════════════════');

  // Step 1: Probe (informational only, does NOT block sync)
  try {
    const [probeA, probeB] = await Promise.all([
      checkForNewData('a'),
      checkForNewData('b'),
    ]);
    logger.info(`[Startup] Probe — LP/A hari ini: ${probeA.total} | LP/B hari ini: ${probeB.total}`);
    if (probeA.error || probeB.error) {
      logger.warn('[Startup] Probe gagal (API credentials mungkin belum diset), tetap lanjut sync...');
    }
  } catch (e) {
    logger.warn('[Startup] Probe error (non-fatal):', e.message);
  }

  // Step 2: Always sync last 2 days — probe result does NOT matter
  const daysBack = parseInt(await getSetting('sync_days_back', '2'));
  const fromDate = moment().subtract(daysBack, 'days').format('YYYY-MM-DD');
  const toDate   = moment().format('YYYY-MM-DD');
  logger.info(`[Startup] Sync range: ${fromDate} → ${toDate} (${daysBack} hari ke belakang)`);

  await syncAll({ triggeredBy: 'startup', daysBack });

  logger.info('[Startup] ✅ Initial sync selesai');
};

module.exports = { syncAll, syncEndpoint, startupSync, checkForNewData };