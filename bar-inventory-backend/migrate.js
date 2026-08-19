const { query } = require('./src/config/db');

async function migrate() {
  try {
    console.log('Starting migration...');
    
    // 1. Add details column to chart_of_accounts
    try {
      await query(`
        ALTER TABLE chart_of_accounts 
        ADD COLUMN details JSON AFTER active
      `);
      console.log('Added details column to chart_of_accounts');
    } catch (e) {
      if (e.code === 'ER_DUP_COLUMN_NAME' || e.code === 'ER_DUP_FIELDNAME') {
        console.log('Column details already exists');
      } else {
        throw e;
      }
    }

    // 2. Create journal_entries if missing
    await query(`
      CREATE TABLE IF NOT EXISTS journal_entries (
        id            INT AUTO_INCREMENT PRIMARY KEY,
        posting_date  DATETIME NOT NULL,
        description   TEXT,
        reference     VARCHAR(100) UNIQUE,
        notes         TEXT,
        status        VARCHAR(20) DEFAULT 'posted',
        created_by    INT,
        created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    console.log('Ensured journal_entries table exists');

    // Add notes column if journal_entries already exists but lacks it
    try {
        await query('ALTER TABLE journal_entries ADD COLUMN notes TEXT AFTER reference');
        console.log('Added notes column to journal_entries');
    } catch (e) {
        if (e.code !== 'ER_DUP_COLUMN_NAME') console.log('Notes column already exists or other error:', e.message);
    }

    // 3. Create journal_entry_lines
    await query(`
      CREATE TABLE IF NOT EXISTS journal_entry_lines (
        id                INT AUTO_INCREMENT PRIMARY KEY,
        journal_entry_id  INT NOT NULL,
        account_id        INT NOT NULL,
        debit             DECIMAL(15, 2) DEFAULT 0.00,
        credit            DECIMAL(15, 2) DEFAULT 0.00,
        description       TEXT,
        FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id) ON DELETE CASCADE,
        FOREIGN KEY (account_id) REFERENCES chart_of_accounts(id)
      )
    `);
    console.log('Ensured journal_entry_lines table exists');

    console.log('Migration completed successfully');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

migrate();
