const { query } = require('../config/db');
const { getBusinessId } = require('../utils/tenant');

const config = {
  units: {
    table: 'units',
    order: 'u.name',
    select: 'u.*',
    joins: '',
  },
  categories: {
    table: 'categories',
    order: 'c.parent_id IS NOT NULL, c.name',
    select: 'c.*',
    joins: '',
  },
  brands: {
    table: 'brands',
    order: 'b.name',
    select: 'b.*',
    joins: '',
  },
};

function badRequest(message) {
  return Object.assign(new Error(message), { status: 400 });
}

function pick(type) {
  const picked = config[type];
  if (!picked) throw badRequest('Unknown reference type');
  return picked;
}

function normalizeLocationId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw badRequest('Business location is required');
  return id;
}

function validate(type, body) {
  const name = String(body.name || '').trim();
  if (!name) throw badRequest('Name is required');
  if (name.length > 150) throw badRequest('Name must be at most 150 characters');
  const locationId = normalizeLocationId(body.locationId ?? body.location_id);

  if (type === 'units') {
    const shortName = String(body.shortName ?? body.short_name ?? '').trim();
    const baseUnitId = body.baseUnitId || body.base_unit_id ? Number(body.baseUnitId ?? body.base_unit_id) : null;
    const multiplier = body.multiplier || body.multiplier === 0 ? Number(body.multiplier) : null;
    if (shortName.length > 30) throw badRequest('Short name must be at most 30 characters');
    if (baseUnitId && (!Number.isInteger(baseUnitId) || baseUnitId <= 0)) throw badRequest('Base unit is invalid');
    if (baseUnitId && (!Number.isFinite(multiplier) || multiplier <= 0)) throw badRequest('Multiplier must be greater than zero');
    return { name, locationId, shortName: shortName || null, allowDecimal: !!body.allowDecimal || body.allow_decimal === 1 || body.allow_decimal === true, baseUnitId, multiplier };
  }

  if (type === 'categories') {
    const code = String(body.code || '').trim();
    const description = String(body.description || '').trim();
    const parentId = body.parentId || body.parent_id ? Number(body.parentId ?? body.parent_id) : null;
    if (code.length > 50) throw badRequest('Category code must be at most 50 characters');
    if (parentId && (!Number.isInteger(parentId) || parentId <= 0)) throw badRequest('Parent category is invalid');
    return { name, locationId, code: code || null, description: description || null, parentId };
  }

  const description = String(body.description || '').trim();
  return { name, locationId, description: description || null };
}

async function getAll(req, res, next) {
  try {
    const type = req.params.type;
    const cfg = pick(type);
    const alias = cfg.table[0];
    const params = [getBusinessId(req)];
    let sql = `SELECT ${cfg.select} FROM ${cfg.table} ${alias} ${cfg.joins} WHERE ${alias}.business_id=?`;
    if (req.query.locationId) {
      params.push(req.query.locationId);
      sql += ` AND ${alias}.location_id=?`;
    }
    if (req.query.search) {
      params.push(`%${req.query.search}%`);
      sql += ` AND ${alias}.name LIKE ?`;
    }
    sql += ` ORDER BY ${cfg.order}`;
    const { rows } = await query(sql, params);
    if (type === 'units') {
      for (const row of rows) {
        if (row.base_unit_id) {
          const base = await query('SELECT name FROM units WHERE id=?', [row.base_unit_id]);
          row.base_unit_name = base.rows[0]?.name || null;
        } else {
          row.base_unit_name = null;
        }
      }
    }
    if (type === 'categories') {
      for (const row of rows) {
        if (row.parent_id) {
          const parent = await query('SELECT name FROM categories WHERE id=?', [row.parent_id]);
          row.parent_name = parent.rows[0]?.name || null;
        } else {
          row.parent_name = null;
        }
      }
    }
    res.json(rows);
  } catch (err) { next(err); }
}

async function create(req, res, next) {
  try {
    const type = req.params.type;
    const values = validate(type, req.body);

    if (type === 'units') {
      if (values.baseUnitId) {
        const { rows } = await query('SELECT id FROM units WHERE id=? AND location_id=? AND business_id=?', [values.baseUnitId, values.locationId, getBusinessId(req)]);
        if (!rows.length) throw badRequest('Base unit must be in the same business location');
      }
      const { insertId } = await query(
        `INSERT INTO units (business_id, location_id, name, short_name, allow_decimal, base_unit_id, multiplier)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [getBusinessId(req), values.locationId, values.name, values.shortName, values.allowDecimal, values.baseUnitId, values.baseUnitId ? values.multiplier : null]
      );
      const { rows } = await query('SELECT * FROM units WHERE id=?', [insertId]);
      rows[0].base_unit_name = values.baseUnitId ? (await query('SELECT name FROM units WHERE id=?', [values.baseUnitId])).rows[0]?.name || null : null;
      return res.status(201).json(rows[0]);
    }

    if (type === 'categories') {
      if (values.parentId) {
        const { rows } = await query('SELECT id FROM categories WHERE id=? AND location_id=? AND business_id=?', [values.parentId, values.locationId, getBusinessId(req)]);
        if (!rows.length) throw badRequest('Parent category must be in the same business location');
      }
      const { insertId } = await query(
        `INSERT INTO categories (business_id, location_id, name, code, description, parent_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [getBusinessId(req), values.locationId, values.name, values.code, values.description, values.parentId]
      );
      const { rows } = await query('SELECT * FROM categories WHERE id=?', [insertId]);
      rows[0].parent_name = values.parentId ? (await query('SELECT name FROM categories WHERE id=?', [values.parentId])).rows[0]?.name || null : null;
      return res.status(201).json(rows[0]);
    }

    const { insertId } = await query(
      'INSERT INTO brands (business_id, location_id, name, description) VALUES (?, ?, ?, ?)',
      [getBusinessId(req), values.locationId, values.name, values.description]
    );
    const { rows } = await query('SELECT * FROM brands WHERE id=?', [insertId]);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
}

async function update(req, res, next) {
  try {
    const type = req.params.type;
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw badRequest('Invalid reference record');
    const values = validate(type, req.body);

    if (type === 'units') {
      if (values.baseUnitId === id) throw badRequest('A unit cannot be based on itself');
      if (values.baseUnitId) {
        const { rows } = await query('SELECT id FROM units WHERE id=? AND location_id=? AND business_id=?', [values.baseUnitId, values.locationId, getBusinessId(req)]);
        if (!rows.length) throw badRequest('Base unit must be in the same business location');
      }
      const { rowCount } = await query(
        `UPDATE units SET location_id=?, name=?, short_name=?, allow_decimal=?, base_unit_id=?, multiplier=?, updated_at=NOW()
         WHERE id=? AND business_id=?`,
        [values.locationId, values.name, values.shortName, values.allowDecimal, values.baseUnitId, values.baseUnitId ? values.multiplier : null, id, getBusinessId(req)]
      );
      if (!rowCount) return res.status(404).json({ message: 'Unit not found' });
      const { rows } = await query('SELECT * FROM units WHERE id=?', [id]);
      rows[0].base_unit_name = values.baseUnitId ? (await query('SELECT name FROM units WHERE id=?', [values.baseUnitId])).rows[0]?.name || null : null;
      return res.json(rows[0]);
    }

    if (type === 'categories') {
      if (values.parentId === id) throw badRequest('A category cannot be its own parent');
      if (values.parentId) {
        const { rows } = await query('SELECT id FROM categories WHERE id=? AND location_id=? AND business_id=?', [values.parentId, values.locationId, getBusinessId(req)]);
        if (!rows.length) throw badRequest('Parent category must be in the same business location');
      }
      const { rowCount } = await query(
        `UPDATE categories SET location_id=?, name=?, code=?, description=?, parent_id=?, updated_at=NOW()
         WHERE id=? AND business_id=?`,
        [values.locationId, values.name, values.code, values.description, values.parentId, id, getBusinessId(req)]
      );
      if (!rowCount) return res.status(404).json({ message: 'Category not found' });
      const { rows } = await query('SELECT * FROM categories WHERE id=?', [id]);
      rows[0].parent_name = values.parentId ? (await query('SELECT name FROM categories WHERE id=?', [values.parentId])).rows[0]?.name || null : null;
      return res.json(rows[0]);
    }

    const { rowCount } = await query(
      'UPDATE brands SET location_id=?, name=?, description=?, updated_at=NOW() WHERE id=?',
      [values.locationId, values.name, values.description, id, getBusinessId(req)]
    );
    if (!rowCount) return res.status(404).json({ message: 'Brand not found' });
    const { rows } = await query('SELECT * FROM brands WHERE id=?', [id]);
    res.json(rows[0]);
  } catch (err) { next(err); }
}

async function remove(req, res, next) {
  try {
    const cfg = pick(req.params.type);
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw badRequest('Invalid reference record');
    const { rowCount } = await query(`DELETE FROM ${cfg.table} WHERE id=? AND business_id=?`, [id, getBusinessId(req)]);
    if (!rowCount) return res.status(404).json({ message: 'Record not found' });
    res.json({ message: 'Record deleted' });
  } catch (err) { next(err); }
}

module.exports = { getAll, create, update, remove };

