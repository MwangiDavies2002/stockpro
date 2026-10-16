const{validateJournal}=require('../bar-inventory-backend/src/utils/journalValidation');
function postJournal(db,user,data,lines){
 validateJournal(lines);
 const date=data.posting_date||new Date().toISOString().slice(0,10);
 require('../bar-inventory-backend/src/utils/accountPolicy').opening({opening_balance:1,as_of:date});
 for(const line of lines){if(!db.prepare('SELECT id FROM chart_of_accounts WHERE id=? AND business_id=? AND active=1').get(Number(line.account_id??line.accountId),user.business_id))throw Object.assign(new Error('Journal account must be active and belong to your shop'),{status:400});}
 const id=Number(db.prepare('INSERT INTO journal_entries(business_id,posting_date,description,reference,created_by,entry_type,notes) VALUES (?,?,?,?,?,?,?)').run(user.business_id,date,data.description||null,data.reference||null,user.id,data.entry_type||'system',data.notes||null).lastInsertRowid);
 for(const l of lines)db.prepare('INSERT INTO journal_entry_lines(journal_entry_id,account_id,debit,credit,description) VALUES (?,?,?,?,?)').run(id,Number(l.account_id??l.accountId),Number(l.debit||0),Number(l.credit||0),l.description||data.description||null);
 return id;
}
module.exports={postJournal};
