'use strict';

const axios = require('axios');
const { Op } = require('sequelize');
const { Tahanan, ApiSetting } = require('../models');
const logger = require('../utils/logger');

// Kolom yang diperbarui saat upsert (semua kecuali PK `id`)
const UPDATE_COLUMNS = Object.keys(Tahanan.rawAttributes).filter((k) => k !== 'id');

const BATCH_SIZE = 500;
const MAX_PAGES = parseInt(process.env.TAHANAN_MAX_PAGES || '500', 10);
const LAST_SYNC_KEY = 'tahanan_last_sync';

// ── Helpers konversi nilai sumber ────────────────────────────────────────────
const toDate = (v) => {
  if (!v) return null;
  const s = String(v).trim();
  return s.length ? s : null;
};
const toInt = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? null : n;
};
const toStr = (v) => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length ? s : null;
};

/**
 * Petakan satu record sumber → atribut model Tahanan.
 * kode_polda/kode_polres/kode_polsek sumber dipetakan ke id_polda/id_polres/id_polsek
 * agar konsisten dengan scope wilayah pada tabel laporan.
 */
const mapRecord = (r, syncedAt) => ({
  id: r.id,
  nik: toStr(r.nik),
  nama: toStr(r.nama),
  id_satuan: toInt(r.id_satuan),

  id_polda: toStr(r.kode_polda),
  id_polres: toStr(r.kode_polres),
  id_polsek: toStr(r.kode_polsek),
  nama_polda: toStr(r.polda),
  nama_polres: toStr(r.polres),
  nama_polsek: toStr(r.polsek),

  no_lp: toStr(r.no_lp),

  tgl_masuk: toDate(r.tgl_masuk),
  tgl_keluar: toDate(r.tgl_keluar),
  perkiraan_keluar: toDate(r.perkiraan_keluar),
  tgl_lahir: toDate(r.tgl_lahir),

  gender: toStr(r.gender),
  tipe_tahanan: toStr(r.tipe_tahanan),
  jenis_tahanan: toStr(r.jenis_tahanan),
  kewarganegaraan: toStr(r.kewarganegaraan),
  alamat: toStr(r.alamat),

  id_jenis_kasus: toStr(r.id_jenis_kasus),
  nama_jenis_kasus: toStr(r.nama_jenis_kasus),

  lama_ditahan: toInt(r.lama_ditahan),
  lama_ditahan_1: toInt(r.lama_ditahan_1),
  lama_ditahan_2: toInt(r.lama_ditahan_2),
  lama_ditahan_3: toInt(r.lama_ditahan_3),
  sprin_penahanan: toStr(r.sprin_penahanan),
  sprin_perpanjangan_penahanan_1: toStr(r.sprin_perpanjangan_penahanan_1),
  sprin_perpanjangan_penahanan_2: toStr(r.sprin_perpanjangan_penahanan_2),
  sprin_perpanjangan_penahanan_3: toStr(r.sprin_perpanjangan_penahanan_3),
  tgl_1: toDate(r.tgl_1),
  tgl_2: toDate(r.tgl_2),
  tgl_3: toDate(r.tgl_3),
  alasan_perpanjang_1: toStr(r.alasan_perpanjang_1),
  alasan_perpanjang_2: toStr(r.alasan_perpanjang_2),
  alasan_perpanjang_3: toStr(r.alasan_perpanjang_3),
  alasan_keluar: toStr(r.alasan_keluar),
  keterangan: toStr(r.keterangan),

  titip_lapas: toInt(r.titip_lapas),
  titipan_instansi: toStr(r.titipan_instansi),
  penginput: toStr(r.penginput),

  id_satuan_tempat: toInt(r.id_satuan_tempat),
  kode_polda_tempat: toStr(r.kode_polda_tempat),
  kode_polres_tempat: toStr(r.kode_polres_tempat),
  kode_polsek_tempat: toStr(r.kode_polsek_tempat),

  created_at: toDate(r.created_at),
  updated_at: toDate(r.updated_at),
  synced_at: syncedAt,

  raw_json: r,
});

// ── Settings ──────────────────────────────────────────────────────────────────
const getSettings = async () => {
  const keys = [
    'source_api_base_url', 'source_api_client_id', 'source_api_cookie',
    'tahanan_sync_days_back', 'tahanan_sync_polda_list',
  ];
  const rows = await ApiSetting.findAll({ where: { key: { [Op.in]: keys } } });
  const map = {};
  rows.forEach((r) => { map[r.key] = r.value; });
  return map;
};

const saveLastSync = async (summary) => {
  try {
    const value = JSON.stringify(summary);
    const [row, created] = await ApiSetting.findOrCreate({
      where: { key: LAST_SYNC_KEY },
      defaults: { key: LAST_SYNC_KEY, value, type: 'json', description: 'Ringkasan sinkronisasi tahanan terakhir' },
    });
    if (!created) await row.update({ value });
  } catch (e) {
    logger.warn('[TahananSync] gagal menyimpan ringkasan last-sync:', e.message);
  }
};

const defaultDateRange = (daysBack) => {
  const today = new Date();
  const to = today.toISOString().slice(0, 10);
  const fromD = new Date(today);
  fromD.setDate(fromD.getDate() - Math.max(0, daysBack));
  return { from: fromD.toISOString().slice(0, 10), to };
};

const TahananService = {
  /**
   * Sinkronisasi data tahanan dari API sumber.
   * @param {object} options
   * @param {string} [options.from] YYYY-MM-DD (default: hari ini - days_back)
   * @param {string} [options.to]   YYYY-MM-DD (default: hari ini)
   * @param {string} [options.kodePolda] kode polda tunggal (override daftar setting)
   * @param {string} [options.triggeredBy]
   */
  async sync(options = {}) {
    const startedAt = new Date();
    const settings = await getSettings();

    const base = (settings.source_api_base_url || '').replace(/\/+$/, '');
    const clientId = settings.source_api_client_id;
    const cookie = settings.source_api_cookie;

    if (!base || !clientId || !cookie) {
      throw new Error('Kredensial sumber belum lengkap (source_api_base_url / source_api_client_id / source_api_cookie). Set via /settings.');
    }

    const daysBack = toInt(settings.tahanan_sync_days_back) ?? 2;
    const { from = defaultDateRange(daysBack).from, to = defaultDateRange(daysBack).to } = options;

    // Daftar polda yang akan disinkronkan (sumber memfilter per kode_polda)
    let poldaList;
    if (options.kodePolda) {
      poldaList = [options.kodePolda];
    } else {
      poldaList = (settings.tahanan_sync_polda_list || '060.12')
        .split(',').map((s) => s.trim()).filter(Boolean);
    }

    const client = axios.create({
      baseURL: base,
      timeout: 30000,
      headers: { CLIENTID: clientId, Cookie: cookie },
    });

    const result = {
      from, to, polda: poldaList,
      pages_fetched: 0, records_fetched: 0, upserted: 0,
      errors: [], triggeredBy: options.triggeredBy || 'manual',
      started_at: startedAt, finished_at: null,
    };

    const syncedAt = new Date();

    for (const kodePolda of poldaList) {
      let page = 1;
      let lastPage = 1;
      do {
        let resp;
        try {
          resp = await client.get('/tahanan', {
            params: { from, to, showby: 'updated_at', kode_polda: kodePolda, page },
          });
        } catch (err) {
          const msg = `polda ${kodePolda} page ${page}: ${err.response?.status || ''} ${err.message}`;
          logger.error('[TahananSync] fetch error', msg);
          result.errors.push(msg);
          break; // hentikan polda ini, lanjut polda berikutnya
        }

        const body = resp.data || {};
        const rows = Array.isArray(body.data) ? body.data : [];
        lastPage = parseInt(body.last_page, 10) || 1;
        result.pages_fetched += 1;
        result.records_fetched += rows.length;

        if (rows.length) {
          const mapped = rows.map((r) => mapRecord(r, syncedAt));
          for (let i = 0; i < mapped.length; i += BATCH_SIZE) {
            const chunk = mapped.slice(i, i + BATCH_SIZE);
            try {
              await Tahanan.bulkCreate(chunk, { updateOnDuplicate: UPDATE_COLUMNS });
              result.upserted += chunk.length;
            } catch (err) {
              const msg = `upsert polda ${kodePolda} page ${page}: ${err.message}`;
              logger.error('[TahananSync]', msg);
              result.errors.push(msg);
            }
          }
        }

        page += 1;
      } while (page <= lastPage && page <= MAX_PAGES);
    }

    result.finished_at = new Date();
    result.duration_ms = result.finished_at - startedAt;
    result.status = result.errors.length ? 'completed_with_errors' : 'success';

    await saveLastSync(result);
    logger.info(`[TahananSync] selesai: ${result.upserted} upserted dari ${result.records_fetched} record (${result.pages_fetched} halaman), status=${result.status}`);
    return result;
  },

  async getLastSync() {
    const row = await ApiSetting.findOne({ where: { key: LAST_SYNC_KEY } });
    if (!row || !row.value) return null;
    try { return JSON.parse(row.value); } catch { return null; }
  },
};

module.exports = TahananService;