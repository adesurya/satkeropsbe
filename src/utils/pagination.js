'use strict';

/**
 * Parse and sanitize pagination + filter params from query string
 */
const parsePagination = (query) => {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(500, Math.max(1, parseInt(query.limit) || 50));
  const offset = (page - 1) * limit;

  const allowedOrderFields = [
    'updated_at', 'created_at', 'tgl_laporan', 'waktu_kejadian',
    'kerugian', 'no_laporan', 'id',
  ];
  const order_by = allowedOrderFields.includes(query.order_by)
    ? query.order_by : 'updated_at';
  const sort = ['ASC', 'DESC'].includes((query.sort || '').toUpperCase())
    ? query.sort.toUpperCase() : 'DESC';

  const showby = allowedOrderFields.includes(query.showby)
    ? query.showby : 'updated_at';

  return { page, limit, offset, order_by, sort, showby };
};

/**
 * Parse date range filter
 */
const parseDateRange = (query) => {
  const { from, to, from_hour, to_hour, showby } = query;

  const dateField = ['updated_at', 'created_at', 'tgl_laporan', 'waktu_kejadian']
    .includes(showby) ? showby : 'updated_at';

  let fromDate = null;
  let toDate = null;

  if (from) {
    const fromHour = from_hour || '00:00:00';
    fromDate = `${from} ${fromHour}`;
  }

  if (to) {
    const toHour = to_hour || '23:59:59';
    toDate = `${to} ${toHour}`;
  }

  return { fromDate, toDate, dateField };
};

module.exports = { parsePagination, parseDateRange };
