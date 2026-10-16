const { query } = require('../config/db');
const { currentBusinessId, currentUser } = require('../utils/tenant');
const { validateJournal } = require('../utils/journalValidation');

const Journal = {
  create: async (data, lines, client = null) => {
    const q = client ? client.query.bind(client) : query;
    validateJournal(lines);

    for(const line of lines){const {rows}=await q('SELECT id FROM chart_of_accounts WHERE id=? AND business_id=? AND active=TRUE',[line.account_id,currentBusinessId()]);if(!rows.length)throw Object.assign(new Error('Journal account must be active and belong to your shop'),{status:400});}
    // Create Journal Entry
    const { insertId: journalId } = await q(
      `INSERT INTO journal_entries (business_id,posting_date, description, reference, created_by,entry_type,notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [currentBusinessId(), data.posting_date, data.description, data.reference, data.created_by || currentUser()?.id || null,data.entry_type||'system',data.notes||null]
    );

    // Create Lines
    for (const line of lines) {
      await q(
        `INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit, description)
         VALUES (?, ?, ?, ?, ?)`,
        [journalId, line.account_id, line.debit || 0, line.credit || 0, line.description || data.description]
      );
    }

    return journalId;
  },

  findAll: async () => {
    return query(`
      SELECT je.*,
             JSON_ARRAYAGG(
               JSON_OBJECT(
                 'id', jel.id,
                 'account_id', jel.account_id,
                 'account_name', (SELECT account_name FROM chart_of_accounts WHERE id = jel.account_id),
                 'account_code', (SELECT account_code FROM chart_of_accounts WHERE id = jel.account_id),
                 'debit', jel.debit,
                 'credit', jel.credit,
                 'description', jel.description
               )
             ) as \`lines\`
      FROM journal_entries je
      LEFT JOIN journal_entry_lines jel ON je.id = jel.journal_entry_id
      WHERE je.business_id=?
      GROUP BY je.id
      ORDER BY je.posting_date DESC, je.id DESC
    `, [currentBusinessId()]);
  }
};

module.exports = Journal;
