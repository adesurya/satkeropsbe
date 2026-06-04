'use strict';

const axios = require('axios');
const crypto = require('crypto');
const { QueryTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const ApiResponse = require('../utils/apiResponse');
const cache = require('../utils/cache');
const logger = require('../utils/logger');

// TTL cache hasil AI
const TTL_CLASSIFY = parseInt(process.env.AI_CACHE_TTL_CLASSIFY || '86400');   // 24 jam (deterministik per teks)
const TTL_BRIEFING = parseInt(process.env.AI_CACHE_TTL_BRIEFING || '21600');   // 6 jam
const TTL_SEARCH   = parseInt(process.env.AI_CACHE_TTL_SEARCH   || '3600');    // 1 jam
const TTL_FORECAST = parseInt(process.env.AI_CACHE_TTL_FORECAST || '21600');   // 6 jam

const md5 = (s) => crypto.createHash('md5').update(String(s)).digest('hex');
const scopeKey = (req) => {
  const s = req.scopeFilter || {};
  return `${s.id_polda || 'all'}:${s.id_polres || 'all'}`;
};

// ─── Helper: call OpenAI API ───────────────────────────────────────────────────
const callAI = async (systemPrompt, userPrompt, maxTokens = 1000) => {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY belum dikonfigurasi di .env');
  }
  const response = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    {
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      max_tokens: maxTokens,
      temperature: 0.3,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userPrompt   },
      ],
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    }
  );
  return response.data.choices[0].message.content;
};

// ─── Helper: build safe scope condition ──────────────────────────────────────────
const buildScopeCond = (scopeFilter = {}) => {
  const parts = [];
  const replacements = {};
  if (scopeFilter.id_polda) {
    parts.push('id_polda = :scopePolda');
    replacements.scopePolda = scopeFilter.id_polda;
  }
  if (scopeFilter.id_polres) {
    parts.push('id_polres = :scopePolres');
    replacements.scopePolres = scopeFilter.id_polres;
  }
  return {
    cond: parts.length ? `AND ${parts.join(' AND ')}` : '',
    replacements,
  };
};

// ─── Helper: safe JSON parse ──────────────────────────────────────────────────
const safeJsonParse = (text) => {
  try {
    const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(clean);
  } catch {
    return { raw_response: text };
  }
};

const InsightController = {

  // ── POST /insight/classify ────────────────────────────────────────────────────
  async classify(req, res) {
    try {
      const { uraian } = req.body;
      if (!uraian || uraian.trim().length < 10) {
        return ApiResponse.error(res, 'Field uraian minimal 10 karakter', 400);
      }

      const key = cache.buildKey('insight:classify', { h: md5(uraian.trim()) });
      const { data: result, fromCache } = await cache.remember(key, async () => {
        const system = `Kamu adalah sistem klasifikasi laporan kejahatan Kepolisian Indonesia.
Analisis teks laporan dan ekstrak entitas, lalu klasifikasikan jenis kejahatan.
Balas HANYA dalam format JSON valid tanpa markdown code fence.`;

        const prompt = `Analisis laporan berikut dan kembalikan JSON dengan struktur persis ini:
{
  "jenis_kejahatan": "...",
  "pasal_relevan": "...",
  "modus_operandi": "...",
  "lokasi_ekstrak": "...",
  "waktu_ekstrak": "...",
  "pelaku_deskripsi": "...",
  "korban_deskripsi": "...",
  "barang_bukti_potensial": ["..."],
  "tingkat_kepercayaan": 0.0,
  "ringkasan": "..."
}

Teks laporan:
${uraian.substring(0, 2000)}`;

        const aiText = await callAI(system, prompt, 800);
        return safeJsonParse(aiText);
      }, TTL_CLASSIFY);

      return ApiResponse.success(res, { ...result, _cached: fromCache }, 'Klasifikasi berhasil');
    } catch (error) {
      logger.error('AI classify error:', error.message);
      if (error.message.includes('OPENAI_API_KEY')) {
        return ApiResponse.error(res, 'Layanan AI belum dikonfigurasi. Set OPENAI_API_KEY di .env', 503);
      }
      return ApiResponse.error(res, 'Layanan AI tidak tersedia saat ini', 503);
    }
  },

  // ── GET /insight/briefing ─────────────────────────────────────────────────────
  async briefing(req, res) {
    try {
      const dateParam = req.query.date || new Date().toISOString().split('T')[0];
      const key = cache.buildKey('insight:briefing', { date: dateParam, scope: scopeKey(req) });

      const { data, fromCache } = await cache.remember(key, async () => {
        const fromDate = `${dateParam} 00:00:00`;
        const toDate   = `${dateParam} 23:59:59`;
        const { cond, replacements } = buildScopeCond(req.scopeFilter || {});

        const [statsA] = await sequelize.query(
          `SELECT COUNT(*) AS total,
                  COALESCE(SUM(kerugian), 0) AS kerugian,
                  GROUP_CONCAT(DISTINCT nama_kategori_kejahatan ORDER BY nama_kategori_kejahatan SEPARATOR ', ') AS kategoris
           FROM laporan_a
           WHERE waktu_kejadian BETWEEN :fromDate AND :toDate ${cond}`,
          { replacements: { ...replacements, fromDate, toDate }, type: QueryTypes.SELECT }
        );

        const [statsB] = await sequelize.query(
          `SELECT COUNT(*) AS total,
                  COALESCE(SUM(kerugian), 0) AS kerugian,
                  GROUP_CONCAT(DISTINCT nama_kategori_kejahatan ORDER BY nama_kategori_kejahatan SEPARATOR ', ') AS kategoris
           FROM laporan_b
           WHERE waktu_kejadian BETWEEN :fromDate AND :toDate ${cond}`,
          { replacements: { ...replacements, fromDate, toDate }, type: QueryTypes.SELECT }
        );

        const totalAll = parseInt(statsA.total) + parseInt(statsB.total);
        const kerugianAll = parseInt(statsA.kerugian) + parseInt(statsB.kerugian);

        const dataContext = [
          `Tanggal laporan: ${dateParam}`,
          `LP Model A: ${statsA.total} laporan, kerugian Rp ${parseInt(statsA.kerugian).toLocaleString('id-ID')}`,
          statsA.kategoris ? `  Jenis kejahatan A: ${statsA.kategoris}` : '',
          `LP Model B: ${statsB.total} laporan, kerugian Rp ${parseInt(statsB.kerugian).toLocaleString('id-ID')}`,
          statsB.kategoris ? `  Jenis kejahatan B: ${statsB.kategoris}` : '',
          `Total semua: ${totalAll} laporan, kerugian Rp ${kerugianAll.toLocaleString('id-ID')}`,
        ].filter(Boolean).join('\n');

        const system = `Kamu adalah analis intelijen kepolisian Indonesia. 
Buat briefing harian yang ringkas, profesional, dan actionable untuk pimpinan.
Gunakan bahasa Indonesia formal. Sertakan: ringkasan situasi, analisis singkat, dan rekomendasi tindak lanjut.
Maksimal 300 kata.`;

        const aiSummary = await callAI(system, `Buat briefing harian berdasarkan data:\n${dataContext}`, 600);

        return {
          tanggal: dateParam,
          raw_stats: {
            laporan_a: { total: parseInt(statsA.total), kerugian: parseInt(statsA.kerugian), kategoris: statsA.kategoris },
            laporan_b: { total: parseInt(statsB.total), kerugian: parseInt(statsB.kerugian), kategoris: statsB.kategoris },
            total_semua: totalAll,
            total_kerugian: kerugianAll,
          },
          briefing: aiSummary,
        };
      }, TTL_BRIEFING);

      return ApiResponse.success(res, { ...data, _cached: fromCache });
    } catch (error) {
      logger.error('AI briefing error:', error.message);
      if (error.message?.includes('OPENAI_API_KEY')) {
        return ApiResponse.error(res, 'Layanan AI belum dikonfigurasi. Set OPENAI_API_KEY di .env', 503);
      }
      return ApiResponse.error(res, 'Gagal membuat briefing', 503);
    }
  },

  // ── GET /insight/smart-search ─────────────────────────────────────────────────
  async smartSearch(req, res) {
    try {
      const q = (req.query.q || '').trim();
      if (q.length < 3) {
        return ApiResponse.error(res, 'Parameter q minimal 3 karakter', 400);
      }

      const key = cache.buildKey('insight:smartsearch', { h: md5(q), scope: scopeKey(req) });

      const { data, fromCache } = await cache.remember(key, async () => {
        // Step 1 — AI mem-parse natural language jadi keyword & filter
        const system = `Kamu adalah parser query pencarian data kejahatan Kepolisian Indonesia.
Ekstrak keyword dari kalimat natural. Balas HANYA JSON valid tanpa markdown:
{"keywords": ["kw1", "kw2"], "kategori_kejahatan": "...", "lokasi": "...", "periode": "...", "jenis_pelaku": "..."}`;

        let queryParams = { keywords: [q] };
        try {
          const aiText = await callAI(system, `Parse query pencarian: "${q}"`, 300);
          queryParams = safeJsonParse(aiText);
        } catch (aiErr) {
          logger.warn('Smart-search AI parse failed, fallback to raw keyword:', aiErr.message);
        }

        // Step 2 — Susun kondisi dari SELURUH keyword (MIN-2), bukan hanya yang pertama
        const { cond, replacements } = buildScopeCond(req.scopeFilter || {});
        let keywords = Array.isArray(queryParams.keywords) && queryParams.keywords.length
          ? queryParams.keywords.filter(Boolean) : [q];
        keywords = keywords.map((k) => String(k).trim()).filter((k) => k.length >= 2).slice(0, 6);
        if (keywords.length === 0) keywords = [q];

        const repl = { ...replacements };
        const orParts = keywords.map((k, i) => {
          repl[`kw${i}`] = `%${k}%`;
          return `(uraian_kejadian LIKE :kw${i} OR apa_terjadi LIKE :kw${i} OR tempat_kejadian LIKE :kw${i} OR no_laporan LIKE :kw${i} OR nama_polres LIKE :kw${i})`;
        });
        let kwCond = `(${orParts.join(' OR ')})`;

        // Filter tambahan: kategori kejahatan hasil parsing AI
        if (queryParams.kategori_kejahatan && String(queryParams.kategori_kejahatan).trim()) {
          repl.kat = `%${String(queryParams.kategori_kejahatan).trim()}%`;
          kwCond += ' AND nama_kategori_kejahatan LIKE :kat';
        }

        const buildSql = (tipe) => `
          SELECT id, no_laporan, waktu_kejadian, apa_terjadi, tempat_kejadian,
                 nama_polres, kerugian, nama_kategori_kejahatan, '${tipe}' AS tipe_laporan
          FROM laporan_${tipe}
          WHERE ${kwCond} ${cond}
          ORDER BY waktu_kejadian DESC
          LIMIT 15`;

        const [resultsA, resultsB] = await Promise.all([
          sequelize.query(buildSql('a'), { replacements: repl, type: QueryTypes.SELECT }),
          sequelize.query(buildSql('b'), { replacements: repl, type: QueryTypes.SELECT }),
        ]);

        const results = [...resultsA, ...resultsB].sort((a, b) =>
          new Date(b.waktu_kejadian) - new Date(a.waktu_kejadian)
        );

        return {
          query: q,
          parsed_params: queryParams,
          keywords_used: keywords,
          total: results.length,
          results,
        };
      }, TTL_SEARCH);

      return ApiResponse.success(res, { ...data, _cached: fromCache });
    } catch (error) {
      logger.error('Smart search error:', error.message);
      return ApiResponse.error(res, 'Pencarian semantik gagal', 503);
    }
  },

  // ── GET /insight/forecast ─────────────────────────────────────────────────────
  async forecast(req, res) {
    try {
      const key = cache.buildKey('insight:forecast', { scope: scopeKey(req) });

      const { data, fromCache } = await cache.remember(key, async () => {
        const { cond, replacements } = buildScopeCond(req.scopeFilter || {});

        const buildSql = (tipe) => `
          SELECT HOUR(waktu_kejadian) AS jam,
                 DAYOFWEEK(waktu_kejadian) AS hari_minggu,
                 nama_kategori_kejahatan AS kategori,
                 id_polres, nama_polres,
                 COUNT(*) AS frekuensi
          FROM laporan_${tipe}
          WHERE waktu_kejadian IS NOT NULL ${cond}
          GROUP BY jam, hari_minggu, kategori, id_polres, nama_polres
          ORDER BY frekuensi DESC
          LIMIT 60`;

        const [patternsA, patternsB] = await Promise.all([
          sequelize.query(buildSql('a'), { replacements, type: QueryTypes.SELECT }),
          sequelize.query(buildSql('b'), { replacements, type: QueryTypes.SELECT }),
        ]);

        const allPatterns = [...patternsA, ...patternsB]
          .sort((a, b) => parseInt(b.frekuensi) - parseInt(a.frekuensi))
          .slice(0, 30);

        const system = `Kamu adalah sistem predictive policing Kepolisian Indonesia.
Analisis pola historis kejahatan dan buat prediksi zona & waktu rawan.
Balas HANYA JSON valid tanpa markdown dengan struktur:
{
  "jam_rawan": [{"jam": 0, "label": "00:00", "kategori": "...", "risiko": "tinggi"}],
  "hari_rawan": [{"hari": "Senin", "kategori": "...", "frekuensi": 0}],
  "wilayah_prioritas": [{"polres": "...", "kategori_dominan": "...", "rekomendasi": "..."}],
  "rekomendasi_patroli": ["..."],
  "analisis": "..."
}`;

        const aiText = await callAI(system,
          `Data pola historis (top 30):\n${JSON.stringify(allPatterns, null, 2)}`,
          1200
        );

        return {
          data_points: allPatterns.length,
          forecast: safeJsonParse(aiText),
        };
      }, TTL_FORECAST);

      return ApiResponse.success(res, { ...data, _cached: fromCache });
    } catch (error) {
      logger.error('Forecast error:', error.message);
      if (error.message?.includes('OPENAI_API_KEY')) {
        return ApiResponse.error(res, 'Layanan AI belum dikonfigurasi. Set OPENAI_API_KEY di .env', 503);
      }
      return ApiResponse.error(res, 'Gagal membuat forecast', 503);
    }
  },
};

module.exports = InsightController;