'use strict';

const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const { Op, QueryTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const { LaporanA, LaporanB } = require('../models');
const { parseDateRange } = require('../utils/pagination');
const ApiResponse = require('../utils/apiResponse');
const logger = require('../utils/logger');

const MAX_EXPORT_ROWS = parseInt(process.env.EXPORT_MAX_ROWS || '5000', 10);

const buildWhere = (query, scopeFilter) => {
  const where = { ...scopeFilter };
  const { fromDate, toDate, dateField } = parseDateRange(query);
  if (fromDate || toDate) {
    where[dateField] = {};
    if (fromDate) where[dateField][Op.gte] = fromDate;
    if (toDate) where[dateField][Op.lte] = toDate;
  }
  if (query.id_polda) where.id_polda = query.id_polda;
  if (query.id_polres) where.id_polres = query.id_polres;
  if (query.kategori_kejahatan) where.nama_kategori_kejahatan = { [Op.like]: `%${query.kategori_kejahatan}%` };
  if (query.provinsi) where.provinsi = { [Op.like]: `%${query.provinsi}%` };
  return where;
};

const COLUMNS = [
  { header: 'No Laporan', key: 'no_laporan', width: 28 },
  { header: 'Tipe', key: 'tipe_laporan', width: 6 },
  { header: 'Waktu Kejadian', key: 'waktu_kejadian', width: 20 },
  { header: 'Kategori', key: 'nama_kategori_kejahatan', width: 24 },
  { header: 'Polda', key: 'nama_polda', width: 22 },
  { header: 'Polres', key: 'nama_polres', width: 22 },
  { header: 'Tempat', key: 'tempat_kejadian', width: 40 },
  { header: 'Kerugian', key: 'kerugian', width: 16 },
];

const fetchLaporan = async (req) => {
  const scope = req.scopeFilter || {};
  const where = buildWhere(req.query, scope);
  const attrs = ['no_laporan', 'waktu_kejadian', 'nama_kategori_kejahatan',
    'nama_polda', 'nama_polres', 'tempat_kejadian', 'kerugian', 'id_polda', 'id_polres'];

  const tipe = ['a', 'b'].includes((req.query.tipe || '').toLowerCase())
    ? req.query.tipe.toLowerCase() : null;

  const tasks = [];
  if (!tipe || tipe === 'a') {
    tasks.push(LaporanA.findAll({ where, attributes: attrs, order: [['waktu_kejadian', 'DESC']], limit: MAX_EXPORT_ROWS })
      .then((rows) => rows.map((r) => ({ ...r.toJSON(), tipe_laporan: 'A' }))));
  }
  if (!tipe || tipe === 'b') {
    tasks.push(LaporanB.findAll({ where, attributes: attrs, order: [['waktu_kejadian', 'DESC']], limit: MAX_EXPORT_ROWS })
      .then((rows) => rows.map((r) => ({ ...r.toJSON(), tipe_laporan: 'B' }))));
  }
  const parts = await Promise.all(tasks);
  return parts.flat().slice(0, MAX_EXPORT_ROWS);
};

const ExportController = {
  /**
   * GET /export/laporan?tipe=a|b&format=xlsx|pdf&from=&to=&id_polda=&...
   */
  async laporan(req, res) {
    try {
      const format = (req.query.format || 'xlsx').toLowerCase();
      if (!['xlsx', 'pdf'].includes(format)) {
        return ApiResponse.error(res, "Parameter format harus 'xlsx' atau 'pdf'", 400);
      }

      const rows = await fetchLaporan(req);
      const stamp = new Date().toISOString().slice(0, 10);

      if (format === 'xlsx') {
        const wb = new ExcelJS.Workbook();
        wb.creator = 'Crime Dashboard API';
        const ws = wb.addWorksheet('Laporan');
        ws.columns = COLUMNS;
        ws.getRow(1).font = { bold: true };
        rows.forEach((r) => ws.addRow(r));

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="laporan_${stamp}.xlsx"`);
        await wb.xlsx.write(res);
        return res.end();
      }

      // PDF (ringkas, tabular)
      const doc = new PDFDocument({ margin: 36, size: 'A4', layout: 'landscape' });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="laporan_${stamp}.pdf"`);
      doc.pipe(res);

      doc.fontSize(16).text('Laporan Kejahatan', { align: 'center' });
      doc.fontSize(9).fillColor('#555')
        .text(`Dibuat: ${new Date().toLocaleString('id-ID')}  •  Total baris: ${rows.length}`, { align: 'center' });
      doc.moveDown(1).fillColor('#000');

      doc.fontSize(8);
      rows.slice(0, 500).forEach((r, i) => {
        const line = `${i + 1}. [${r.tipe_laporan}] ${r.no_laporan || '-'} | ${r.waktu_kejadian || '-'} | ${r.nama_kategori_kejahatan || '-'} | ${r.nama_polres || '-'} | Rp ${Number(r.kerugian || 0).toLocaleString('id-ID')}`;
        doc.text(line, { width: 760 });
      });
      if (rows.length > 500) {
        doc.moveDown(0.5).fillColor('#999')
          .text(`... dan ${rows.length - 500} baris lainnya. Gunakan format XLSX untuk data lengkap.`);
      }
      doc.end();
    } catch (error) {
      logger.error('Export laporan error:', error);
      if (!res.headersSent) return ApiResponse.error(res, 'Gagal membuat file export');
      return res.end();
    }
  },

  /**
   * GET /export/dashboard/summary?format=xlsx|pdf&from=&to=&...
   */
  async dashboardSummary(req, res) {
    try {
      const format = (req.query.format || 'xlsx').toLowerCase();
      if (!['xlsx', 'pdf'].includes(format)) {
        return ApiResponse.error(res, "Parameter format harus 'xlsx' atau 'pdf'", 400);
      }

      const scope = req.scopeFilter || {};
      const { fromDate, toDate, dateField } = parseDateRange(req.query);
      const ALLOWED = ['updated_at', 'created_at', 'waktu_kejadian'];
      const field = ALLOWED.includes(dateField) ? dateField : 'updated_at';

      const conds = ['1=1'];
      const repl = {};
      if (fromDate) { conds.push(`${field} >= :fromDate`); repl.fromDate = fromDate; }
      if (toDate) { conds.push(`${field} <= :toDate`); repl.toDate = toDate; }
      if (scope.id_polda) { conds.push('id_polda = :sp'); repl.sp = scope.id_polda; }
      if (scope.id_polres) { conds.push('id_polres = :sr'); repl.sr = scope.id_polres; }
      const where = conds.join(' AND ');

      const totals = async (tipe) => {
        const [r] = await sequelize.query(
          `SELECT COUNT(*) AS total, COALESCE(SUM(kerugian),0) AS kerugian FROM laporan_${tipe} WHERE ${where}`,
          { replacements: repl, type: QueryTypes.SELECT }
        );
        return { total: parseInt(r.total), kerugian: parseInt(r.kerugian) };
      };
      const byKategori = async (tipe) => sequelize.query(
        `SELECT nama_kategori_kejahatan AS kategori, COUNT(*) AS total, COALESCE(SUM(kerugian),0) AS kerugian
         FROM laporan_${tipe} WHERE ${where} AND nama_kategori_kejahatan IS NOT NULL
         GROUP BY nama_kategori_kejahatan ORDER BY total DESC LIMIT 15`,
        { replacements: repl, type: QueryTypes.SELECT }
      );

      const [a, b, katA, katB] = await Promise.all([totals('a'), totals('b'), byKategori('a'), byKategori('b')]);
      const merged = {};
      [...katA, ...katB].forEach((r) => {
        if (!merged[r.kategori]) merged[r.kategori] = { kategori: r.kategori, total: 0, kerugian: 0 };
        merged[r.kategori].total += parseInt(r.total);
        merged[r.kategori].kerugian += parseInt(r.kerugian);
      });
      const kategori = Object.values(merged).sort((x, y) => y.total - x.total);
      const stamp = new Date().toISOString().slice(0, 10);

      if (format === 'xlsx') {
        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet('Ringkasan');
        ws.addRow(['Ringkasan Dashboard Kejahatan']).font = { bold: true, size: 14 };
        ws.addRow([`Periode: ${req.query.from || '-'} s/d ${req.query.to || '-'}`]);
        ws.addRow([]);
        ws.addRow(['Metrik', 'Nilai']).font = { bold: true };
        ws.addRow(['Total LP/A', a.total]);
        ws.addRow(['Total LP/B', b.total]);
        ws.addRow(['Total Semua', a.total + b.total]);
        ws.addRow(['Total Kerugian (Rp)', a.kerugian + b.kerugian]);
        ws.addRow([]);
        const head = ws.addRow(['Kategori', 'Jumlah', 'Kerugian (Rp)']);
        head.font = { bold: true };
        kategori.forEach((k) => ws.addRow([k.kategori, k.total, k.kerugian]));
        ws.columns = [{ width: 36 }, { width: 14 }, { width: 20 }];

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="ringkasan_${stamp}.xlsx"`);
        await wb.xlsx.write(res);
        return res.end();
      }

      const doc = new PDFDocument({ margin: 48, size: 'A4' });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="ringkasan_${stamp}.pdf"`);
      doc.pipe(res);
      doc.fontSize(18).text('Ringkasan Dashboard Kejahatan', { align: 'center' });
      doc.fontSize(10).fillColor('#555')
        .text(`Periode: ${req.query.from || '-'} s/d ${req.query.to || '-'}  •  Dibuat: ${new Date().toLocaleString('id-ID')}`, { align: 'center' });
      doc.moveDown(1.5).fillColor('#000').fontSize(12);
      doc.text(`Total LP/A   : ${a.total}`);
      doc.text(`Total LP/B   : ${b.total}`);
      doc.text(`Total Semua  : ${a.total + b.total}`);
      doc.text(`Total Kerugian: Rp ${(a.kerugian + b.kerugian).toLocaleString('id-ID')}`);
      doc.moveDown(1).fontSize(13).text('Top Kategori Kejahatan', { underline: true });
      doc.moveDown(0.5).fontSize(10);
      kategori.slice(0, 15).forEach((k, i) => {
        doc.text(`${i + 1}. ${k.kategori} — ${k.total} kasus (Rp ${k.kerugian.toLocaleString('id-ID')})`);
      });
      doc.end();
    } catch (error) {
      logger.error('Export dashboard error:', error);
      if (!res.headersSent) return ApiResponse.error(res, 'Gagal membuat file export');
      return res.end();
    }
  },
};

module.exports = ExportController;