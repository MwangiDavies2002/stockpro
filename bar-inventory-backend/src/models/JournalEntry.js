const { query, getClient } = require('../config/db');

const JournalEntry = {
  create: async (data) => {
    const client = await getClient();
    try {
      await client.query('BEGIN');
      
      const { insertId } = await client.query(
        `INSERT INTO journal_entries (posting_date, description, reference, notes) 
         VALUES (?, ?, ?, ?)`,
        [data.journalDate, data.description || null, data.referenceNo || null, data.notes || null]
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
      ORDER BY je.posting_date DESC
    `);
  },

  findById: async (id) => {
    const { rows: entries } = await query('SELECT * FROM journal_entries WHERE id = ?', [id]);
    if (entries.length === 0) return null;
    
    const { rows: lines } = await query('SELECT * FROM journal_entry_lines WHERE journal_entry_id = ?', [id]);
    return { ...entries[0], lines };
  }
};

module.exports = JournalEntry;
