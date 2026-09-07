const Setting = require('./Setting');
const Journal = require('./Journal');
const { query } = require('../config/db');

const JournalEngine = {
  /**
   * Automatically generate journal entries based on a transaction type.
   */
  generate: async (type, amount, reference, description, client = null, data = null) => {
    // 1. Get mappings
    const { rows: settings } = client
      ? await client.query('SELECT * FROM accounting_settings')
      : await Setting.getAll();
    const map = {};
    const treasuryMap = {};
    settings.forEach(s => {
      map[s.setting_key] = s.account_id;
      treasuryMap[s.setting_key] = s.treasury_id;
    });

    const lines = [];
    const posting_date = data?.postingDate || new Date().toISOString().split('T')[0];

    const getTreasuryGL = async (treasuryId) => {
      if (!treasuryId) return null;
      const q = client ? client.query.bind(client) : query;
      const { rows } = await q('SELECT linked_gl_account FROM treasury WHERE id = ?', [treasuryId]);
      return rows.length > 0 ? rows[0].linked_gl_account : null;
    };

    switch (type) {
      case 'CASH_SALE':
      case 'MPESA_SALE':
      case 'BANK_SALE': {
        let treasuryId = null;
        let settingKey = 'payment_cash';
        if (type === 'MPESA_SALE') settingKey = 'payment_mobile';
        if (type === 'BANK_SALE') settingKey = 'payment_bank';

        treasuryId = treasuryMap[settingKey];
        const linkedGL = await getTreasuryGL(treasuryId);
        const receivableAccount = linkedGL || map.sales_receivable;
        const revenueAccount = map.sales_revenue;

        if (revenueAccount && receivableAccount) {
          // Calculate VAT if applicable
          let vatAmount = 0;
          let netAmount = amount;
          if (map.sales_vat_output) {
             // Assuming tax inclusive for now, or just calculate based on setting
             // If we want to be precise, we'd need tax rate. 
             // For now let's keep it simple or check if VAT account is mapped.
          }

          // Debit Treasury/Receivables, Credit Revenue
          lines.push({ account_id: receivableAccount, debit: amount, description: `${type.replace('_', ' ')}` });
          lines.push({ account_id: revenueAccount, credit: amount, description: 'Sales Revenue' });
          
          // COGS Integration
          if (data && data.cogsAmount && map.inventory_cogs && map.inventory_asset) {
            lines.push({ account_id: map.inventory_cogs, debit: data.cogsAmount, description: 'COGS' });
            lines.push({ account_id: map.inventory_asset, credit: data.cogsAmount, description: 'Inventory Asset' });
          }

          // If it was a treasury account, we also need to update the treasury balance
          if (treasuryId) {
            const q = client ? client.query.bind(client) : query;
            await q('UPDATE treasury SET current_balance = current_balance + ?, updated_at = NOW() WHERE id = ?', [amount, treasuryId]);
            await q(
              `INSERT INTO treasury_transactions 
               (treasury_id, transaction_type, amount, reference, description) 
               VALUES (?, ?, ?, ?, ?)`,
              [treasuryId, 'Deposit', amount, reference, description]
            );
          }
        }
        break;
      }

      case 'DEBT_PAYMENT': {
        // Use provided treasuryId or fallback to setting
        let settingKey = data?.settingKey || 'payment_cash';
        const treasuryId = data?.treasuryId || treasuryMap[settingKey]; 
        const linkedGL = await getTreasuryGL(treasuryId);
        const cashAccount = linkedGL || map.sales_receivable;
        
        if (cashAccount && map.sales_receivable) {
           // Debit Cash/Treasury, Credit Accounts Receivable (Customer Tab)
           lines.push({ account_id: cashAccount, debit: amount, description: 'Debt Payment' });
           lines.push({ account_id: map.sales_receivable, credit: amount, description: 'Customer Credit Reduction' });

           if (treasuryId) {
             const q = client ? client.query.bind(client) : query;
             await q('UPDATE treasury SET current_balance = current_balance + ?, updated_at = NOW() WHERE id = ?', [amount, treasuryId]);
             await q(
               `INSERT INTO treasury_transactions (treasury_id, transaction_type, amount, reference, description) VALUES (?, ?, ?, ?, ?)`,
               [treasuryId, 'Deposit', amount, reference, description]
             );
           }
        }
        break;
      }

      case 'REFUND': {
        const treasuryId = data?.treasuryId || treasuryMap['payment_cash'];
        const linkedGL = await getTreasuryGL(treasuryId);
        const cashAccount = linkedGL || map.sales_receivable;
        const revenueAccount = map.sales_revenue;

        if (revenueAccount && cashAccount) {
           // Debit Revenue, Credit Cash/Treasury (Reversing Sale)
           lines.push({ account_id: revenueAccount, debit: amount, description: 'Refund - Sales Reversal' });
           lines.push({ account_id: cashAccount, credit: amount, description: 'Refund - Cash Out' });

           // COGS Reversal if applicable
           if (data && data.cogsAmount && map.inventory_cogs && map.inventory_asset) {
              lines.push({ account_id: map.inventory_asset, debit: data.cogsAmount, description: 'Refund - Stock Return' });
              lines.push({ account_id: map.inventory_cogs, credit: data.cogsAmount, description: 'Refund - COGS Reversal' });
           }

           if (treasuryId) {
             const q = client ? client.query.bind(client) : query;
             await q('UPDATE treasury SET current_balance = current_balance - ?, updated_at = NOW() WHERE id = ?', [amount, treasuryId]);
             await q(
               `INSERT INTO treasury_transactions (treasury_id, transaction_type, amount, reference, description) VALUES (?, ?, ?, ?, ?)`,
               [treasuryId, 'Withdrawal', amount, reference, description]
             );
           }
        }
        break;
      }

      case 'CREDIT_SALE':
        if (map.sales_revenue && map.sales_receivable) {
          // Debit Receivables (Customer Tab), Credit Revenue
          lines.push({ account_id: map.sales_receivable, debit: amount, description: 'Credit Sale' });
          lines.push({ account_id: map.sales_revenue, credit: amount, description: 'Sales Revenue' });

          // COGS Integration
          if (data && data.cogsAmount && map.inventory_cogs && map.inventory_asset) {
            lines.push({ account_id: map.inventory_cogs, debit: data.cogsAmount, description: 'COGS' });
            lines.push({ account_id: map.inventory_asset, credit: data.cogsAmount, description: 'Inventory Asset' });
          }
        }
        break;

      case 'INVENTORY_SOLD':
        if (map.inventory_cogs && map.inventory_asset) {
          // Debit COGS, Credit Inventory Asset
          lines.push({ account_id: map.inventory_cogs, debit: amount, description: 'COGS' });
          lines.push({ account_id: map.inventory_asset, credit: amount, description: 'Inventory Asset' });
        }
        break;

      case 'PURCHASE': {
        const expenseAmount = Number(data?.expenseAmount || 0);
        const assetAmount = Number((Number(amount) - expenseAmount).toFixed(2));
        if (map.purchases_payable && (!assetAmount || map.inventory_asset) && (!expenseAmount || map.purchases_expense)) {
          if (assetAmount) lines.push({ account_id: map.inventory_asset, debit: assetAmount, description: 'Inventory Purchase' });
          if (expenseAmount) lines.push({ account_id: map.purchases_expense, debit: expenseAmount, description: 'Purchase Expense' });
          lines.push({ account_id: map.purchases_payable, credit: amount, description: 'Accounts Payable' });
        }
        break;
      }

      case 'OPENING_STOCK':
        // Opening stock is an initial equity contribution, not a supplier liability.
        if (map.inventory_asset && map.opening_balance_equity) {
          lines.push({ account_id: map.inventory_asset, debit: amount, description: 'Opening inventory' });
          lines.push({ account_id: map.opening_balance_equity, credit: amount, description: 'Opening Balance Equity' });
        }
        break;

      case 'STOCK_ADJUSTMENT': {
        const direction = data?.quantity > 0 ? 'increase' : 'decrease';
        if (map.inventory_asset && map.inventory_adjustment) {
          const value = Math.abs(amount);
          if (direction === 'increase') {
            lines.push({ account_id: map.inventory_asset, debit: value, description: 'Inventory adjustment increase' });
            lines.push({ account_id: map.inventory_adjustment, credit: value, description: 'Inventory adjustment offset' });
          } else {
            lines.push({ account_id: map.inventory_adjustment, debit: value, description: 'Inventory adjustment offset' });
            lines.push({ account_id: map.inventory_asset, credit: value, description: 'Inventory adjustment decrease' });
          }
        }
        break;
      }

      default:
        return null;
    }

    if (lines.length > 0) {
      return Journal.create({ posting_date, description, reference }, lines, client);
    }
    return null;
  }
};

module.exports = JournalEngine;
