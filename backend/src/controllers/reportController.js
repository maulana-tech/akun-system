const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

class ReportController {
  // Trial Balance (Neraca Saldo)
  async trialBalance(req, res) {
    try {
      const { periodId } = req.query;
      
      const result = await prisma.$queryRaw`
        SELECT 
          a.code as "accountCode",
          a.name as "accountName",
          a.normal_balance as "normalBalance",
          COALESCE(SUM(CASE WHEN gl.debit > 0 THEN gl.debit ELSE 0 END), 0) as "totalDebit",
          COALESCE(SUM(CASE WHEN gl.credit > 0 THEN gl.credit ELSE 0 END), 0) as "totalCredit",
          a.opening_balance + COALESCE(SUM(
            CASE 
              WHEN a.normal_balance = 'DEBIT' THEN gl.debit - gl.credit
              ELSE gl.credit - gl.debit
            END
          ), 0) as "endingBalance"
        FROM accounts a
        LEFT JOIN general_ledger gl ON gl.account_id = a.id
        WHERE a.is_header = false AND a.is_active = true
        GROUP BY a.id, a.code, a.name, a.normal_balance, a.opening_balance
        ORDER BY a.code
      `;
      
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
  
  // Income Statement (Rugi Laba)
  async incomeStatement(req, res) {
    try {
      const { startDate, endDate } = req.query;
      
      // Revenue
      const revenue = await prisma.$queryRaw`
        SELECT 
          a.code, a.name,
          COALESCE(SUM(gl.credit - gl.debit), 0) as amount
        FROM accounts a
        LEFT JOIN general_ledger gl ON gl.account_id = a.id 
          AND gl.transaction_date BETWEEN ${new Date(startDate)}::date AND ${new Date(endDate)}::date
        WHERE a.account_type = 'REVENUE' AND a.is_header = false
        GROUP BY a.id, a.code, a.name
      `;
      
      // Expenses
      const expenses = await prisma.$queryRaw`
        SELECT 
          a.code, a.name,
          COALESCE(SUM(gl.debit - gl.credit), 0) as amount
        FROM accounts a
        LEFT JOIN general_ledger gl ON gl.account_id = a.id 
          AND gl.transaction_date BETWEEN ${new Date(startDate)}::date AND ${new Date(endDate)}::date
        WHERE a.account_type = 'EXPENSE' AND a.is_header = false
        GROUP BY a.id, a.code, a.name
      `;
      
      const totalRevenue = revenue.reduce((sum, r) => sum + parseFloat(r.amount), 0);
      const totalExpense = expenses.reduce((sum, e) => sum + parseFloat(e.amount), 0);
      const netIncome = totalRevenue - totalExpense;
      
      res.json({
        revenue,
        expenses,
        summary: {
          totalRevenue,
          totalExpense,
          netIncome
        }
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
  
  // Balance Sheet (Neraca)
  async balanceSheet(req, res) {
    try {
      const { asOfDate } = req.query;
      
      const [assetsRaw, liabilitiesRaw, equityRaw] = await Promise.all([
        // Assets
        prisma.$queryRaw`
          SELECT a.code, a.name, a.normal_balance as "normalBalance",
            (a.opening_balance + COALESCE(SUM(gl.debit), 0) - COALESCE(SUM(gl.credit), 0)) as "debitBalance",
            (a.opening_balance + COALESCE(SUM(gl.credit), 0) - COALESCE(SUM(gl.debit), 0)) as "creditBalance"
          FROM accounts a
          LEFT JOIN general_ledger gl ON gl.account_id = a.id 
            AND gl.transaction_date <= ${new Date(asOfDate)}::date
          WHERE a.account_type = 'ASSET' AND a.is_header = false
          GROUP BY a.id, a.code, a.name, a.opening_balance, a.normal_balance
        `,
        // Liabilities
        prisma.$queryRaw`
          SELECT a.code, a.name, a.normal_balance as "normalBalance",
            (a.opening_balance + COALESCE(SUM(gl.debit), 0) - COALESCE(SUM(gl.credit), 0)) as "debitBalance",
            (a.opening_balance + COALESCE(SUM(gl.credit), 0) - COALESCE(SUM(gl.debit), 0)) as "creditBalance"
          FROM accounts a
          LEFT JOIN general_ledger gl ON gl.account_id = a.id 
            AND gl.transaction_date <= ${new Date(asOfDate)}::date
          WHERE a.account_type = 'LIABILITY' AND a.is_header = false
          GROUP BY a.id, a.code, a.name, a.opening_balance, a.normal_balance
        `,
        // Equity
        prisma.$queryRaw`
          SELECT a.code, a.name, a.normal_balance as "normalBalance",
            (a.opening_balance + COALESCE(SUM(gl.credit), 0) - COALESCE(SUM(gl.debit), 0)) as "balance"
          FROM accounts a
          LEFT JOIN general_ledger gl ON gl.account_id = a.id 
            AND gl.transaction_date <= ${new Date(asOfDate)}::date
          WHERE a.account_type = 'EQUITY' AND a.is_header = false
          GROUP BY a.id, a.code, a.name, a.opening_balance, a.normal_balance
        `
      ]);

      const assets = assetsRaw.map(a => ({
        code: a.code,
        name: a.name,
        amount: a.normalBalance === 'DEBIT' ? parseFloat(a.debitBalance) : -parseFloat(a.creditBalance)
      }));

      const liabilities = liabilitiesRaw.map(l => ({
        code: l.code,
        name: l.name,
        amount: l.normalBalance === 'CREDIT' ? parseFloat(l.creditBalance) : -parseFloat(l.debitBalance)
      }));

      const equity = equityRaw.map(e => ({
        code: e.code,
        name: e.name,
        amount: parseFloat(e.balance)
      }));
      
      const totalAssets = assets.reduce((s, a) => s + a.amount, 0);
      const totalLiabilities = liabilities.reduce((s, l) => s + l.amount, 0);
      const totalEquity = equity.reduce((s, e) => s + e.amount, 0);
      
      res.json({
        assets,
        liabilities,
        equity,
        summary: {
          totalAssets,
          totalLiabilities,
          totalEquity,
          totalLiabilitiesEquity: totalLiabilities + totalEquity,
          isBalanced: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 1
        }
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
}

module.exports = new ReportController();
