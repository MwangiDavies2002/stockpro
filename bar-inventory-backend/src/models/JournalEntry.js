const { query, getClient } = require('../config/db');
const { currentBusinessId, currentUser } = require('../utils/tenant');
const { validateJournal } = require('../utils/journalValidation');

const JournalEntry = {
  create: async (data) => {
    validateJournal(data.lines);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(data.journalDate))) throw Object.assign(new Error('Journal date is required'), { status: 400 });
    const client = await getClient();
    try {
      await client.query('BEGIN');
      for (const line of data.lines) {
        const account = await client.query('SELECT id FROM chart_of_accounts WHERE id=? AND business_id=? AND active=TRUE', [line.accountId, currentBusinessId()]);
        if (!account.rows.length) throw Object.assign(new Error('Journal account must be active and belong to your shop'), { status: 400 });
      }

      const { insertId } = await client.query(
        `INSERT INTO journal_entries (business_id,posting_date, description, reference, notes,created_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [currentBusinessId(), data.journalDate, data.description || null, data.referenceNo || null, data.notes || null, currentUser()?.id || null]
      );

      for (const line of data.lines) {
        await client.query(
          `INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit, description)
           VALUES (?, ?, ?, ?, ?)`,
          [insertId, line.accountId, line.debit || 0, line.credit || 0, line.description || null]
        );
      }

      await client.query('COMMIT');
      return { id: insertId };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  findAll: async () => {
    return query(`
      SELECT je.*,
        (SELECT SUM(debit) FROM journal_entry_lines WHERE journal_entry_id = je.id) as total_debit
      FROM journal_entries je
      WHERE je.business_id=?
      ORDER BY je.posting_date DESC
    `, [currentBusinessId()]);
  },

  findById: async (id) => {
    const { rows: entries } = await query('SELECT * FROM journal_entries WHERE id = ? AND business_id=?', [id, currentBusinessId()]);
    if (entries.length === 0) return null;

    const { rows: lines } = await query('SELECT * FROM journal_entry_lines WHERE journal_entry_id = ?', [id]);
    return { ...entries[0], lines };
  }
};

module.exports = JournalEntry;
