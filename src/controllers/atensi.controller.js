'use strict';

const { QueryTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const logger = require('../utils/logger');

// ── Bobot skor atensi (silakan tuning) ────────────────────────────────────────
const W = {
  publik: 35,                          // ditandai perhatian_publik oleh sumber
  rugi: [5, 10, 20, 30],               // tier kerugian (lihat THRESH_RUGI)
  kategori: 25,                        // kategori sensitif
  mangkrak: [20, 30],                  // aktif & tak update > stale1 / > stale2 hari
  baru: 10,                            // laporan baru (< 7 hari)
};
const THRESH_RUGI = [10000000, 100000000, 1000000000, 10000000000]; // 10jt, 100jt, 1M, 10M
const SENSITIVE_REGEX =
  'narko|cabul|asusila|persetubuhan|perkosa|pencabulan|anak|curas|pencurian dengan kekerasan|' +
  'pembunuhan|aniaya|penganiayaan berat|terror|teroris|senjata api|handak|korupsi|kdrt|' +
  'kekerasan dalam rumah|perdagangan orang|tppo|penculikan|sandera';

const clampInt = (v, def, min, max) => {
  const n = parseInt(v, 10);
  if (Number.isNaN(n)) return def;
  return Math.max(min, Math.min(max, n));
};

const fmtRupiah = (n) => 'Rp ' + Number(n || 0).toLocaleString('id-ID');

/**
 * Bangun ekspresi kolom skor (dipakai untuk laporan_a & laporan_b).
 * Nilai integer di-interpolasi (sudah divalidasi) — aman dari injection.
 */
const scoreColumns = (tipe, stale1, stale2) => `
  '${tipe}' AS tipe, id, no_laporan, waktu_kejadian, nama_kategori_kejahatan, kerugian,
  perhatian_publik, status_aktif, id_polda, id_polres, nama_polda, nama_polres,
  updated_at, created_at,
  (CASE WHEN perhatian_publik = 1 THEN ${W.publik} ELSE 0 END) AS s_publik,
  (CASE
     WHEN kerugian >= ${THRESH_RUGI[3]} THEN ${W.rugi[3]}
     WHEN kerugian >= ${THRESH_RUGI[2]} THEN ${W.rugi[2]}
     WHEN kerugian >= ${THRESH_RUGI[1]} THEN ${W.rugi[1]}
     WHEN kerugian >= ${THRESH_RUGI[0]} THEN ${W.rugi[0]}
     ELSE 0 END) AS s_rugi,
  (CASE WHEN nama_kategori_kejahatan REGEXP :sens THEN ${W.kategori} ELSE 0 END) AS s_kat,
  (CASE
     WHEN status_aktif = 1 AND updated_at < (NOW() - INTERVAL ${stale2} DAY) THEN ${W.mangkrak[1]}
     WHEN status_aktif = 1 AND updated_at < (NOW() - INTERVAL ${stale1} DAY) THEN ${W.mangkrak[0]}
     ELSE 0 END) AS s_mangkrak,
  (CASE WHEN created_at >= (NOW() - INTERVAL 7 DAY) THEN ${W.baru} ELSE 0 END) AS s_baru
`;

const scopeWhere = (replacements, idPolda, idPolres) => {
  const w = ['waktu_kejadian BETWEEN :from AND :to'];
  if (idPolda)  { w.push('id_polda = :id_polda');   replacements.id_polda = idPolda; }
  if (idPolres) { w.push('id_polres = :id_polres'); replacements.id_polres = idPolres; }
  return w.join(' AND ');
};

const buildItemsSQL = (tipe, stale1, stale2, where, minScore, cap) => {
  const unitA = `SELECT ${scoreColumns('a', stale1, stale2)} FROM laporan_a WHERE ${where}`;
  const unitB = `SELECT ${scoreColumns('b', stale1, stale2)} FROM laporan_b WHERE ${where}`;
  let union;
  if (tipe === 'a') union = unitA;
  else if (tipe === 'b') union = unitB;
  else union = `${unitA} UNION ALL ${unitB}`;
  return `
    SELECT * FROM ( ${union} ) u
    WHERE (s_publik + s_rugi + s_kat + s_mangkrak + s_baru) >= ${minScore}
    ORDER BY (s_publik + s_rugi + s_kat + s_mangkrak + s_baru) DESC, waktu_kejadian DESC
    LIMIT ${cap}
  `;
};

const buildKategoriTotalSQL = (tipe, where) => {
  const a = `SELECT nama_kategori_kejahatan AS k FROM laporan_a WHERE ${where}`;
  const b = `SELECT nama_kategori_kejahatan AS k FROM laporan_b WHERE ${where}`;
  let union;
  if (tipe === 'a') union = a;
  else if (tipe === 'b') union = b;
  else union = `${a} UNION ALL ${b}`;
  return `SELECT k AS nama_kategori_kejahatan, COUNT(*) AS total FROM ( ${union} ) z
          WHERE k IS NOT NULL GROUP BY k`;
};

// Format periode untuk tren (whitelist → aman dari injection)
const INTERVAL_FMT = { day: '%Y-%m-%d', week: '%x-W%v', month: '%Y-%m' };

const buildTrenSQL = (tipe, stale1, stale2, where, fmt, minScore) => {
  const unitA = `SELECT ${scoreColumns('a', stale1, stale2)} FROM laporan_a WHERE ${where}`;
  const unitB = `SELECT ${scoreColumns('b', stale1, stale2)} FROM laporan_b WHERE ${where}`;
  let union;
  if (tipe === 'a') union = unitA;
  else if (tipe === 'b') union = unitB;
  else union = `${unitA} UNION ALL ${unitB}`;
  return `
    SELECT periode,
      COUNT(*) AS total_atensi,
      ROUND(AVG(score)) AS skor_rata,
      MAX(score) AS skor_maks,
      SUM(s_publik > 0)   AS a_publik,
      SUM(s_rugi > 0)     AS a_kerugian,
      SUM(s_kat > 0)      AS a_kategori,
      SUM(s_mangkrak > 0) AS a_mangkrak,
      SUM(s_baru > 0)     AS a_baru
    FROM (
      SELECT DATE_FORMAT(waktu_kejadian, '${fmt}') AS periode,
             s_publik, s_rugi, s_kat, s_mangkrak, s_baru,
             (s_publik + s_rugi + s_kat + s_mangkrak + s_baru) AS score
      FROM ( ${union} ) u
    ) w
    WHERE w.score >= ${minScore}
    GROUP BY periode
    ORDER BY periode ASC
  `;
};

const reasonsFor = (r) => {
  const out = [];
  if (r.s_publik > 0)   out.push('Perhatian publik');
  if (r.s_rugi > 0)     out.push(`Kerugian besar (${fmtRupiah(r.kerugian)})`);
  if (r.s_kat > 0)      out.push('Kategori sensitif');
  if (r.s_mangkrak > 0) out.push('Aktif & mangkrak (lama tanpa update)');
  if (r.s_baru > 0)     out.push('Laporan baru (<7 hari)');
  return out;
};

const atensiController = {
  /**
   * GET /laporan/atensi
   * Ringkasan + daftar LP yang butuh atensi, diurutkan skor terbobot.
   *
   * Query: from, to, min_score, stale_days, stale_days_2, id_polda, id_polres, tipe(a|b),
   *        page, per_page
   */
  async getAtensi(req, res) {
    try {
      const q = req.query || {};
      const user = req.user || {};

      // Jendela waktu (default 90 hari terakhir)
      const today = new Date();
      const defFrom = new Date(today.getTime() - 90 * 86400000);
      const fromDate = (q.from || defFrom.toISOString().slice(0, 10));
      const toDate   = (q.to   || today.toISOString().slice(0, 10));
      const from = `${fromDate} 00:00:00`;
      const to   = `${toDate} 23:59:59`;

      const minScore = clampInt(q.min_score, 40, 0, 120);
      const stale1   = clampInt(q.stale_days, 30, 1, 3650);
      const stale2   = clampInt(q.stale_days_2, 90, stale1, 3650);
      const cap      = 5000;

      const page    = clampInt(q.page, 1, 1, 100000);
      const perPage = clampInt(q.per_page, 20, 1, 200);

      const tipe = ['a', 'b'].includes(String(q.tipe || '').toLowerCase())
        ? String(q.tipe).toLowerCase() : null;

      // Enforce scope wilayah dari akun (RBAC: role polda/polres dipaksa ke wilayahnya)
      let idPolda = q.id_polda || null;
      let idPolres = q.id_polres || null;
      if (user.role === 'polres') { idPolres = user.id_polres || idPolres; idPolda = user.id_polda || idPolda; }
      else if (user.role === 'polda') { idPolda = user.id_polda || idPolda; idPolres = null; }

      const replacements = { from, to, sens: SENSITIVE_REGEX };
      const where = scopeWhere(replacements, idPolda, idPolres);

      // 1) Ambil kandidat ber-skor
      const rows = await sequelize.query(
        buildItemsSQL(tipe, stale1, stale2, where, minScore, cap),
        { replacements, type: QueryTypes.SELECT }
      );

      // Hitung skor + alasan di JS (transparan)
      const scored = rows.map((r) => {
        const score = r.s_publik + r.s_rugi + r.s_kat + r.s_mangkrak + r.s_baru;
        return {
          tipe: r.tipe,
          id: r.id,
          no_laporan: r.no_laporan,
          waktu_kejadian: r.waktu_kejadian,
          nama_kategori_kejahatan: r.nama_kategori_kejahatan,
          kerugian: Number(r.kerugian || 0),
          perhatian_publik: !!r.perhatian_publik,
          status_aktif: !!r.status_aktif,
          id_polda: r.id_polda,
          id_polres: r.id_polres,
          nama_polda: r.nama_polda,
          nama_polres: r.nama_polres,
          updated_at: r.updated_at,
          attention_score: score,
          alasan: reasonsFor(r),
        };
      });

      // 2) Ringkasan: by_alasan, by_kategori, by_wilayah
      const by_alasan = { perhatian_publik: 0, kerugian_besar: 0, kategori_sensitif: 0, mangkrak: 0, baru: 0 };
      const katMap = new Map();
      const wilMap = new Map();
      for (const r of rows) {
        if (r.s_publik > 0) by_alasan.perhatian_publik++;
        if (r.s_rugi > 0) by_alasan.kerugian_besar++;
        if (r.s_kat > 0) by_alasan.kategori_sensitif++;
        if (r.s_mangkrak > 0) by_alasan.mangkrak++;
        if (r.s_baru > 0) by_alasan.baru++;

        const score = r.s_publik + r.s_rugi + r.s_kat + r.s_mangkrak + r.s_baru;
        const k = r.nama_kategori_kejahatan || '(tidak diketahui)';
        const km = katMap.get(k) || { nama_kategori_kejahatan: k, jumlah_atensi: 0, skor_total: 0, skor_maks: 0 };
        km.jumlah_atensi++; km.skor_total += score; km.skor_maks = Math.max(km.skor_maks, score);
        katMap.set(k, km);

        const wk = r.id_polda || '(null)';
        const wm = wilMap.get(wk) || { id_polda: r.id_polda, nama_polda: r.nama_polda, jumlah_atensi: 0, skor_total: 0 };
        wm.jumlah_atensi++; wm.skor_total += score;
        wilMap.set(wk, wm);
      }
      const by_kategori = [...katMap.values()]
        .map((x) => ({ ...x, skor_rata: Math.round(x.skor_total / x.jumlah_atensi) }))
        .sort((a, b) => b.jumlah_atensi - a.jumlah_atensi).slice(0, 15)
        .map(({ skor_total, ...rest }) => rest);
      const by_wilayah = [...wilMap.values()]
        .map((x) => ({ ...x, skor_rata: Math.round(x.skor_total / x.jumlah_atensi) }))
        .sort((a, b) => b.jumlah_atensi - a.jumlah_atensi)
        .map(({ skor_total, ...rest }) => rest);

      // 3) Lonjakan kategori (volume periode ini vs periode sebelumnya, panjang sama)
      const spanMs = (new Date(to).getTime() - new Date(from).getTime());
      const prevTo = new Date(new Date(from).getTime() - 1000);
      const prevFrom = new Date(prevTo.getTime() - spanMs);
      const fmt = (d) => d.toISOString().slice(0, 19).replace('T', ' ');

      const repCur = { from, to }; if (idPolda) repCur.id_polda = idPolda; if (idPolres) repCur.id_polres = idPolres;
      const repPrev = { from: fmt(prevFrom), to: fmt(prevTo) };
      if (idPolda) repPrev.id_polda = idPolda; if (idPolres) repPrev.id_polres = idPolres;

      const whereCur  = scopeWhere({}, idPolda, idPolres); // sama bentuknya
      const [curTot, prevTot] = await Promise.all([
        sequelize.query(buildKategoriTotalSQL(tipe, whereCur), { replacements: repCur, type: QueryTypes.SELECT }),
        sequelize.query(buildKategoriTotalSQL(tipe, whereCur), { replacements: repPrev, type: QueryTypes.SELECT }),
      ]);
      const prevMap = new Map(prevTot.map((r) => [r.nama_kategori_kejahatan, Number(r.total)]));
      const lonjakan_kategori = curTot
        .map((r) => {
          const now = Number(r.total);
          const before = prevMap.get(r.nama_kategori_kejahatan) || 0;
          const delta = now - before;
          const delta_pct = before === 0 ? (now > 0 ? 100 : 0) : Math.round((delta / before) * 100);
          return { nama_kategori_kejahatan: r.nama_kategori_kejahatan, periode_ini: now, periode_lalu: before, delta, delta_pct };
        })
        .filter((x) => x.delta > 0)
        .sort((a, b) => b.delta - a.delta)
        .slice(0, 10);

      // 4) Paginate daftar
      const total = scored.length;
      const start = (page - 1) * perPage;
      const items = scored.slice(start, start + perPage);

      return res.json({
        success: true,
        message: 'Success',
        data: {
          window: { from: fromDate, to: toDate, min_score: minScore, stale_days: stale1, stale_days_2: stale2 },
          summary: {
            total_atensi: total,
            by_alasan,
            by_kategori,
            by_wilayah,
            lonjakan_kategori,
            ...(total >= cap ? { catatan: `Hasil dibatasi ${cap} kasus teratas; persempit rentang/min_score untuk presisi.` } : {}),
          },
          items: {
            total,
            per_page: perPage,
            current_page: page,
            last_page: Math.max(1, Math.ceil(total / perPage)),
            data: items,
          },
        },
      });
    } catch (error) {
      logger.error('[Atensi] error:', error.message);
      return res.status(500).json({ success: false, message: 'Gagal memuat data atensi' });
    }
  },

  /**
   * GET /laporan/atensi/tren
   * Deret waktu jumlah atensi per periode (harian/mingguan/bulanan).
   *
   * Query: interval(day|week|month), from, to, min_score, stale_days, stale_days_2,
   *        id_polda, id_polres, tipe(a|b)
   */
  async getAtensiTren(req, res) {
    try {
      const q = req.query || {};
      const user = req.user || {};

      const interval = ['day', 'week', 'month'].includes(String(q.interval || '').toLowerCase())
        ? String(q.interval).toLowerCase() : 'day';
      const fmt = INTERVAL_FMT[interval];

      // Default rentang menyesuaikan interval
      const today = new Date();
      const defDays = interval === 'month' ? 365 : interval === 'week' ? 84 : 30;
      const defFrom = new Date(today.getTime() - defDays * 86400000);
      const fromDate = q.from || defFrom.toISOString().slice(0, 10);
      const toDate   = q.to   || today.toISOString().slice(0, 10);
      const from = `${fromDate} 00:00:00`;
      const to   = `${toDate} 23:59:59`;

      const minScore = clampInt(q.min_score, 40, 0, 120);
      const stale1   = clampInt(q.stale_days, 30, 1, 3650);
      const stale2   = clampInt(q.stale_days_2, 90, stale1, 3650);
      const tipe = ['a', 'b'].includes(String(q.tipe || '').toLowerCase())
        ? String(q.tipe).toLowerCase() : null;

      let idPolda = q.id_polda || null;
      let idPolres = q.id_polres || null;
      if (user.role === 'polres') { idPolres = user.id_polres || idPolres; idPolda = user.id_polda || idPolda; }
      else if (user.role === 'polda') { idPolda = user.id_polda || idPolda; idPolres = null; }

      const replacements = { from, to, sens: SENSITIVE_REGEX };
      const where = scopeWhere(replacements, idPolda, idPolres);

      const rows = await sequelize.query(
        buildTrenSQL(tipe, stale1, stale2, where, fmt, minScore),
        { replacements, type: QueryTypes.SELECT }
      );

      const series = rows.map((r) => ({
        periode: r.periode,
        total_atensi: Number(r.total_atensi),
        skor_rata: Number(r.skor_rata || 0),
        skor_maks: Number(r.skor_maks || 0),
        by_alasan: {
          perhatian_publik: Number(r.a_publik),
          kerugian_besar: Number(r.a_kerugian),
          kategori_sensitif: Number(r.a_kategori),
          mangkrak: Number(r.a_mangkrak),
          baru: Number(r.a_baru),
        },
      }));

      return res.json({
        success: true,
        message: 'Success',
        data: {
          window: { from: fromDate, to: toDate, min_score: minScore },
          interval,
          total_periode: series.length,
          series,
        },
      });
    } catch (error) {
      logger.error('[Atensi Tren] error:', error.message);
      return res.status(500).json({ success: false, message: 'Gagal memuat tren atensi' });
    }
  },
};

module.exports = atensiController;