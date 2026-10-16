async function migrateAccountingDetails(connection){
 const [rows]=await connection.query("SHOW COLUMNS FROM chart_of_accounts LIKE 'detail_type'");
 if(!rows.length)throw new Error('Create the Chart of Accounts schema before migrating detail types');
 const length=/^varchar\((\d+)\)/i.exec(rows[0].Type);
 if(length&&Number(length[1])<100)await connection.query('ALTER TABLE chart_of_accounts MODIFY detail_type VARCHAR(100) NULL');
}
module.exports={migrateAccountingDetails};
