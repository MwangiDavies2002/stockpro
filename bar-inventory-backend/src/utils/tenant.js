function getBusinessId(req) {
  const id = Number(req.user?.business_id ?? req.user?.businessId ?? 1);
  return Number.isInteger(id) && id > 0 ? id : 1;
}

function appendBusinessScope(sql, alias = '') {
  const prefix = alias ? `${alias}.` : '';
  return `${sql} AND ${prefix}business_id=?`;
}

module.exports = { getBusinessId, appendBusinessScope };
