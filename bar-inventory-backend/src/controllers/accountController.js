const Account = require('../models/Account');
const { getClient } = require('../config/db');

exports.getAccounts = async (req, res) => {
  try {
    const { rows } = await Account.findAll();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getAccount = async (req, res) => {
  try {
    const { rows } = await Account.findById(req.params.id);
    if (rows.length === 0) return res.status(404).json({ error: 'Account not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.createAccount = async (req, res) => {
  try {
    const { rows } = await Account.create(req.body);
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateAccount = async (req, res) => {
  try {
    const { rows } = await Account.update(req.params.id, req.body);
    if (rows.length === 0) return res.status(404).json({ error: 'Account not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.deleteAccount = async (req, res) => {
  try {
    await Account.delete(req.params.id);
    res.json({ message: 'Account deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getAccountBook = async (req, res) => {
  try {
    const { startDate, endDate, transactionType } = req.query;
    const book = await Account.getBook(req.params.id, startDate, endDate, transactionType);
    res.json(book);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.ensureOpeningBalanceEquity = async (req, res) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const { rows: existing } = await client.query(
      "SELECT * FROM chart_of_accounts WHERE account_code = ? OR (account_type = 'Equity' AND account_name = ?) ORDER BY id LIMIT 1",
      ['3000', 'Opening Balance Equity']
    );
    let account = existing[0];
    if (!account) {
      const { insertId } = await client.query(
        `INSERT INTO chart_of_accounts (account_code, account_name, account_type, account_subtype, detail_type, normal_balance, active)
         VALUES (?, ?, 'Equity', ?, ?, 'Credit', TRUE)`,
        ['3000', 'Opening Balance Equity', 'Opening Balances', 'Opening Balance Equity']
      );
      const { rows } = await client.query('SELECT * FROM chart_of_accounts WHERE id = ?', [insertId]);
      account = rows[0];
    }
    await client.query(
      `INSERT INTO accounting_settings (setting_key, account_id, treasury_id)
       VALUES ('opening_balance_equity', ?, NULL)
       ON DUPLICATE KEY UPDATE account_id = VALUES(account_id), treasury_id = NULL, updated_at = NOW()`,
      [account.id]
    );
    await client.query('COMMIT');
    res.status(existing.length ? 200 : 201).json(account);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
};
