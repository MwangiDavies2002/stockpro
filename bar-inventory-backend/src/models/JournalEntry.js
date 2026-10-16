const { query, getClient } = require('../config/db');
const { currentBusinessId, currentUser } = require('../utils/tenant');
const { validateJournal } = require('../utils/journalValidation');

const JournalEntry = {
  create: async(data)=>{
    const client=await getClient(),businessId=currentBusinessId();
    try{
      await client.query('BEGIN');
      await client.query('SELECT id FROM businesses WHERE id=? FOR UPDATE',[businessId]);
      const accounts=(await client.query('SELECT * FROM chart_of_accounts WHERE business_id=?',[businessId])).rows;
      const settings=(await client.query('SELECT * FROM accounting_settings WHERE business_id=?',[businessId])).rows;
      const lines=require('../utils/openingJournal').openingJournal(data,accounts,settings);
      const result=await require('../utils/idempotency').once(client,businessId,'manual-opening-journal',data.requestId,async()=>({id:await require('./Journal').create({posting_date:data.journalDate,description:'Inventory opening balance',reference:data.referenceNo||`OPEN-${require('node:crypto').randomUUID()}`,notes:data.notes,entry_type:'opening_balance'},lines,client)}));
      await client.query('COMMIT');return result;
    }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
  },

  findAll: async () => {
    return query(`
      SELECT je.*, u.name added_by,
        (SELECT SUM(debit) FROM journal_entry_lines WHERE journal_entry_id = je.id) as total_debit
      FROM journal_entries je LEFT JOIN users u ON u.id=je.created_by AND u.business_id=je.business_id
      WHERE je.business_id=?
      ORDER BY je.posting_date DESC
    `, [currentBusinessId()]);
  },

  findById: async (id) => {
    const { rows: entries } = await query('SELECT * FROM journal_entries WHERE id = ? AND business_id=?', [id, currentBusinessId()]);
    if (entries.length === 0) return null;

    const { rows: lines } = await query('SELECT l.*,a.account_name,a.account_code FROM journal_entry_lines l JOIN chart_of_accounts a ON a.id=l.account_id WHERE l.journal_entry_id=? AND a.business_id=? ORDER BY l.id', [id,currentBusinessId()]);
    return { ...entries[0], lines };
  }
};

module.exports = JournalEntry;
