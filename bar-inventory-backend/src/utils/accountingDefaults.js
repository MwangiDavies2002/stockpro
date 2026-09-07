const { query } = require('../config/db');

const purchaseMappings = [
  {
    key: 'inventory_asset',
    code: '1200',
    name: 'Inventory Asset',
    type: 'Assets',
    subtype: 'Current Assets',
    detail: 'Inventory',
    normal: 'Debit',
  },
  {
    key: 'purchases_payable',
    code: '2000',
    name: 'Accounts Payable',
    type: 'Liabilities',
    subtype: 'Current Liabilities',
    detail: 'Accounts Payable',
    normal: 'Credit',
  },
  {
    key: 'purchases_expense',
    code: '5100',
    name: 'Purchase Expense',
    type: 'Expenses',
    subtype: 'Operating Expenses',
    detail: 'Purchases',
    normal: 'Debit',
  },
];

async function ensureAccount(client, account) {
  const q = client ? client.query.bind(client) : query;
  const { rows: existing } = await q(
    'SELECT id FROM chart_of_accounts WHERE account_code = ? OR account_name = ? ORDER BY id LIMIT 1',
    [account.code, account.name]
  );
  if (existing.length) return existing[0].id;

  const result = await q(
    `INSERT INTO chart_of_accounts
     (account_code, account_name, account_type, account_subtype, detail_type, normal_balance, active)
     VALUES (?, ?, ?, ?, ?, ?, TRUE)`,
    [account.code, account.name, account.type, account.subtype, account.detail, account.normal]
  );
  return result.insertId;
}

async function ensurePurchaseAccountingMappings(client = null) {
  const q = client ? client.query.bind(client) : query;
  const accountIds = {};

  for (const mapping of purchaseMappings) {
    const accountId = await ensureAccount(client, mapping);
    await q(
      `INSERT INTO accounting_settings (setting_key, account_id, treasury_id)
       VALUES (?, ?, NULL)
       ON DUPLICATE KEY UPDATE
         account_id = COALESCE(accounting_settings.account_id, VALUES(account_id)),
         treasury_id = NULL,
         updated_at = NOW()`,
      [mapping.key, accountId]
    );
    accountIds[mapping.key] = accountId;
  }

  return accountIds;
}

module.exports = { ensurePurchaseAccountingMappings };
