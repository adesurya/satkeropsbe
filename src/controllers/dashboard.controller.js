'use strict';

const { QueryTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const ApiResponse = require('../utils/apiResponse');
const { parseDateRange } = require('../utils/pagination');
const cache = require('../utils/cache');
const logger = require('../utils/logger');

// Cache TTL = 6 hours (matches sync interval)
const CACHE_TTL = parseInt(process.env.REDIS_TTL || '21600');

/**
 * Build WHERE clause for raw SQL.
 * laporan_a & laporan_b have NO deleted_at (not paranoid).
 */
const buildSqlWhere = (query, scopeFilter = {}) => {
  const conditions = ['1=1'];
  const replacements = {};
  const { fromDate, toDate, dateField } = parseDateRange(query);

  const ALLOWED_DATE_FIELDS = ['updated_at', 'created_at', 'waktu_kejadian'];
  const safeField = ALLOWED_DATE_FIELDS.includes(dateField) ? dateField : 'updated_at';

  if (fromDate) { conditions.push(`${safeField} >= :fromDate`); replacements.fromDate = fromDate; }
  if (toDate)   { conditions.push(`${safeField} <= :toDate`);   replacements.toDate   = toDate;   }

  if (scopeFilter.id_polda)  { conditions.push('id_polda = :scopePolda');  replacements.scopePolda  = scopeFilter.id_polda;  }
  if (scopeFilter.id_polres) { conditions.push('id_polres = :scopePolres'); replacements.scopePolres = scopeFilter.id_polres; }

  if (query.id_polda  && !scopeFilter.id_polda)  { conditions.push('id_polda = :polda');   replacements.polda   = query.id_polda;  }
  if (query.id_polres && !scopeFilter.id_polres) { conditions.push('id_polres = :polres'); replacements.polres  = query.id_polres; }
  if (query.id_polsek) { conditions.push('id_polsek = :polsek'); replacements.polsek = query.id_polsek; }
  if (query.kategori_kejahatan) {
    conditions.push('nama_kategori_kejahatan LIKE :kategori');
    replacements.kategori = `%${query.kategori_kejahatan}%`;
  }
  if (query.provinsi)  { conditions.push('provinsi LIKE :provinsi');   replacements.provinsi  = `%${query.provinsi}%`;  }
  if (query.kabupaten) { conditions.push('kabupaten LIKE :kabupaten'); replacements.kabupaten = `%${query.kabupaten}%`; }

  return { where: conditions.join(' AND '), replacements };
};

/**
 * Build cache key from controller name + query + scope
 */
const cacheKey = (name, req) => {
  const { from, to, from_hour, to_hour, showby, granularity, level,
          threshold, precision, id_polda, id_polres, kategori_kejahatan,
          provinsi, kabupaten } = req.query;
  const scope = req.scopeFilter || {};
  return cache.buildKey(`dashboard:${name}`, {
    from, to, from_hour, to_hour, showby, granularity, level,
    threshold, precision, id_polda, id_polres, kategori_kejahatan,
    provinsi, kabupaten,
    scopePolda: scope.id_polda, scopePolres: scope.id_polres,
  });
};

const DashboardController = {

  // ── GET /dashboard/summary ────────────────────────────────────────────────────
  async summary(req, res) {
    try {
      const key = cacheKey('summary', req);
      const { data, fromCache } = await cache.remember(key, async () => {
        const { where, replacements } = buildSqlWhere(req.query, req.scopeFilter || {});

        const [summaryA] = await sequelize.query(
          `SELECT COUNT(*) AS total, COALESCE(SUM(kerugian), 0) AS total_kerugian
           FROM laporan_a WHERE ${where}`,
          { replacements, type: QueryTypes.SELECT }
        );
        const [summaryB] = await sequelize.query(
          `SELECT COUNT(*) AS total, COALESCE(SUM(kerugian), 0) AS total_kerugian
           FROM laporan_b WHERE ${where}`,
          { replacements, type: QueryTypes.SELECT }
        );

        const byKategoriA = await sequelize.query(
          `SELECT nama_kategori_kejahatan AS kategori, COUNT(*) AS total,
                  COALESCE(SUM(kerugian), 0) AS kerugian
           FROM laporan_a WHERE ${where} AND nama_kategori_kejahatan IS NOT NULL
           GROUP BY nama_kategori_kejahatan ORDER BY total DESC LIMIT 10`,
          { replacements, type: QueryTypes.SELECT }
        );
        const byKategoriB = await sequelize.query(
          `SELECT nama_kategori_kejahatan AS kategori, COUNT(*) AS total,
                  COALESCE(SUM(kerugian), 0) AS kerugian
           FROM laporan_b WHERE ${where} AND nama_kategori_kejahatan IS NOT NULL
           GROUP BY nama_kategori_kejahatan ORDER BY total DESC LIMIT 10`,
          { replacements, type: QueryTypes.SELECT }
        );

        const byPoldaA = await sequelize.query(
          `SELECT id_polda, nama_polda, COUNT(*) AS total
           FROM laporan_a WHERE ${where} AND id_polda IS NOT NULL
           GROUP BY id_polda, nama_polda ORDER BY total DESC`,
          { replacements, type: QueryTypes.SELECT }
        );
        const byPoldaB = await sequelize.query(
          `SELECT id_polda, nama_polda, COUNT(*) AS total
           FROM laporan_b WHERE ${where} AND id_polda IS NOT NULL
           GROUP BY id_polda, nama_polda ORDER BY total DESC`,
          { replacements, type: QueryTypes.SELECT }
        );

        const poldaMap = {};
        [...byPoldaA, ...byPoldaB].forEach(r => {
          if (!poldaMap[r.id_polda]) poldaMap[r.id_polda] = { id_polda: r.id_polda, nama_polda: r.nama_polda, total: 0 };
          poldaMap[r.id_polda].total += parseInt(r.total);
        });

        return {
          laporan_a: { total: parseInt(summaryA.total), total_kerugian: parseInt(summaryA.total_kerugian) },
          laporan_b: { total: parseInt(summaryB.total), total_kerugian: parseInt(summaryB.total_kerugian) },
          total_semua: parseInt(summaryA.total) + parseInt(summaryB.total),
          total_kerugian_semua: parseInt(summaryA.total_kerugian) + parseInt(summaryB.total_kerugian),
          by_kategori: { laporan_a: byKategoriA, laporan_b: byKategoriB },
          by_wilayah: Object.values(poldaMap).sort((a, b) => b.total - a.total),
        };
      }, CACHE_TTL);

      return ApiResponse.success(res, { ...data, _cached: fromCache });
    } catch (error) {
      logger.error('Dashboard summary error:', error);
      return ApiResponse.error(res, 'Gagal mengambil summary dashboard');
    }
  },

  // ── GET /dashboard/heatmap ────────────────────────────────────────────────────
  async heatmap(req, res) {
    try {
      const key = cacheKey('heatmap', req);
      const { data, fromCache } = await cache.remember(key, async () => {
        const { where, replacements } = buildSqlWhere(req.query, req.scopeFilter || {});

        const [pointsA, pointsB] = await Promise.all([
          sequelize.query(
            `SELECT koordinat_lat AS lat, koordinat_lng AS lng,
                    nama_kategori_kejahatan AS kategori,
                    COUNT(*) AS intensitas,
                    COALESCE(SUM(kerugian), 0) AS total_kerugian
             FROM laporan_a
             WHERE ${where} AND koordinat_lat IS NOT NULL AND koordinat_lng IS NOT NULL
             GROUP BY koordinat_lat, koordinat_lng, nama_kategori_kejahatan
             ORDER BY intensitas DESC LIMIT 1000`,
            { replacements, type: QueryTypes.SELECT }
          ),
          sequelize.query(
            `SELECT koordinat_lat AS lat, koordinat_lng AS lng,
                    nama_kategori_kejahatan AS kategori,
                    COUNT(*) AS intensitas,
                    COALESCE(SUM(kerugian), 0) AS total_kerugian
             FROM laporan_b
             WHERE ${where} AND koordinat_lat IS NOT NULL AND koordinat_lng IS NOT NULL
             GROUP BY koordinat_lat, koordinat_lng, nama_kategori_kejahatan
             ORDER BY intensitas DESC LIMIT 1000`,
            { replacements, type: QueryTypes.SELECT }
          ),
        ]);

        const allPoints = [...pointsA, ...pointsB].map(p => ({
          lat: parseFloat(p.lat),
          lng: parseFloat(p.lng),
          kategori: p.kategori,
          intensitas: parseInt(p.intensitas),
          total_kerugian: parseInt(p.total_kerugian),
        }));

        return { total_points: allPoints.length, points: allPoints };
      }, CACHE_TTL);

      return ApiResponse.success(res, { ...data, _cached: fromCache });
    } catch (error) {
      logger.error('Heatmap error:', error);
      return ApiResponse.error(res, 'Gagal mengambil data heatmap');
    }
  },

  // ── GET /dashboard/trend ──────────────────────────────────────────────────────
  async trend(req, res) {
    try {
      const key = cacheKey('trend', req);
      const { data, fromCache } = await cache.remember(key, async () => {
        const { where, replacements } = buildSqlWhere(req.query, req.scopeFilter || {});
        const granularity = ['day', 'week', 'month'].includes(req.query.granularity)
          ? req.query.granularity : 'day';
        const dateFormat = granularity === 'day' ? '%Y-%m-%d'
          : granularity === 'week' ? '%x-W%v' : '%Y-%m';

        const [trendA, trendB] = await Promise.all([
          sequelize.query(
            `SELECT DATE_FORMAT(waktu_kejadian, '${dateFormat}') AS periode,
                    nama_kategori_kejahatan AS kategori,
                    COUNT(*) AS total, COALESCE(SUM(kerugian), 0) AS total_kerugian
             FROM laporan_a WHERE ${where} AND waktu_kejadian IS NOT NULL
             GROUP BY DATE_FORMAT(waktu_kejadian, '${dateFormat}'), nama_kategori_kejahatan
             ORDER BY DATE_FORMAT(waktu_kejadian, '${dateFormat}') ASC`,
            { replacements, type: QueryTypes.SELECT }
          ),
          sequelize.query(
            `SELECT DATE_FORMAT(waktu_kejadian, '${dateFormat}') AS periode,
                    nama_kategori_kejahatan AS kategori,
                    COUNT(*) AS total, COALESCE(SUM(kerugian), 0) AS total_kerugian
             FROM laporan_b WHERE ${where} AND waktu_kejadian IS NOT NULL
             GROUP BY DATE_FORMAT(waktu_kejadian, '${dateFormat}'), nama_kategori_kejahatan
             ORDER BY DATE_FORMAT(waktu_kejadian, '${dateFormat}') ASC`,
            { replacements, type: QueryTypes.SELECT }
          ),
        ]);

        const trendMap = {};
        [...trendA, ...trendB].forEach(r => {
          const k = `${r.periode}__${r.kategori}`;
          if (!trendMap[k]) trendMap[k] = { periode: r.periode, kategori: r.kategori, total: 0, total_kerugian: 0 };
          trendMap[k].total          += parseInt(r.total);
          trendMap[k].total_kerugian += parseInt(r.total_kerugian);
        });

        return {
          granularity,
          data: Object.values(trendMap).sort((a, b) => a.periode.localeCompare(b.periode)),
        };
      }, CACHE_TTL);

      return ApiResponse.success(res, { ...data, _cached: fromCache });
    } catch (error) {
      logger.error('Trend error:', error);
      return ApiResponse.error(res, 'Gagal mengambil data trend');
    }
  },

  // ── GET /dashboard/drilldown ──────────────────────────────────────────────────
  async drilldown(req, res) {
    try {
      const key = cacheKey('drilldown', req);
      const { data, fromCache } = await cache.remember(key, async () => {
        const { where, replacements } = buildSqlWhere(req.query, req.scopeFilter || {});
        const level = ['polda', 'polres', 'polsek'].includes(req.query.level) ? req.query.level : 'polda';
        const colMap = {
          polda:  { id: 'id_polda',  name: 'nama_polda'  },
          polres: { id: 'id_polres', name: 'nama_polres' },
          polsek: { id: 'id_polsek', name: 'nama_polsek' },
        };
        const { id: idCol, name: nameCol } = colMap[level];

        const [rowsA, rowsB] = await Promise.all([
          sequelize.query(
            `SELECT ${idCol} AS kode, ${nameCol} AS nama,
                    COUNT(*) AS total_laporan,
                    COALESCE(SUM(kerugian), 0) AS total_kerugian,
                    COUNT(DISTINCT nama_kategori_kejahatan) AS jenis_kejahatan
             FROM laporan_a WHERE ${where} AND ${idCol} IS NOT NULL
             GROUP BY ${idCol}, ${nameCol} ORDER BY total_laporan DESC`,
            { replacements, type: QueryTypes.SELECT }
          ),
          sequelize.query(
            `SELECT ${idCol} AS kode, ${nameCol} AS nama,
                    COUNT(*) AS total_laporan,
                    COALESCE(SUM(kerugian), 0) AS total_kerugian,
                    COUNT(DISTINCT nama_kategori_kejahatan) AS jenis_kejahatan
             FROM laporan_b WHERE ${where} AND ${idCol} IS NOT NULL
             GROUP BY ${idCol}, ${nameCol} ORDER BY total_laporan DESC`,
            { replacements, type: QueryTypes.SELECT }
          ),
        ]);

        const mergeMap = {};
        [...rowsA, ...rowsB].forEach(r => {
          if (!mergeMap[r.kode]) mergeMap[r.kode] = { kode: r.kode, nama: r.nama, total_laporan: 0, total_kerugian: 0, jenis_kejahatan: 0 };
          mergeMap[r.kode].total_laporan  += parseInt(r.total_laporan);
          mergeMap[r.kode].total_kerugian += parseInt(r.total_kerugian);
          mergeMap[r.kode].jenis_kejahatan = Math.max(mergeMap[r.kode].jenis_kejahatan, parseInt(r.jenis_kejahatan));
        });

        return { level, data: Object.values(mergeMap).sort((a, b) => b.total_laporan - a.total_laporan) };
      }, CACHE_TTL);

      return ApiResponse.success(res, { ...data, _cached: fromCache });
    } catch (error) {
      logger.error('Drilldown error:', error);
      return ApiResponse.error(res, 'Gagal mengambil data drilldown');
    }
  },

  // ── GET /dashboard/korban-pelaku ──────────────────────────────────────────────
  async korbanPelaku(req, res) {
    try {
      const key = cacheKey('korban-pelaku', req);
      const { data, fromCache } = await cache.remember(key, async () => {
        const { where, replacements } = buildSqlWhere(req.query, req.scopeFilter || {});

        const [laporanAIds, laporanBIds] = await Promise.all([
          sequelize.query(`SELECT id FROM laporan_a WHERE ${where}`, { replacements, type: QueryTypes.SELECT }),
          sequelize.query(`SELECT id FROM laporan_b WHERE ${where}`, { replacements, type: QueryTypes.SELECT }),
        ]);

        const allIds = [...laporanAIds.map(r => r.id), ...laporanBIds.map(r => r.id)];
        if (allIds.length === 0) {
          return { by_keterlibatan: [], by_gender: [], by_pekerjaan: [], by_agama: [] };
        }

        const idRepl = {};
        allIds.forEach((id, i) => { idRepl[`id${i}`] = id; });
        const idList = allIds.map((_, i) => `:id${i}`).join(', ');

        const [byKeterlibatan, byGender, byPekerjaan, byAgama] = await Promise.all([
          sequelize.query(
            `SELECT keterlibatan, COUNT(*) AS total FROM terlibat
             WHERE id_laporan IN (${idList}) AND keterlibatan IS NOT NULL
             GROUP BY keterlibatan ORDER BY total DESC`,
            { replacements: idRepl, type: QueryTypes.SELECT }
          ),
          sequelize.query(
            `SELECT gender, keterlibatan, COUNT(*) AS total FROM terlibat
             WHERE id_laporan IN (${idList}) AND gender IS NOT NULL AND gender != ''
             GROUP BY gender, keterlibatan ORDER BY total DESC`,
            { replacements: idRepl, type: QueryTypes.SELECT }
          ),
          sequelize.query(
            `SELECT pekerjaan, COUNT(*) AS total FROM terlibat
             WHERE id_laporan IN (${idList}) AND keterlibatan IN ('terlapor','korban')
               AND pekerjaan IS NOT NULL AND pekerjaan NOT IN ('-','TIDAK DIKETAHUI','')
             GROUP BY pekerjaan ORDER BY total DESC LIMIT 10`,
            { replacements: idRepl, type: QueryTypes.SELECT }
          ),
          sequelize.query(
            `SELECT agama, COUNT(*) AS total FROM terlibat
             WHERE id_laporan IN (${idList})
               AND agama IS NOT NULL AND agama NOT IN ('-','')
             GROUP BY agama ORDER BY total DESC`,
            { replacements: idRepl, type: QueryTypes.SELECT }
          ),
        ]);

        return { by_keterlibatan: byKeterlibatan, by_gender: byGender, by_pekerjaan: byPekerjaan, by_agama: byAgama };
      }, CACHE_TTL);

      return ApiResponse.success(res, { ...data, _cached: fromCache });
    } catch (error) {
      logger.error('Korban pelaku error:', error);
      return ApiResponse.error(res, 'Gagal mengambil data korban & pelaku');
    }
  },

  // ── GET /dashboard/anomaly ────────────────────────────────────────────────────
  async anomaly(req, res) {
    try {
      const key = cacheKey('anomaly', req);
      const { data, fromCache } = await cache.remember(key, async () => {
        const { where, replacements } = buildSqlWhere(req.query, req.scopeFilter || {});
        const threshold = Math.max(0.5, parseFloat(req.query.threshold) || 2.0);

        const [weeklyA, weeklyB] = await Promise.all([
          sequelize.query(
            `SELECT id_polres, nama_polres, YEARWEEK(waktu_kejadian, 1) AS minggu, COUNT(*) AS total
             FROM laporan_a WHERE ${where} AND waktu_kejadian IS NOT NULL AND id_polres IS NOT NULL
             GROUP BY id_polres, nama_polres, YEARWEEK(waktu_kejadian, 1)`,
            { replacements, type: QueryTypes.SELECT }
          ),
          sequelize.query(
            `SELECT id_polres, nama_polres, YEARWEEK(waktu_kejadian, 1) AS minggu, COUNT(*) AS total
             FROM laporan_b WHERE ${where} AND waktu_kejadian IS NOT NULL AND id_polres IS NOT NULL
             GROUP BY id_polres, nama_polres, YEARWEEK(waktu_kejadian, 1)`,
            { replacements, type: QueryTypes.SELECT }
          ),
        ]);

        const mergeMap = {};
        [...weeklyA, ...weeklyB].forEach(r => {
          const k = `${r.id_polres}__${r.minggu}`;
          if (!mergeMap[k]) mergeMap[k] = { id_polres: r.id_polres, nama_polres: r.nama_polres, minggu: r.minggu, total: 0 };
          mergeMap[k].total += parseInt(r.total);
        });

        const byPolres = {};
        Object.values(mergeMap).forEach(r => {
          if (!byPolres[r.id_polres]) byPolres[r.id_polres] = { nama: r.nama_polres, weeks: [] };
          byPolres[r.id_polres].weeks.push({ minggu: r.minggu, total: r.total });
        });

        const anomalies = [];
        Object.entries(byPolres).forEach(([kode, d]) => {
          const totals = d.weeks.map(w => w.total);
          if (totals.length < 2) return;
          const mean = totals.reduce((a, b) => a + b, 0) / totals.length;
          const std  = Math.sqrt(totals.map(x => Math.pow(x - mean, 2)).reduce((a, b) => a + b, 0) / totals.length);
          d.weeks.forEach(w => {
            const z = std > 0 ? (w.total - mean) / std : 0;
            if (z >= threshold) {
              anomalies.push({
                id_polres: kode, nama_polres: d.nama, minggu: w.minggu,
                total: w.total, mean: Math.round(mean * 10) / 10,
                std: Math.round(std * 10) / 10, z_score: Math.round(z * 100) / 100,
                severity: z >= 3 ? 'critical' : 'warning',
              });
            }
          });
        });

        return { threshold, total_anomalies: anomalies.length, anomalies: anomalies.sort((a, b) => b.z_score - a.z_score) };
      }, CACHE_TTL);

      return ApiResponse.success(res, { ...data, _cached: fromCache });
    } catch (error) {
      logger.error('Anomaly error:', error);
      return ApiResponse.error(res, 'Gagal mendeteksi anomali');
    }
  },

  // ── GET /dashboard/clustering ─────────────────────────────────────────────────
  async clustering(req, res) {
    try {
      const key = cacheKey('clustering', req);
      const { data, fromCache } = await cache.remember(key, async () => {
        const { where, replacements } = buildSqlWhere(req.query, req.scopeFilter || {});
        const precision = Math.min(4, Math.max(1, parseInt(req.query.precision) || 2));

        const [clustersA, clustersB] = await Promise.all([
          sequelize.query(
            `SELECT ROUND(koordinat_lat, ${precision}) AS lat_grid,
                    ROUND(koordinat_lng, ${precision}) AS lng_grid,
                    COUNT(*) AS cnt,
                    COALESCE(SUM(kerugian), 0) AS total_kerugian,
                    GROUP_CONCAT(DISTINCT nama_kategori_kejahatan ORDER BY nama_kategori_kejahatan SEPARATOR '|') AS kategoris
             FROM laporan_a WHERE ${where} AND koordinat_lat IS NOT NULL AND koordinat_lng IS NOT NULL
             GROUP BY ROUND(koordinat_lat, ${precision}), ROUND(koordinat_lng, ${precision})
             HAVING COUNT(*) > 0 ORDER BY COUNT(*) DESC LIMIT 500`,
            { replacements, type: QueryTypes.SELECT }
          ),
          sequelize.query(
            `SELECT ROUND(koordinat_lat, ${precision}) AS lat_grid,
                    ROUND(koordinat_lng, ${precision}) AS lng_grid,
                    COUNT(*) AS cnt,
                    COALESCE(SUM(kerugian), 0) AS total_kerugian,
                    GROUP_CONCAT(DISTINCT nama_kategori_kejahatan ORDER BY nama_kategori_kejahatan SEPARATOR '|') AS kategoris
             FROM laporan_b WHERE ${where} AND koordinat_lat IS NOT NULL AND koordinat_lng IS NOT NULL
             GROUP BY ROUND(koordinat_lat, ${precision}), ROUND(koordinat_lng, ${precision})
             HAVING COUNT(*) > 0 ORDER BY COUNT(*) DESC LIMIT 500`,
            { replacements, type: QueryTypes.SELECT }
          ),
        ]);

        const clusterMap = {};
        [...clustersA, ...clustersB].forEach(r => {
          const k = `${r.lat_grid}__${r.lng_grid}`;
          if (!clusterMap[k]) clusterMap[k] = { lat: parseFloat(r.lat_grid), lng: parseFloat(r.lng_grid), count: 0, total_kerugian: 0, kategoris: new Set() };
          clusterMap[k].count         += parseInt(r.cnt);
          clusterMap[k].total_kerugian += parseInt(r.total_kerugian);
          if (r.kategoris) r.kategoris.split('|').forEach(k2 => clusterMap[k].kategoris.add(k2));
        });

        const clusters = Object.values(clusterMap)
          .map(c => ({ ...c, kategoris: Array.from(c.kategoris) }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 1000);

        return { precision, total_clusters: clusters.length, clusters };
      }, CACHE_TTL);

      return ApiResponse.success(res, { ...data, _cached: fromCache });
    } catch (error) {
      logger.error('Clustering error:', error);
      return ApiResponse.error(res, 'Gagal mengambil data clustering');
    }
  },
};

module.exports = DashboardController;