const Account = require('../models/Account');
const { getClient } = require('../config/db');
const { getBusinessId } = require('../utils/tenant');

exports.getAccounts = async (req, res) => {
  try {
    const { rows } = await Account.findAll(getBusinessId(req));
    res.json(rows);
  } catch (err) {
    res.status(err.status||500).json({ error: err.message });
  }
};

exports.getAccount = async (req, res) => {
  try {
    const { rows } = await Account.findById(req.params.id, getBusinessId(req));
    if (rows.length === 0) return res.status(404).json({ error: 'Account not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(err.status||500).json({ error: err.message });
  }
};

exports.createAccount = async (req, res) => {
  try {
    const { rows } = await Account.create(req.body, getBusinessId(req));
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(err.status||500).json({ error: err.message });
  }
};

exports.updateAccount = async (req, res) => {
  try {
    const { rows } = await Account.update(req.params.id, req.body, getBusinessId(req));
    if (rows.length === 0) return res.status(404).json({ error: 'Account not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(err.status||500).json({ error: err.message });
  }
};

exports.deleteAccount = async (req, res) => {
  try {
    await Account.delete(req.params.id, getBusinessId(req));
    res.json({ message: 'Account deleted' });
  } catch (err) {
    res.status(err.status||500).json({ error: err.message });
  }
};

exports.getAccountBook = async (req, res) => {
  try {
    const { startDate, endDate, transactionType } = req.query;
    if (!(await Account.findById(req.params.id, getBusinessId(req))).rows.length) return res.status(404).json({ error: 'Account not found' });
    const book = await Account.getBook(req.params.id, startDate, endDate, transactionType, getBusinessId(req));
    res.json(book);
  } catch (err) {
    res.status(err.status||500).json({ error: err.message });
  }
};

exports.ensureOpeningBalanceEquity = async (req, res) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const account=await require('../utils/accountingDefaults').openingEquity(client,getBusinessId(req));
    await client.query('COMMIT');
    res.status(200).json(account);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(err.status||500).json({ error: err.message });
  } finally {
    client.release();
  }
};
