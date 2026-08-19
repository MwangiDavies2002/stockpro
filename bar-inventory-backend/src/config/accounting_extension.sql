-- Accounting & Treasury Extension
-- Target: MySQL (compatible with the current backend db.js wrapper)

-- Module 2: Chart of Accounts
CREATE TABLE IF NOT EXISTS chart_of_accounts (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  account_code    VARCHAR(20) UNIQUE NOT NULL,
  account_name    VARCHAR(150) NOT NULL,
  parent_id       INT NULL,
  account_type    ENUM('Assets', 'Liabilities', 'Equity', 'Income', 'Expenses') NOT NULL,
  account_subtype VARCHAR(50),
  detail_type     VARCHAR(50),
  normal_balance  ENUM('Debit', 'Credit') NOT NULL,
  active          BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (parent_id) REFERENCES chart_of_accounts(id) ON DELETE SET NULL
);

-- Module 1: Treasury
CREATE TABLE IF NOT EXISTS treasury (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  name              VARCHAR(100) NOT NULL,
  type              VARCHAR(50) NOT NULL, -- e.g., 'Cash', 'Bank', 'Mobile Money'
  account_number    VARCHAR(50),
  linked_gl_account INT,
  opening_balance   DECIMAL(15, 2) DEFAULT 0.00,
  current_balance   DECIMAL(15, 2) DEFAULT 0.00,
  status            VARCHAR(20) DEFAULT 'active',
  notes             TEXT,
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (linked_gl_account) REFERENCES chart_of_accounts(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS treasury_transactions (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  treasury_id     INT NOT NULL,
  transaction_type ENUM('Deposit', 'Withdrawal', 'Transfer') NOT NULL,
  amount          DECIMAL(15, 2) NOT NULL,
  date            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  reference       VARCHAR(100),
  description     TEXT,
  related_transaction_id INT NULL, -- For transfers
  created_by      INT,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (treasury_id) REFERENCES treasury(id) ON DELETE CASCADE
);

-- Module 3: Accounting Settings
CREATE TABLE IF NOT EXISTS accounting_settings (
  setting_key   VARCHAR(100) PRIMARY KEY,
  account_id    INT,
  treasury_id   INT,
  updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (account_id) REFERENCES chart_of_accounts(id) ON DELETE SET NULL,
  FOREIGN KEY (treasury_id) REFERENCES treasury(id) ON DELETE SET NULL
);

-- Module 5: Journal Entries
CREATE TABLE IF NOT EXISTS journal_entries (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  posting_date  DATE NOT NULL,
  description   TEXT,
  reference     VARCHAR(100),
  status        VARCHAR(20) DEFAULT 'posted',
  created_by    INT,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS journal_entry_lines (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  journal_entry_id  INT NOT NULL,
  account_id        INT NOT NULL,
  debit             DECIMAL(15, 2) DEFAULT 0.00,
  credit            DECIMAL(15, 2) DEFAULT 0.00,
  description       TEXT,
  FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id) ON DELETE CASCADE,
  FOREIGN KEY (account_id) REFERENCES chart_of_accounts(id)
);

-- Purchase workflow: run with the rest of this extension on existing databases.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS transaction_type ENUM('purchase', 'opening_stock') NOT NULL DEFAULT 'purchase';
-- Keep the audit log extensible for opening stock and post-launch corrections.
ALTER TABLE inventory_stock_log MODIFY change_type VARCHAR(30) NOT NULL;
