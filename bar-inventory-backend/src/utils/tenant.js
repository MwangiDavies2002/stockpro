function getBusinessId(req) {
  const id = Number(req.user?.business_id ?? req.user?.businessId);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function appendBusinessScope(sql, alias = '') {
  const prefix = alias ? `${alias}.` : '';
  return `${sql} AND ${prefix}business_id=?`;
}

module.exports = { getBusinessId, appendBusinessScope, runForBusiness, currentBusinessId, currentUser };
const { AsyncLocalStorage } = require('node:async_hooks');
const scope = new AsyncLocalStorage();
function runForBusiness(businessId, fn, user = null) {
  if (!Number.isInteger(Number(businessId)) || Number(businessId) < 1) throw new Error('Valid shop context is required');
  return scope.run({ businessId: Number(businessId), user }, fn);
}
function currentBusinessId() {
  const id = scope.getStore()?.businessId;
  if (!id) throw new Error('Shop context is required');
  return id;
}
function currentUser() { return scope.getStore()?.user; }
