const Treasury = require('../models/Treasury');
const TreasuryTransaction = require('../models/TreasuryTransaction');
const { getClient, query } = require('../config/db');
const Journal = require('../models/Journal');
const { getBusinessId } = require('../utils/tenant');

exports.getTreasuries = async (req, res) => {
  try {
    const { rows } = await Treasury.findAll(getBusinessId(req));
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getTreasury = async (req, res) => {
  try {
    const { rows } = await Treasury.findById(req.params.id, getBusinessId(req));
    if (rows.length === 0) return res.status(404).json({ error: 'Treasury not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.createTreasury = async (req, res) => {
  const openingBalance = Number(req.body.opening_balance || 0);
  if (!Number.isFinite(openingBalance) || openingBalance < 0) {
    return res.status(400).json({ error: 'Opening balance must be a non-negative number' });
  }

  if (openingBalance === 0) {
    try {
      let linked = Number(req.body.linked_gl_account) || null;
      if (!linked) {
        const { insertId } = await query(
          `INSERT INTO chart_of_accounts (business_id,account_code,account_name,account_type,account_subtype,detail_type,normal_balance,active)
           SELECT ?, CAST(COALESCE(MAX(CAST(account_code AS UNSIGNED)),1000)+1 AS CHAR), ?, 'Assets','Cash and cash equivalents','Treasury','Debit',TRUE
           FROM chart_of_accounts WHERE business_id=? AND account_type='Assets'`,
          [getBusinessId(req), `${req.body.name} (Treasury)`, getBusinessId(req)]
        );
        linked = insertId;
      }
      const { rows } = await Treasury.create({ ...req.body, linked_gl_account: linked }, getBusinessId(req));
      return res.status(201).json(rows[0]);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  let linkedAccountId = Number(req.body.linked_gl_account) || null;

  const client = await getClient();
  try {
    await client.query('BEGIN');
    if (!linkedAccountId) {
      const businessId = getBusinessId(req);
      const nextCode = await client.query("SELECT COALESCE(MAX(CAST(account_code AS UNSIGNED)), 1000) + 1 AS code FROM chart_of_accounts WHERE business_id=? AND account_type='Assets'", [businessId]);
      const createdAccount = await client.query(
        `INSERT INTO chart_of_accounts (business_id,account_code,account_name,account_type,account_subtype,detail_type,normal_balance,active)
         VALUES (?,?,?,'Assets','Cash and cash equivalents','Treasury','Debit',TRUE)`,
        [businessId, String(nextCode.rows[0].code), `${req.body.name} (Treasury)`]
      );
      linkedAccountId = createdAccount.insertId;
    }
    const { rows: assetRows } = await client.query(
      "SELECT id FROM chart_of_accounts WHERE id = ? AND account_type = 'Assets' AND active = TRUE",
      [linkedAccountId]
    );
    if (assetRows.length === 0) throw new Error('Linked GL account must be an active asset account');

    const { rows: equityRows } = await client.query(
      `SELECT coa.id FROM accounting_settings s
       JOIN chart_of_accounts coa ON coa.id = s.account_id
       WHERE s.setting_key = 'opening_balance_equity'
         AND coa.account_type = 'Equity' AND coa.active = TRUE`
    );
    if (equityRows.length === 0) {
      throw new Error('Set up an active Opening Balance Equity account before entering an opening balance');
    }

    const { insertId } = await client.query(
      `INSERT INTO treasury
       (business_id, name, type, account_number, linked_gl_account, opening_balance, current_balance, status, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [getBusinessId(req), req.body.name, req.body.type, req.body.account_number || null, linkedAccountId,
        openingBalance, openingBalance, req.body.status || 'active', req.body.notes || null]
    );
    const reference = `OPEN-TREASURY-${insertId}`;
    await Journal.create({
      posting_date: new Date().toISOString().slice(0, 10),
      description: `Opening balance for ${req.body.name}`,
      reference,
      created_by: req.user?.id || null,
    }, [
      { account_id: linkedAccountId, debit: openingBalance, description: 'Treasury opening balance' },
      { account_id: equityRows[0].id, credit: openingBalance, description: 'Opening Balance Equity' },
    ], client);
    await client.query(
      `INSERT INTO treasury_transactions (treasury_id, transaction_type, amount, reference, description)
       VALUES (?, 'Deposit', ?, ?, ?)`,
      [insertId, openingBalance, reference, 'Opening balance']
    );
    const { rows } = await client.query('SELECT * FROM treasury WHERE id = ?', [insertId]);
    await client.query('COMMIT');
    res.status(201).json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
};

exports.updateTreasury = async (req, res) => {
  try {
    const { rows } = await Treasury.update(req.params.id, req.body, getBusinessId(req));
    if (rows.length === 0) return res.status(404).json({ error: 'Treasury not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.deposit = async (req, res) => {
  const { amount, reference, description } = req.body;
  const treasuryId = req.params.id;
  const client = await getClient();
  try {
    await client.query('BEGIN');
    // Update balance
    const { insertId } = await client.query(
      `INSERT INTO treasury_transactions 
      (treasury_id, transaction_type, amount, reference, description) 
      VALUES ($1, $2, $3, $4, $5)`,
      [treasuryId, 'Deposit', amount, reference, description]
    );

    await client.query(
      'UPDATE treasury SET current_balance = current_balance + $1, updated_at = NOW() WHERE id = $2',
      [amount, treasuryId]
    );

    const { rows: tRows } = await client.query('SELECT * FROM treasury WHERE id = $1', [treasuryId]);
    
    await client.query('COMMIT');
    res.json(tRows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
};

exports.withdraw = async (req, res) => {
  const { amount, reference, description } = req.body;
  const treasuryId = req.params.id;
  const client = await getClient();
  try {
    await client.query('BEGIN');
    
    const { rows: tRows } = await client.query('SELECT current_balance FROM treasury WHERE id = $1', [treasuryId]);
    if (tRows.length === 0) throw new Error('Treasury not found');
    if (tRows[0].current_balance < amount) throw new Error('Insufficient funds');

    await client.query(
      `INSERT INTO treasury_transactions 
      (treasury_id, transaction_type, amount, reference, description) 
      VALUES ($1, $2, $3, $4, $5)`,
      [treasuryId, 'Withdrawal', amount, reference, description]
    );

    await client.query(
      'UPDATE treasury SET current_balance = current_balance - $1, updated_at = NOW() WHERE id = $2',
      [amount, treasuryId]
    );

    const { rows: updatedRows } = await client.query('SELECT * FROM treasury WHERE id = $1', [treasuryId]);
    
    await client.query('COMMIT');
    res.json(updatedRows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
};

exports.transfer = async (req, res) => {
  const { fromTreasuryId, toTreasuryId, amount, reference, description } = req.body;
  const client = await getClient();
  try {
    await client.query('BEGIN');
    
    // Check balance
    const { rows: fromRows } = await client.query('SELECT current_balance FROM treasury WHERE id = $1', [fromTreasuryId]);
    if (fromRows.length === 0) throw new Error('Source treasury not found');
    if (fromRows[0].current_balance < amount) throw new Error('Insufficient funds');

    // Deduct from source
    await client.query('UPDATE treasury SET current_balance = current_balance - $1, updated_at = NOW() WHERE id = $2', [amount, fromTreasuryId]);
    
    // Add to destination
    await client.query('UPDATE treasury SET current_balance = current_balance + $1, updated_at = NOW() WHERE id = $2', [amount, toTreasuryId]);
    const { rows: toRows } = await client.query('SELECT * FROM treasury WHERE id = $1', [toTreasuryId]);
    if (toRows.length === 0) throw new Error('Destination treasury not found');

    // Transactions
    const { insertId: fromTxId } = await client.query(
      `INSERT INTO treasury_transactions 
      (treasury_id, transaction_type, amount, reference, description) 
      VALUES ($1, $2, $3, $4, $5)`,
      [fromTreasuryId, 'Withdrawal', amount, reference, `Transfer to ${toRows[0].name}: ${description}`]
    );

    await client.query(
      `INSERT INTO treasury_transactions 
      (treasury_id, transaction_type, amount, reference, description, related_transaction_id) 
      VALUES ($1, $2, $3, $4, $5, $6)`,
      [toTreasuryId, 'Deposit', amount, reference, `Transfer from source: ${description}`, fromTxId]
    );
    
    await client.query('COMMIT');
    res.json({ message: 'Transfer successful' });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
};

exports.getTransactions = async (req, res) => {
  try {
    const { rows } = await TreasuryTransaction.findAll(req.params.id);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
