function getBusinessId(req) {
  const id = Number(req.user?.business_id ?? req.user?.businessId);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function appendBusinessScope(sql, alias = '') {
  const prefix = alias ? `${alias}.` : '';
  return `${sql} AND ${prefix}business_id=?`;
}

module.exports = { getBusinessId, appendBusinessScope };
