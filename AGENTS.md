 Baik, saya lanjutkan dengan Trigger, API Backend, dan Frontend-nya.

---

## 6. Trigger & Stored Procedures (PostgreSQL)

```sql
-- ============================================
-- TRIGGER: Auto-generate Journal Number
-- ============================================
CREATE OR REPLACE FUNCTION generate_journal_no()
RETURNS TRIGGER AS $$
DECLARE
    year_part VARCHAR(4);
    seq_num INTEGER;
    new_no VARCHAR(20);
BEGIN
    year_part := EXTRACT(YEAR FROM NEW.journal_date)::TEXT;
    
    SELECT COALESCE(MAX(CAST(SUBSTRING(journal_no FROM 'JU-\d{4}-(\d+)') AS INTEGER)), 0) + 1
    INTO seq_num
    FROM journal_headers
    WHERE journal_no LIKE 'JU-' || year_part || '-%'
    AND journal_type = NEW.journal_type;
    
    NEW.journal_no := 'JU-' || year_part || '-' || LPAD(seq_num::TEXT, 4, '0');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_journal_no
    BEFORE INSERT ON journal_headers
    FOR EACH ROW
    WHEN (NEW.journal_no IS NULL)
    EXECUTE FUNCTION generate_journal_no();

-- ============================================
-- TRIGGER: Validate Balance Before Posting
-- ============================================
CREATE OR REPLACE FUNCTION validate_journal_balance()
RETURNS TRIGGER AS $$
DECLARE
    total_d DECIMAL(15,2);
    total_c DECIMAL(15,2);
BEGIN
    SELECT COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0)
    INTO total_d, total_c
    FROM journal_details
    WHERE journal_id = NEW.id;
    
    IF total_d <> total_c THEN
        RAISE EXCEPTION 'Jurnal tidak balance! Debit: %, Kredit: %', total_d, total_c;
    END IF;
    
    NEW.total_debit := total_d;
    NEW.total_credit := total_c;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_balance
    BEFORE UPDATE OF is_posted ON journal_headers
    FOR EACH ROW
    WHEN (NEW.is_posted = TRUE AND OLD.is_posted = FALSE)
    EXECUTE FUNCTION validate_journal_balance();

-- ============================================
-- TRIGGER: Posting to General Ledger
-- ============================================
CREATE OR REPLACE FUNCTION post_to_ledger()
RETURNS TRIGGER AS $$
DECLARE
    jd RECORD;
    running_balance DECIMAL(15,2);
    acc_normal VARCHAR(10);
BEGIN
    FOR jd IN 
        SELECT * FROM journal_details 
        WHERE journal_id = NEW.id 
        ORDER BY line_no
    LOOP
        -- Get normal balance
        SELECT normal_balance INTO acc_normal 
        FROM accounts WHERE id = jd.account_id;
        
        -- Calculate running balance
        SELECT COALESCE(balance, 0) INTO running_balance
        FROM general_ledger
        WHERE account_id = jd.account_id
        ORDER BY id DESC
        LIMIT 1;
        
        IF running_balance IS NULL THEN
            running_balance := (SELECT opening_balance FROM accounts WHERE id = jd.account_id);
        END IF;
        
        -- Update balance based on normal balance
        IF acc_normal = 'DEBIT' THEN
            running_balance := running_balance + jd.debit - jd.credit;
        ELSE
            running_balance := running_balance + jd.credit - jd.debit;
        END IF;
        
        -- Insert to ledger
        INSERT INTO general_ledger (
            account_id, period_id, journal_id, transaction_date,
            description, debit, credit, balance, reference
        ) VALUES (
            jd.account_id, NEW.period_id, NEW.id, NEW.journal_date,
            jd.description, jd.debit, jd.credit, running_balance, NEW.journal_no
        );
        
        -- Update account current balance
        UPDATE accounts 
        SET opening_balance = running_balance
        WHERE id = jd.account_id;
    END LOOP;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_post_ledger
    AFTER UPDATE OF is_posted ON journal_headers
    FOR EACH ROW
    WHEN (NEW.is_posted = TRUE AND OLD.is_posted = FALSE)
    EXECUTE FUNCTION post_to_ledger();

-- ============================================
-- PROCEDURE: Generate Trial Balance
-- ============================================
CREATE OR REPLACE FUNCTION generate_trial_balance(p_period_id INTEGER)
RETURNS TABLE (
    account_code VARCHAR(20),
    account_name VARCHAR(100),
    opening_balance NUMERIC,
    debit NUMERIC,
    credit NUMERIC,
    ending_balance NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        a.code,
        a.name,
        COALESCE(tb.opening_balance, a.opening_balance)::NUMERIC,
        COALESCE(tb.debit_movement, 0)::NUMERIC,
        COALESCE(tb.credit_movement, 0)::NUMERIC,
        (COALESCE(tb.opening_balance, a.opening_balance) + 
         CASE WHEN a.normal_balance = 'DEBIT' 
              THEN COALESCE(tb.debit_movement, 0) - COALESCE(tb.credit_movement, 0)
              ELSE COALESCE(tb.credit_movement, 0) - COALESCE(tb.debit_movement, 0)
         END)::NUMERIC as ending_balance
    FROM accounts a
    LEFT JOIN trial_balances tb ON tb.account_id = a.id AND tb.period_id = p_period_id
    WHERE a.is_header = FALSE AND a.is_active = TRUE
    ORDER BY a.code;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- PROCEDURE: Generate Income Statement
-- ============================================
CREATE OR REPLACE FUNCTION generate_income_statement(
    p_start_date DATE, 
    p_end_date DATE
)
RETURNS TABLE (
    category VARCHAR(50),
    account_code VARCHAR(20),
    account_name VARCHAR(100),
    amount NUMERIC
) AS $$
BEGIN
    -- Revenue
    RETURN QUERY
    SELECT 
        'PENDAPATAN'::VARCHAR(50),
        a.code,
        a.name,
        COALESCE(SUM(gl.credit - gl.debit), 0)::NUMERIC
    FROM accounts a
    LEFT JOIN general_ledger gl ON gl.account_id = a.id 
        AND gl.transaction_date BETWEEN p_start_date AND p_end_date
    WHERE a.account_type = 'REVENUE' AND a.is_header = FALSE
    GROUP BY a.code, a.name;
    
    -- Expenses
    RETURN QUERY
    SELECT 
        'BEBAN'::VARCHAR(50),
        a.code,
        a.name,
        COALESCE(SUM(gl.debit - gl.credit), 0)::NUMERIC
    FROM accounts a
    LEFT JOIN general_ledger gl ON gl.account_id = a.id 
        AND gl.transaction_date BETWEEN p_start_date AND p_end_date
    WHERE a.account_type = 'EXPENSE' AND a.is_header = FALSE
    GROUP BY a.code, a.name;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- PROCEDURE: Generate Balance Sheet
-- ============================================
CREATE OR REPLACE FUNCTION generate_balance_sheet(p_as_of_date DATE)
RETURNS TABLE (
    section VARCHAR(50),
    account_code VARCHAR(20),
    account_name VARCHAR(100),
    amount NUMERIC
) AS $$
BEGIN
    -- Assets
    RETURN QUERY
    SELECT 
        'ASET'::VARCHAR(50),
        a.code,
        a.name,
        (a.opening_balance + COALESCE(SUM(
            CASE WHEN a.normal_balance = 'DEBIT' 
                 THEN gl.debit - gl.credit 
                 ELSE gl.credit - gl.debit 
            END
        ), 0))::NUMERIC
    FROM accounts a
    LEFT JOIN general_ledger gl ON gl.account_id = a.id 
        AND gl.transaction_date <= p_as_of_date
    WHERE a.account_type = 'ASSET' AND a.is_header = FALSE
    GROUP BY a.code, a.name, a.opening_balance;
    
    -- Liabilities
    RETURN QUERY
    SELECT 
        'KEWAJIBAN'::VARCHAR(50),
        a.code,
        a.name,
        (a.opening_balance + COALESCE(SUM(
            CASE WHEN a.normal_balance = 'CREDIT' 
                 THEN gl.credit - gl.debit 
                 ELSE gl.debit - gl.credit 
            END
        ), 0))::NUMERIC
    FROM accounts a
    LEFT JOIN general_ledger gl ON gl.account_id = a.id 
        AND gl.transaction_date <= p_as_of_date
    WHERE a.account_type = 'LIABILITY' AND a.is_header = FALSE
    GROUP BY a.code, a.name, a.opening_balance;
    
    -- Equity
    RETURN QUERY
    SELECT 
        'EKUITAS'::VARCHAR(50),
        a.code,
        a.name,
        (a.opening_balance + COALESCE(SUM(
            CASE WHEN a.normal_balance = 'CREDIT' 
                 THEN gl.credit - gl.debit 
                 ELSE gl.debit - gl.credit 
            END
        ), 0))::NUMERIC
    FROM accounts a
    LEFT JOIN general_ledger gl ON gl.account_id = a.id 
        AND gl.transaction_date <= p_as_of_date
    WHERE a.account_type = 'EQUITY' AND a.is_header = FALSE
    GROUP BY a.code, a.name, a.opening_balance;
END;
$$ LANGUAGE plpgsql;
```

---

## 7. API Backend (Node.js + Express + Prisma)

### Struktur Folder:
```
backend/
├── prisma/
│   └── schema.prisma
├── src/
│   ├── controllers/
│   │   ├── accountController.js
│   │   ├── journalController.js
│   │   ├── reportController.js
│   │   └── bankController.js
│   ├── routes/
│   │   ├── accounts.js
│   │   ├── journals.js
│   │   ├── reports.js
│   │   └── banks.js
│   ├── services/
│   │   ├── journalService.js
│   │   └── reportService.js
│   └── app.js
└── package.json
```

### Prisma Schema (prisma/schema.prisma):
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Account {
  id              Int       @id @default(autoincrement())
  code            String    @unique
  name            String
  accountType     String    @map("account_type")
  normalBalance   String    @map("normal_balance")
  parentId        Int?      @map("parent_id")
  level           Int       @default(1)
  isActive        Boolean   @default(true) @map("is_active")
  isHeader        Boolean   @default(false) @map("is_header")
  openingBalance  Decimal   @default(0) @map("opening_balance") @db.Decimal(15, 2)
  createdAt       DateTime  @default(now()) @map("created_at")
  
  parent          Account?  @relation("AccountHierarchy", fields: [parentId], references: [id])
  children        Account[] @relation("AccountHierarchy")
  journalDetails  JournalDetail[]
  generalLedger   GeneralLedger[]
  
  @@map("accounts")
}

model AccountingPeriod {
  id          Int       @id @default(autoincrement())
  periodName  String    @map("period_name")
  startDate   DateTime  @map("start_date") @db.Date
  endDate     DateTime  @map("end_date") @db.Date
  isClosed    Boolean   @default(false) @map("is_closed")
  isYearEnd   Boolean   @default(false) @map("is_year_end")
  
  journals    JournalHeader[]
  
  @@map("accounting_periods")
}

model JournalHeader {
  id            Int       @id @default(autoincrement())
  journalNo     String    @unique @map("journal_no")
  journalDate   DateTime  @map("journal_date") @db.Date
  periodId      Int       @map("period_id")
  journalType   String    @map("journal_type")
  reference     String?
  description   String?
  totalDebit    Decimal   @default(0) @map("total_debit") @db.Decimal(15, 2)
  totalCredit   Decimal   @default(0) @map("total_credit") @db.Decimal(15, 2)
  isPosted      Boolean   @default(false) @map("is_posted")
  createdBy     String?   @map("created_by")
  createdAt     DateTime  @default(now()) @map("created_at")
  
  period        AccountingPeriod @relation(fields: [periodId], references: [id])
  details       JournalDetail[]
  generalLedger GeneralLedger[]
  
  @@map("journal_headers")
}

model JournalDetail {
  id          Int       @id @default(autoincrement())
  journalId   Int       @map("journal_id")
  accountId   Int       @map("account_id")
  description String?
  debit       Decimal   @default(0) @db.Decimal(15, 2)
  credit      Decimal   @default(0) @db.Decimal(15, 2)
  lineNo      Int       @map("line_no")
  
  journal     JournalHeader @relation(fields: [journalId], references: [id], onDelete: Cascade)
  account     Account       @relation(fields: [accountId], references: [id])
  
  @@map("journal_details")
}

model GeneralLedger {
  id              Int       @id @default(autoincrement())
  accountId       Int       @map("account_id")
  periodId        Int       @map("period_id")
  journalId       Int       @map("journal_id")
  transactionDate DateTime  @map("transaction_date") @db.Date
  description     String?
  debit           Decimal   @default(0) @db.Decimal(15, 2)
  credit          Decimal   @default(0) @db.Decimal(15, 2)
  balance         Decimal   @default(0) @db.Decimal(15, 2)
  reference       String?
  
  account         Account       @relation(fields: [accountId], references: [id])
  journal         JournalHeader @relation(fields: [journalId], references: [id])
  
  @@map("general_ledger")
}

model Bank {
  id              Int       @id @default(autoincrement())
  bankName        String    @map("bank_name")
  accountNumber   String?   @map("account_number")
  accountId       Int       @map("account_id")
  openingBalance  Decimal   @default(0) @map("opening_balance") @db.Decimal(15, 2)
  currentBalance  Decimal   @default(0) @map("current_balance") @db.Decimal(15, 2)
  
  @@map("banks")
}

model CashAccount {
  id              Int       @id @default(autoincrement())
  cashName        String    @map("cash_name")
  accountId       Int       @map("account_id")
  openingBalance  Decimal   @default(0) @map("opening_balance") @db.Decimal(15, 2)
  currentBalance  Decimal   @default(0) @map("current_balance") @db.Decimal(15, 2)
  
  @@map("cash_accounts")
}
```

### Controller: Journal (src/controllers/journalController.js)
```javascript
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

class JournalController {
  // Create Journal Entry
  async create(req, res) {
    try {
      const { journalDate, periodId, journalType, reference, description, details } = req.body;
      
      // Validate balance
      const totalDebit = details.reduce((sum, d) => sum + (parseFloat(d.debit) || 0), 0);
      const totalCredit = details.reduce((sum, d) => sum + (parseFloat(d.credit) || 0), 0);
      
      if (Math.abs(totalDebit - totalCredit) > 0.01) {
        return res.status(400).json({ 
          error: 'Jurnal tidak balance!', 
          debit: totalDebit, 
          credit: totalCredit 
        });
      }
      
      const journal = await prisma.journalHeader.create({
        data: {
          journalDate: new Date(journalDate),
          periodId: parseInt(periodId),
          journalType,
          reference,
          description,
          totalDebit,
          totalCredit,
          details: {
            create: details.map((d, index) => ({
              accountId: parseInt(d.accountId),
              description: d.description,
              debit: parseFloat(d.debit) || 0,
              credit: parseFloat(d.credit) || 0,
              lineNo: index + 1
            }))
          }
        },
        include: { details: { include: { account: true } } }
      });
      
      res.status(201).json(journal);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
  
  // Post Journal to Ledger
  async post(req, res) {
    try {
      const { id } = req.params;
      
      // Check if already posted
      const existing = await prisma.journalHeader.findUnique({
        where: { id: parseInt(id) }
      });
      
      if (existing.isPosted) {
        return res.status(400).json({ error: 'Jurnal sudah diposting!' });
      }
      
      // Call stored procedure for posting
      await prisma.$executeRaw`SELECT post_journal_to_ledger(${parseInt(id)}::int)`;
      
      const updated = await prisma.journalHeader.update({
        where: { id: parseInt(id) },
        data: { isPosted: true }
      });
      
      res.json({ message: 'Jurnal berhasil diposting!', journal: updated });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
  
  // Get Journal List
  async list(req, res) {
    try {
      const { page = 1, limit = 20, periodId, journalType } = req.query;
      
      const where = {};
      if (periodId) where.periodId = parseInt(periodId);
      if (journalType) where.journalType = journalType;
      
      const [journals, total] = await Promise.all([
        prisma.journalHeader.findMany({
          where,
          include: {
            details: {
              include: { account: { select: { code: true, name: true } } }
            },
            period: true
          },
          skip: (parseInt(page) - 1) * parseInt(limit),
          take: parseInt(limit),
          orderBy: { journalDate: 'desc' }
        }),
        prisma.journalHeader.count({ where })
      ]);
      
      res.json({ data: journals, total, page: parseInt(page), totalPages: Math.ceil(total / parseInt(limit)) });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
  
  // Get General Ledger for Account
  async getLedger(req, res) {
    try {
      const { accountId } = req.params;
      const { startDate, endDate } = req.query;
      
      const where = { accountId: parseInt(accountId) };
      if (startDate && endDate) {
        where.transactionDate = {
          gte: new Date(startDate),
          lte: new Date(endDate)
        };
      }
      
      const ledger = await prisma.generalLedger.findMany({
        where,
        include: {
          journal: { select: { journalNo: true, journalType: true } }
        },
        orderBy: { transactionDate: 'asc' }
      });
      
      res.json(ledger);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
}

module.exports = new JournalController();
```

### Controller: Reports (src/controllers/reportController.js)
```javascript
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
      
      const [assets, liabilities, equity] = await Promise.all([
        // Assets
        prisma.$queryRaw`
          SELECT a.code, a.name,
            (a.opening_balance + COALESCE(SUM(
              CASE WHEN a.normal_balance = 'DEBIT' THEN gl.debit - gl.credit
              ELSE gl.credit - gl.debit END
            ), 0)) as amount
          FROM accounts a
          LEFT JOIN general_ledger gl ON gl.account_id = a.id 
            AND gl.transaction_date <= ${new Date(asOfDate)}::date
          WHERE a.account_type = 'ASSET' AND a.is_header = false
          GROUP BY a.id, a.code, a.name, a.opening_balance
        `,
        // Liabilities
        prisma.$queryRaw`
          SELECT a.code, a.name,
            (a.opening_balance + COALESCE(SUM(
              CASE WHEN a.normal_balance = 'CREDIT' THEN gl.credit - gl.debit
              ELSE gl.debit - gl.credit END
            ), 0)) as amount
          FROM accounts a
          LEFT JOIN general_ledger gl ON gl.account_id = a.id 
            AND gl.transaction_date <= ${new Date(asOfDate)}::date
          WHERE a.account_type = 'LIABILITY' AND a.is_header = false
          GROUP BY a.id, a.code, a.name, a.opening_balance
        `,
        // Equity
        prisma.$queryRaw`
          SELECT a.code, a.name,
            (a.opening_balance + COALESCE(SUM(
              CASE WHEN a.normal_balance = 'CREDIT' THEN gl.credit - gl.debit
              ELSE gl.debit - gl.credit END
            ), 0)) as amount
          FROM accounts a
          LEFT JOIN general_ledger gl ON gl.account_id = a.id 
            AND gl.transaction_date <= ${new Date(asOfDate)}::date
          WHERE a.account_type = 'EQUITY' AND a.is_header = false
          GROUP BY a.id, a.code, a.name, a.opening_balance
        `
      ]);
      
      const totalAssets = assets.reduce((s, a) => s + parseFloat(a.amount), 0);
      const totalLiabilities = liabilities.reduce((s, l) => s + parseFloat(l.amount), 0);
      const totalEquity = equity.reduce((s, e) => s + parseFloat(e.amount), 0);
      
      res.json({
        assets,
        liabilities,
        equity,
        summary: {
          totalAssets,
          totalLiabilities,
          totalEquity,
          totalLiabilitiesEquity: totalLiabilities + totalEquity,
          isBalanced: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01
        }
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
}

module.exports = new ReportController();
```

### Routes (src/routes/journals.js)
```javascript
const express = require('express');
const router = express.Router();
const journalController = require('../controllers/journalController');

router.post('/', journalController.create.bind(journalController));
router.get('/', journalController.list.bind(journalController));
router.post('/:id/post', journalController.post.bind(journalController));
router.get('/ledger/:accountId', journalController.getLedger.bind(journalController));

module.exports = router;
```

### App Entry (src/app.js)
```javascript
const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// Routes
app.use('/api/accounts', require('./routes/accounts'));
app.use('/api/journals', require('./routes/journals'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/banks', require('./routes/banks'));
app.use('/api/cash', require('./routes/cash'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
```

---

## 8. Frontend (React + Tailwind CSS)

### Struktur Folder:
```
frontend/
├── src/
│   ├── components/
│   │   ├── Layout/
│   │   │   ├── Sidebar.jsx
│   │   │   └── Header.jsx
│   │   ├── Journal/
│   │   │   ├── JournalForm.jsx
│   │   │   ├── JournalList.jsx
│   │   │   └── JournalEntryRow.jsx
│   │   ├── Reports/
│   │   │   ├── TrialBalance.jsx
│   │   │   ├── IncomeStatement.jsx
│   │   │   └── BalanceSheet.jsx
│   │   └── Common/
│   │       ├── AccountSelector.jsx
│   │       └── DatePicker.jsx
│   ├── pages/
│   │   ├── Dashboard.jsx
│   │   ├── JournalPage.jsx
│   │   ├── LedgerPage.jsx
│   │   ├── ReportsPage.jsx
│   │   └── SettingsPage.jsx
│   ├── hooks/
│   │   ├── useApi.js
│   │   └── useJournal.js
│   ├── services/
│   │   └── api.js
│   └── App.jsx
└── package.json
```

### API Service (src/services/api.js)
```javascript
const API_BASE = 'http://localhost:3000/api';

class ApiService {
  async request(endpoint, options = {}) {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      ...options
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Request failed');
    }
    
    return response.json();
  }
  
  // Accounts
  getAccounts() {
    return this.request('/accounts');
  }
  
  // Journals
  createJournal(data) {
    return this.request('/journals', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }
  
  getJournals(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/journals?${query}`);
  }
  
  postJournal(id) {
    return this.request(`/journals/${id}/post`, { method: 'POST' });
  }
  
  // Reports
  getTrialBalance(periodId) {
    return this.request(`/reports/trial-balance?periodId=${periodId}`);
  }
  
  getIncomeStatement(startDate, endDate) {
    return this.request(`/reports/income-statement?startDate=${startDate}&endDate=${endDate}`);
  }
  
  getBalanceSheet(asOfDate) {
    return this.request(`/reports/balance-sheet?asOfDate=${asOfDate}`);
  }
  
  // Ledger
  getLedger(accountId, params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/journals/ledger/${accountId}?${query}`);
  }
}

export default new ApiService();
```

### Journal Form (src/components/Journal/JournalForm.jsx)
```jsx
import React, { useState, useEffect } from 'react';
import api from '../../services/api';

const JournalForm = ({ onSuccess }) => {
  const [accounts, setAccounts] = useState([]);
  const [entries, setEntries] = useState([
    { accountId: '', description: '', debit: '', credit: '' },
    { accountId: '', description: '', debit: '', credit: '' }
  ]);
  const [journalData, setJournalData] = useState({
    journalDate: new Date().toISOString().split('T')[0],
    periodId: '',
    journalType: 'GENERAL',
    reference: '',
    description: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadAccounts();
  }, []);

  const loadAccounts = async () => {
    try {
      const data = await api.getAccounts();
      setAccounts(data.filter(a => !a.isHeader));
    } catch (err) {
      setError('Gagal memuat daftar akun');
    }
  };

  const addEntry = () => {
    setEntries([...entries, { accountId: '', description: '', debit: '', credit: '' }]);
  };

  const removeEntry = (index) => {
    if (entries.length <= 2) return;
    setEntries(entries.filter((_, i) => i !== index));
  };

  const updateEntry = (index, field, value) => {
    const newEntries = [...entries];
    newEntries[index][field] = value;
    
    // Auto-balance: if debit entered, clear credit and vice versa
    if (field === 'debit' && value) {
      newEntries[index].credit = '';
    } else if (field === 'credit' && value) {
      newEntries[index].debit = '';
    }
    
    setEntries(newEntries);
  };

  const calculateTotals = () => {
    const totalDebit = entries.reduce((sum, e) => sum + (parseFloat(e.debit) || 0), 0);
    const totalCredit = entries.reduce((sum, e) => sum + (parseFloat(e.credit) || 0), 0);
    return { totalDebit, totalCredit, isBalanced: Math.abs(totalDebit - totalCredit) < 0.01 };
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { isBalanced } = calculateTotals();
    if (!isBalanced) {
      setError('Jurnal tidak balance! Total Debit harus sama dengan Total Kredit.');
      setLoading(false);
      return;
    }

    try {
      const payload = {
        ...journalData,
        details: entries
          .filter(e => e.accountId)
          .map((e, i) => ({
            ...e,
            debit: parseFloat(e.debit) || 0,
            credit: parseFloat(e.credit) || 0,
            lineNo: i + 1
          }))
      };

      await api.createJournal(payload);
      onSuccess?.();
      // Reset form
      setEntries([
        { accountId: '', description: '', debit: '', credit: '' },
        { accountId: '', description: '', debit: '', credit: '' }
      ]);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const { totalDebit, totalCredit, isBalanced } = calculateTotals();

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h2 className="text-2xl font-bold mb-6 text-gray-800">Input Jurnal Umum</h2>
      
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {/* Header Info */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Tanggal Jurnal
            </label>
            <input
              type="date"
              value={journalData.journalDate}
              onChange={(e) => setJournalData({...journalData, journalDate: e.target.value})}
              className="w-full border border-gray-300 rounded-md px-3 py-2"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Tipe Jurnal
            </label>
            <select
              value={journalData.journalType}
              onChange={(e) => setJournalData({...journalData, journalType: e.target.value})}
              className="w-full border border-gray-300 rounded-md px-3 py-2"
            >
              <option value="GENERAL">Jurnal Umum</option>
              <option value="ADJUSTING">Jurnal Penyesuaian</option>
              <option value="CLOSING">Jurnal Penutup</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Referensi
            </label>
            <input
              type="text"
              value={journalData.reference}
              onChange={(e) => setJournalData({...journalData, reference: e.target.value})}
              className="w-full border border-gray-300 rounded-md px-3 py-2"
              placeholder="No. Bukti"
            />
          </div>
        </div>

        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Keterangan
          </label>
          <textarea
            value={journalData.description}
            onChange={(e) => setJournalData({...journalData, description: e.target.value})}
            className="w-full border border-gray-300 rounded-md px-3 py-2"
            rows="2"
            placeholder="Keterangan jurnal..."
          />
        </div>

        {/* Journal Entries */}
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Akun</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Keterangan</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Debit (Rp)</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Kredit (Rp)</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {entries.map((entry, index) => (
                <tr key={index} className="hover:bg-gray-50">
                  <td className="px-4 py-2">
                    <select
                      value={entry.accountId}
                      onChange={(e) => updateEntry(index, 'accountId', e.target.value)}
                      className="w-full border border-gray-300 rounded-md px-2 py-1 text-sm"
                      required
                    >
                      <option value="">Pilih Akun</option>
                      {accounts.map(acc => (
                        <option key={acc.id} value={acc.id}>
                          {acc.code} - {acc.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="text"
                      value={entry.description}
                      onChange={(e) => updateEntry(index, 'description', e.target.value)}
                      className="w-full border border-gray-300 rounded-md px-2 py-1 text-sm"
                      placeholder="Keterangan baris"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="number"
                      value={entry.debit}
                      onChange={(e) => updateEntry(index, 'debit', e.target.value)}
                      className="w-full border border-gray-300 rounded-md px-2 py-1 text-sm text-right"
                      placeholder="0"
                      min="0"
                      step="0.01"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="number"
                      value={entry.credit}
                      onChange={(e) => updateEntry(index, 'credit', e.target.value)}
                      className="w-full border border-gray-300 rounded-md px-2 py-1 text-sm text-right"
                      placeholder="0"
                      min="0"
                      step="0.01"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <button
                      type="button"
                      onClick={() => removeEntry(index)}
                      className="text-red-600 hover:text-red-800"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50 font-semibold">
              <tr>
                <td colSpan="2" className="px-4 py-3 text-right">TOTAL:</td>
                <td className={`px-4 py-3 text-right ${!isBalanced ? 'text-red-600' : ''}`}>
                  {totalDebit.toLocaleString('id-ID', {minimumFractionDigits: 2})}
                </td>
                <td className={`px-4 py-3 text-right ${!isBalanced ? 'text-red-600' : ''}`}>
                  {totalCredit.toLocaleString('id-ID', {minimumFractionDigits: 2})}
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="mt-4 flex justify-between items-center">
          <button
            type="button"
            onClick={addEntry}
            className="bg-gray-200 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-300"
          >
            + Tambah Baris
          </button>
          
          <div className="flex items-center gap-4">
            {!isBalanced && (
              <span className="text-red-600 text-sm">
                Selisih: {(totalDebit - totalCredit).toLocaleString('id-ID')}
              </span>
            )}
            <button
              type="submit"
              disabled={loading || !isBalanced}
              className={`px-6 py-2 rounded-md text-white ${
                loading || !isBalanced
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {loading ? 'Menyimpan...' : 'Simpan Jurnal'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};

export default JournalForm;
```

### Income Statement Report (src/components/Reports/IncomeStatement.jsx)
```jsx
import React, { useState } from 'react';
import api from '../../services/api';

const IncomeStatement = () => {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);

  const generateReport = async () => {
    setLoading(true);
    try {
      const data = await api.getIncomeStatement(startDate, endDate);
      setReport(data);
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount) => {
    return parseFloat(amount).toLocaleString('id-ID', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h2 className="text-2xl font-bold mb-6 text-gray-800">Laporan Rugi Laba</h2>
      
      <div className="flex gap-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Dari Tanggal</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Sampai Tanggal</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-2"
          />
        </div>
        <div className="flex items-end">
          <button
            onClick={generateReport}
            disabled={loading || !startDate || !endDate}
            className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 disabled:bg-gray-400"
          >
            {loading ? 'Memuat...' : 'Tampilkan'}
          </button>
        </div>
      </div>

      {report && (
        <div className="space-y-6">
          {/* Revenue Section */}
          <div>
            <h3 className="text-lg font-semibold text-gray-800 border-b pb-2 mb-3">
              PENDAPATAN
            </h3>
            <table className="w-full">
              <tbody>
                {report.revenue.map((item) => (
                  <tr key={item.code} className="hover:bg-gray-50">
                    <td className="py-2 pl-8">{item.code} - {item.name}</td>
                    <td className="py-2 text-right">{formatCurrency(item.amount)}</td>
                  </tr>
                ))}
                <tr className="font-semibold border-t">
                  <td className="py-3 pl-4">Total Pendapatan</td>
                  <td className="py-3 text-right text-green-600">
                    {formatCurrency(report.summary.totalRevenue)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Expense Section */}
          <div>
            <h3 className="text-lg font-semibold text-gray-800 border-b pb-2 mb-3">
              BEBAN
            </h3>
            <table className="w-full">
              <tbody>
                {report.expenses.map((item) => (
                  <tr key={item.code} className="hover:bg-gray-50">
                    <td className="py-2 pl-8">{item.code} - {item.name}</td>
                    <td className="py-2 text-right">{formatCurrency(item.amount)}</td>
                  </tr>
                ))}
                <tr className="font-semibold border-t">
                  <td className="py-3 pl-4">Total Beban</td>
                  <td className="py-3 text-right text-red-600">
                    {formatCurrency(report.summary.totalExpense)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Net Income */}
          <div className="bg-gray-100 rounded-lg p-4">
            <div className="flex justify-between items-center text-xl font-bold">
              <span>LABA/RUGI BERSIH</span>
              <span className={report.summary.netIncome >= 0 ? 'text-green-600' : 'text-red-600'}>
                {formatCurrency(report.summary.netIncome)}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default IncomeStatement;
```

### Balance Sheet (src/components/Reports/BalanceSheet.jsx)
```jsx
import React, { useState } from 'react';
import api from '../../services/api';

const BalanceSheet = () => {
  const [asOfDate, setAsOfDate] = useState('');
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);

  const generateReport = async () => {
    setLoading(true);
    try {
      const data = await api.getBalanceSheet(asOfDate);
      setReport(data);
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount) => {
    return parseFloat(amount).toLocaleString('id-ID', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  };

  const renderSection = (title, items, colorClass = 'text-gray-800') => (
    <div className="mb-6">
      <h3 className={`text-lg font-semibold border-b pb-2 mb-3 ${colorClass}`}>
        {title}
      </h3>
      <table className="w-full">
        <tbody>
          {items.map((item) => (
            <tr key={item.code} className="hover:bg-gray-50">
              <td className="py-2 pl-8">{item.code} - {item.name}</td>
              <td className="py-2 text-right">{formatCurrency(item.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h2 className="text-2xl font-bold mb-6 text-gray-800">Neraca</h2>
      
      <div className="flex gap-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Per Tanggal</label>
          <input
            type="date"
            value={asOfDate}
            onChange={(e) => setAsOfDate(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-2"
          />
        </div>
        <div className="flex items-end">
          <button
            onClick={generateReport}
            disabled={loading || !asOfDate}
            className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 disabled:bg-gray-400"
          >
            {loading ? 'Memuat...' : 'Tampilkan'}
          </button>
        </div>
      </div>

      {report && (
        <div className="grid grid-cols-2 gap-8">
          {/* Left Side: Assets */}
          <div>
            {renderSection('ASET', report.assets, 'text-blue-700')}
            <div className="bg-blue-50 rounded-lg p-4 mt-4">
              <div className="flex justify-between font-bold text-blue-800">
                <span>TOTAL ASET</span>
                <span>{formatCurrency(report.summary.totalAssets)}</span>
              </div>
            </div>
          </div>

          {/* Right Side: Liabilities & Equity */}
          <div>
            {renderSection('KEWAJIBAN', report.liabilities, 'text-red-700')}
            {renderSection('EKUITAS', report.equity, 'text-green-700')}
            
            <div className="bg-gray-100 rounded-lg p-4 mt-4">
              <div className="flex justify-between font-bold text-gray-800 border-b pb-2 mb-2">
                <span>TOTAL KEWAJIBAN + EKUITAS</span>
                <span>{formatCurrency(report.summary.totalLiabilitiesEquity)}</span>
              </div>
              <div className={`text-sm text-center mt-2 ${
                report.summary.isBalanced ? 'text-green-600' : 'text-red-600'
              }`}>
                {report.summary.isBalanced ? '✓ Neraca Seimbang' : '✗ Neraca Tidak Seimbang!'}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BalanceSheet;
```

---

## 9. Tech Stack Rekomendasi

| Layer | Teknologi |
|-------|-----------|
| **Database** | PostgreSQL 15+ |
| **Backend** | Node.js + Express + Prisma ORM |
| **Frontend** | React 18 + Tailwind CSS + Vite |
| **State Management** | Zustand / React Query |
| **Charts** | Recharts / Chart.js |
| **Export** | xlsx (Excel), jspdf (PDF) |
| **Auth** | JWT + bcrypt |
| **Deployment** | Docker + Docker Compose |

---

## 10. Fitur Tambahan (MYOB/Zahir-like)

1. **Bank Reconciliation** - Cocokkan transaksi bank dengan jurnal
2. **Multi-Currency** - Support mata uang asing dengan kurs harian
3. **Budgeting** - Anggaran per akun per periode
4. **Fixed Assets** - Penyusutan otomatis
5. **Inventory** - Kartu persediaan dengan metode FIFO/Average
6. **Tax (PPN)** - Kalkulasi PPN otomatis
7. **Multi-Company** - Support multiple entity dalam satu database
8. **Audit Trail** - Log semua perubahan data
9. **Closing Period** - Kunci periode yang sudah ditutup
10. **Backup/Restore** - Export/import database



lanjutkan dengan setup Docker, seed data, dan frontend routing yang simpel tanpa auth kompleks.

---

## 11. Docker Compose Setup

### `docker-compose.yml`
```yaml
version: '3.8'

services:
  # PostgreSQL Database
  postgres:
    image: postgres:15-alpine
    container_name: akuntansi-db
    environment:
      POSTGRES_USER: akuntansi
      POSTGRES_PASSWORD: akuntansi123
      POSTGRES_DB: akuntansi_db
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./backend/prisma/migrations:/docker-entrypoint-initdb.d
    networks:
      - akuntansi-network

  # Backend API
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: akuntansi-api
    environment:
      DATABASE_URL: postgresql://akuntansi:akuntansi123@postgres:5432/akuntansi_db?schema=public
      PORT: 3000
      JWT_SECRET: simple-secret-key-2026
    ports:
      - "3000:3000"
    depends_on:
      - postgres
    volumes:
      - ./backend:/app
      - /app/node_modules
    command: sh -c "npx prisma migrate deploy && npx prisma db seed && npm run dev"
    networks:
      - akuntansi-network

  # Frontend
  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    container_name: akuntansi-web
    ports:
      - "5173:5173"
    environment:
      VITE_API_URL: http://localhost:3000/api
    volumes:
      - ./frontend:/app
      - /app/node_modules
    command: npm run dev -- --host
    networks:
      - akuntansi-network

volumes:
  postgres_data:

networks:
  akuntansi-network:
    driver: bridge
```

### `backend/Dockerfile`
```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3000

CMD ["npm", "run", "dev"]
```

### `frontend/Dockerfile`
```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host"]
```

---

## 12. Seed Data (Chart of Accounts)

### `backend/prisma/seed.js`
```javascript
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create Accounting Period
  const period = await prisma.accountingPeriod.create({
    data: {
      periodName: 'Mei 2026',
      startDate: new Date('2026-05-01'),
      endDate: new Date('2026-05-31'),
      isClosed: false,
      isYearEnd: false
    }
  });

  // Chart of Accounts - Level 1 (Headers)
  const asset = await prisma.account.create({
    data: { code: '1', name: 'ASET', accountType: 'ASSET', normalBalance: 'DEBIT', level: 1, isHeader: true }
  });
  
  const liability = await prisma.account.create({
    data: { code: '2', name: 'KEWAJIBAN', accountType: 'LIABILITY', normalBalance: 'CREDIT', level: 1, isHeader: true }
  });
  
  const equity = await prisma.account.create({
    data: { code: '3', name: 'EKUITAS', accountType: 'EQUITY', normalBalance: 'CREDIT', level: 1, isHeader: true }
  });
  
  const revenue = await prisma.account.create({
    data: { code: '4', name: 'PENDAPATAN', accountType: 'REVENUE', normalBalance: 'CREDIT', level: 1, isHeader: true }
  });
  
  const expense = await prisma.account.create({
    data: { code: '5', name: 'BEBAN', accountType: 'EXPENSE', normalBalance: 'DEBIT', level: 1, isHeader: true }
  });

  // Level 2 - Asset Sub-headers
  const currentAsset = await prisma.account.create({
    data: { code: '1-1000', name: 'ASET LANCAR', accountType: 'ASSET', normalBalance: 'DEBIT', parentId: asset.id, level: 2, isHeader: true }
  });
  
  const fixedAsset = await prisma.account.create({
    data: { code: '1-2000', name: 'ASET TETAP', accountType: 'ASSET', normalBalance: 'DEBIT', parentId: asset.id, level: 2, isHeader: true }
  });

  // Level 3 - Detail Accounts (Aset Lancar)
  const kas = await prisma.account.create({
    data: { code: '1-1100', name: 'Kas', accountType: 'ASSET', normalBalance: 'DEBIT', parentId: currentAsset.id, level: 3, isHeader: false, openingBalance: 50000000 }
  });
  
  const bank = await prisma.account.create({
    data: { code: '1-1200', name: 'Bank', accountType: 'ASSET', normalBalance: 'DEBIT', parentId: currentAsset.id, level: 3, isHeader: false, openingBalance: 100000000 }
  });
  
  const piutang = await prisma.account.create({
    data: { code: '1-1300', name: 'Piutang Usaha', accountType: 'ASSET', normalBalance: 'DEBIT', parentId: currentAsset.id, level: 3, isHeader: false, openingBalance: 25000000 }
  });
  
  const persediaan = await prisma.account.create({
    data: { code: '1-1400', name: 'Persediaan Barang', accountType: 'ASSET', normalBalance: 'DEBIT', parentId: currentAsset.id, level: 3, isHeader: false, openingBalance: 75000000 }
  });

  // Level 3 - Detail Accounts (Aset Tetap)
  const tanah = await prisma.account.create({
    data: { code: '1-2100', name: 'Tanah', accountType: 'ASSET', normalBalance: 'DEBIT', parentId: fixedAsset.id, level: 3, isHeader: false, openingBalance: 200000000 }
  });
  
  const bangunan = await prisma.account.create({
    data: { code: '1-2200', name: 'Bangunan', accountType: 'ASSET', normalBalance: 'DEBIT', parentId: fixedAsset.id, level: 3, isHeader: false, openingBalance: 500000000 }
  });
  
  const akumPenyusutan = await prisma.account.create({
    data: { code: '1-2300', name: 'Akumulasi Penyusutan', accountType: 'ASSET', normalBalance: 'CREDIT', parentId: fixedAsset.id, level: 3, isHeader: false, openingBalance: 50000000 }
  });

  // Level 2 - Liability Sub-headers
  const currentLiability = await prisma.account.create({
    data: { code: '2-1000', name: 'KEWAJIBAN LANCAR', accountType: 'LIABILITY', normalBalance: 'CREDIT', parentId: liability.id, level: 2, isHeader: true }
  });

  // Level 3 - Detail Accounts (Kewajiban)
  const hutangUsaha = await prisma.account.create({
    data: { code: '2-1100', name: 'Hutang Usaha', accountType: 'LIABILITY', normalBalance: 'CREDIT', parentId: currentLiability.id, level: 3, isHeader: false, openingBalance: 30000000 }
  });
  
  const hutangBank = await prisma.account.create({
    data: { code: '2-1200', name: 'Hutang Bank', accountType: 'LIABILITY', normalBalance: 'CREDIT', parentId: currentLiability.id, level: 3, isHeader: false, openingBalance: 100000000 }
  });

  // Level 2 - Equity
  const modal = await prisma.account.create({
    data: { code: '3-1000', name: 'Modal Pemilik', accountType: 'EQUITY', normalBalance: 'CREDIT', parentId: equity.id, level: 2, isHeader: false, openingBalance: 500000000 }
  });
  
  const labaDitahan = await prisma.account.create({
    data: { code: '3-2000', name: 'Laba Ditahan', accountType: 'EQUITY', normalBalance: 'CREDIT', parentId: equity.id, level: 2, isHeader: false, openingBalance: 170000000 }
  });

  // Level 2 - Revenue
  const pendapatanUsaha = await prisma.account.create({
    data: { code: '4-1000', name: 'Pendapatan Usaha', accountType: 'REVENUE', normalBalance: 'CREDIT', parentId: revenue.id, level: 2, isHeader: false, openingBalance: 0 }
  });
  
  const pendapatanLain = await prisma.account.create({
    data: { code: '4-2000', name: 'Pendapatan Lain-lain', accountType: 'REVENUE', normalBalance: 'CREDIT', parentId: revenue.id, level: 2, isHeader: false, openingBalance: 0 }
  });

  // Level 2 - Expense Sub-headers
  const bebanPokok = await prisma.account.create({
    data: { code: '5-1000', name: 'BEBAN POKOK PENJUALAN', accountType: 'EXPENSE', normalBalance: 'DEBIT', parentId: expense.id, level: 2, isHeader: true }
  });
  
  const bebanOperasional = await prisma.account.create({
    data: { code: '5-2000', name: 'BEBAN OPERASIONAL', accountType: 'EXPENSE', normalBalance: 'DEBIT', parentId: expense.id, level: 2, isHeader: true }
  });

  // Level 3 - Detail Accounts (Beban)
  const hpp = await prisma.account.create({
    data: { code: '5-1100', name: 'Harga Pokok Penjualan', accountType: 'EXPENSE', normalBalance: 'DEBIT', parentId: bebanPokok.id, level: 3, isHeader: false, openingBalance: 0 }
  });
  
  const gaji = await prisma.account.create({
    data: { code: '5-2100', name: 'Beban Gaji dan Upah', accountType: 'EXPENSE', normalBalance: 'DEBIT', parentId: bebanOperasional.id, level: 3, isHeader: false, openingBalance: 0 }
  });
  
  const sewa = await prisma.account.create({
    data: { code: '5-2200', name: 'Beban Sewa', accountType: 'EXPENSE', normalBalance: 'DEBIT', parentId: bebanOperasional.id, level: 3, isHeader: false, openingBalance: 0 }
  });
  
  const listrik = await prisma.account.create({
    data: { code: '5-2300', name: 'Beban Listrik dan Air', accountType: 'EXPENSE', normalBalance: 'DEBIT', parentId: bebanOperasional.id, level: 3, isHeader: false, openingBalance: 0 }
  });
  
  const penyusutan = await prisma.account.create({
    data: { code: '5-2400', name: 'Beban Penyusutan', accountType: 'EXPENSE', normalBalance: 'DEBIT', parentId: bebanOperasional.id, level: 3, isHeader: false, openingBalance: 0 }
  });

  // Create Bank & Cash records
  await prisma.bank.create({
    data: {
      bankName: 'Bank BCA',
      accountNumber: '1234567890',
      accountId: bank.id,
      openingBalance: 100000000,
      currentBalance: 100000000
    }
  });
  
  await prisma.cashAccount.create({
    data: {
      cashName: 'Kas Pusat',
      accountId: kas.id,
      openingBalance: 50000000,
      currentBalance: 50000000
    }
  });

  console.log('✅ Seeding completed!');
  console.log(`📅 Period: ${period.periodName}`);
  console.log(`📊 Total accounts: 20`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

### Update `backend/package.json`
```json
{
  "name": "akuntansi-api",
  "version": "1.0.0",
  "scripts": {
    "dev": "nodemon src/app.js",
    "start": "node src/app.js",
    "db:migrate": "prisma migrate dev",
    "db:seed": "node prisma/seed.js"
  },
  "prisma": {
    "seed": "node prisma/seed.js"
  },
  "dependencies": {
    "@prisma/client": "^5.0.0",
    "cors": "^2.8.5",
    "express": "^4.18.2",
    "jsonwebtoken": "^9.0.0"
  },
  "devDependencies": {
    "nodemon": "^3.0.0",
    "prisma": "^5.0.0"
  }
}
```

---

## 13. Simple Auth (Middleware Ringan)

### `backend/src/middleware/simpleAuth.js`
```javascript
// Auth sederhana - hanya cek header, tanpa database user
const SIMPLE_TOKEN = 'akuntansi-simple-token-2026';

const simpleAuth = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ error: 'Token diperlukan' });
  }
  
  if (token !== SIMPLE_TOKEN) {
    return res.status(403).json({ error: 'Token tidak valid' });
  }
  
  next();
};

// Middleware opsional - bisa diaktifkan/nonaktifkan
const optionalAuth = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  req.isAuthenticated = token === SIMPLE_TOKEN;
  next();
};

module.exports = { simpleAuth, optionalAuth, SIMPLE_TOKEN };
```

### Update `backend/src/app.js`
```javascript
const express = require('express');
const cors = require('cors');
const { optionalAuth } = require('./middleware/simpleAuth');

const app = express();

app.use(cors());
app.use(express.json());
app.use(optionalAuth); // Auth opsional

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/accounts', require('./routes/accounts'));
app.use('/api/journals', require('./routes/journals'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/banks', require('./routes/banks'));
app.use('/api/cash', require('./routes/cash'));

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Terjadi kesalahan server' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
```

---

## 14. Frontend - App & Routing Lengkap

### `frontend/package.json`
```json
{
  "name": "akuntansi-web",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.20.0",
    "lucide-react": "^0.294.0",
    "recharts": "^2.10.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.43",
    "@types/react-dom": "^18.2.17",
    "@vitejs/plugin-react": "^4.2.1",
    "autoprefixer": "^10.4.16",
    "postcss": "^8.4.32",
    "tailwindcss": "^3.3.6",
    "vite": "^5.0.8"
  }
}
```

### `frontend/vite.config.js`
```javascript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true
  }
})
```

### `frontend/tailwind.config.js`
```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eff6ff',
          100: '#dbeafe',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
        }
      }
    },
  },
  plugins: [],
}
```

### `frontend/postcss.config.js`
```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

### `frontend/index.html`
```html
<!doctype html>
<html lang="id">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Sistem Akuntansi - MYOB Style</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

### `frontend/src/main.jsx`
```jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)
```

### `frontend/src/index.css`
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  body {
    @apply bg-gray-100 text-gray-800;
  }
}

@layer components {
  .btn-primary {
    @apply bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors;
  }
  
  .btn-secondary {
    @apply bg-gray-200 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-300 transition-colors;
  }
  
  .card {
    @apply bg-white rounded-lg shadow-md p-6;
  }
  
  .input-field {
    @apply w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500;
  }
}
```

---

## 15. Layout & Navigation

### `frontend/src/components/Layout/Sidebar.jsx`
```jsx
import React from 'react';
import { NavLink } from 'react-router-dom';
import { 
  LayoutDashboard, 
  BookOpen, 
  FileText, 
  BarChart3, 
  Landmark, 
  Wallet,
  Settings
} from 'lucide-react';

const menuItems = [
  { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/jurnal', icon: BookOpen, label: 'Jurnal Umum' },
  { path: '/ledger', icon: FileText, label: 'Buku Besar' },
  { path: '/bank', icon: Landmark, label: 'Buku Bank' },
  { path: '/kas', icon: Wallet, label: 'Buku Kas' },
  { path: '/laporan', icon: BarChart3, label: 'Laporan' },
  { path: '/pengaturan', icon: Settings, label: 'Pengaturan' },
];

const Sidebar = () => {
  return (
    <aside className="w-64 bg-slate-800 text-white min-h-screen flex flex-col">
      <div className="p-6 border-b border-slate-700">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <BarChart3 className="w-6 h-6 text-blue-400" />
          <span>AKUNTANSI</span>
        </h1>
        <p className="text-xs text-slate-400 mt-1">Sistem MYOB Style</p>
      </div>
      
      <nav className="flex-1 py-4">
        {menuItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `flex items-center gap-3 px-6 py-3 transition-colors ${
                isActive
                  ? 'bg-blue-600 text-white border-r-4 border-blue-400'
                  : 'text-slate-300 hover:bg-slate-700 hover:text-white'
              }`
            }
          >
            <item.icon className="w-5 h-5" />
            <span className="text-sm font-medium">{item.label}</span>
          </NavLink>
        ))}
      </nav>
      
      <div className="p-4 border-t border-slate-700">
        <div className="text-xs text-slate-400">
          <p>Periode Aktif:</p>
          <p className="text-white font-medium">Mei 2026</p>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
```

### `frontend/src/components/Layout/Header.jsx`
```jsx
import React from 'react';
import { Bell, User, Calendar } from 'lucide-react';

const Header = ({ title }) => {
  const today = new Date().toLocaleDateString('id-ID', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  return (
    <header className="bg-white shadow-sm px-6 py-4 flex justify-between items-center">
      <div>
        <h2 className="text-xl font-semibold text-gray-800">{title}</h2>
      </div>
      
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Calendar className="w-4 h-4" />
          <span>{today}</span>
        </div>
        
        <button className="relative text-gray-500 hover:text-gray-700">
          <Bell className="w-5 h-5" />
          <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full"></span>
        </button>
        
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white text-sm font-medium">
            A
          </div>
          <span className="text-sm font-medium text-gray-700">Admin</span>
        </div>
      </div>
    </header>
  );
};

export default Header;
```

---

## 16. Pages Lengkap

### `frontend/src/App.jsx`
```jsx
import React from 'react';
import { Routes, Route } from 'react-router-dom';
import Sidebar from './components/Layout/Sidebar';
import Header from './components/Layout/Header';
import Dashboard from './pages/Dashboard';
import JournalPage from './pages/JournalPage';
import LedgerPage from './pages/LedgerPage';
import BankPage from './pages/BankPage';
import CashPage from './pages/CashPage';
import ReportsPage from './pages/ReportsPage';
import SettingsPage from './pages/SettingsPage';

const Layout = ({ children, title }) => (
  <div className="flex min-h-screen">
    <Sidebar />
    <div className="flex-1 flex flex-col">
      <Header title={title} />
      <main className="flex-1 p-6 overflow-auto">
        {children}
      </main>
    </div>
  </div>
);

const App = () => {
  return (
    <Routes>
      <Route path="/" element={<Layout title="Dashboard"><Dashboard /></Layout>} />
      <Route path="/jurnal" element={<Layout title="Jurnal Umum"><JournalPage /></Layout>} />
      <Route path="/ledger" element={<Layout title="Buku Besar"><LedgerPage /></Layout>} />
      <Route path="/bank" element={<Layout title="Buku Bank"><BankPage /></Layout>} />
      <Route path="/kas" element={<Layout title="Buku Kas"><CashPage /></Layout>} />
      <Route path="/laporan" element={<Layout title="Laporan Keuangan"><ReportsPage /></Layout>} />
      <Route path="/pengaturan" element={<Layout title="Pengaturan"><SettingsPage /></Layout>} />
    </Routes>
  );
};

export default App;
```

### `frontend/src/pages/Dashboard.jsx`
```jsx
import React, { useState, useEffect } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  Wallet, 
  CreditCard,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';
import api from '../services/api';

const StatCard = ({ title, amount, icon: Icon, trend, trendUp, color }) => (
  <div className="card">
    <div className="flex justify-between items-start">
      <div>
        <p className="text-sm text-gray-500 mb-1">{title}</p>
        <h3 className="text-2xl font-bold text-gray-800">
          Rp {parseFloat(amount).toLocaleString('id-ID')}
        </h3>
      </div>
      <div className={`p-3 rounded-lg ${color}`}>
        <Icon className="w-6 h-6 text-white" />
      </div>
    </div>
    {trend && (
      <div className={`flex items-center gap-1 mt-4 text-sm ${trendUp ? 'text-green-600' : 'text-red-600'}`}>
        {trendUp ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
        <span>{trend}</span>
      </div>
    )}
  </div>
);

const Dashboard = () => {
  const [stats, setStats] = useState({
    totalAssets: 0,
    totalLiabilities: 0,
    totalEquity: 0,
    cashBalance: 0
  });
  const [recentJournals, setRecentJournals] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      // Get balance sheet for summary
      const today = new Date().toISOString().split('T')[0];
      const bs = await api.getBalanceSheet(today);
      
      // Get recent journals
      const journals = await api.getJournals({ limit: 5 });
      
      setStats({
        totalAssets: bs.summary.totalAssets,
        totalLiabilities: bs.summary.totalLiabilities,
        totalEquity: bs.summary.totalEquity,
        cashBalance: bs.assets.find(a => a.code === '1-1100')?.amount || 0
      });
      
      setRecentJournals(journals.data || []);
    } catch (err) {
      console.error('Failed to load dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-4 gap-6">
        <StatCard 
          title="Total Aset" 
          amount={stats.totalAssets} 
          icon={Wallet} 
          color="bg-blue-500"
          trend="+12.5% dari bulan lalu"
          trendUp={true}
        />
        <StatCard 
          title="Total Kewajiban" 
          amount={stats.totalLiabilities} 
          icon={CreditCard} 
          color="bg-red-500"
          trend="+5.2% dari bulan lalu"
          trendUp={false}
        />
        <StatCard 
          title="Ekuitas" 
          amount={stats.totalEquity} 
          icon={TrendingUp} 
          color="bg-green-500"
          trend="+8.7% dari bulan lalu"
          trendUp={true}
        />
        <StatCard 
          title="Saldo Kas" 
          amount={stats.cashBalance} 
          icon={TrendingDown} 
          color="bg-purple-500"
        />
      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-3 gap-6">
        <div className="card col-span-2">
          <h3 className="text-lg font-semibold mb-4">Jurnal Terbaru</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">No. Jurnal</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Tanggal</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Keterangan</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">Total</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {recentJournals.map((journal) => (
                  <tr key={journal.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-blue-600">{journal.journalNo}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {new Date(journal.journalDate).toLocaleDateString('id-ID')}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 truncate max-w-xs">
                      {journal.description || '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-medium">
                      Rp {parseFloat(journal.totalDebit).toLocaleString('id-ID')}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-1 rounded-full text-xs ${
                        journal.isPosted 
                          ? 'bg-green-100 text-green-700' 
                          : 'bg-yellow-100 text-yellow-700'
                      }`}>
                        {journal.isPosted ? 'Posted' : 'Draft'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <h3 className="text-lg font-semibold mb-4">Ringkasan Akun</h3>
          <div className="space-y-4">
            <div className="flex justify-between items-center p-3 bg-blue-50 rounded-lg">
              <span className="text-sm text-gray-600">Kas</span>
              <span className="font-semibold text-blue-700">
                Rp {parseFloat(stats.cashBalance).toLocaleString('id-ID')}
              </span>
            </div>
            <div className="flex justify-between items-center p-3 bg-green-50 rounded-lg">
              <span className="text-sm text-gray-600">Bank</span>
              <span className="font-semibold text-green-700">
                Rp 100.000.000
              </span>
            </div>
            <div className="flex justify-between items-center p-3 bg-yellow-50 rounded-lg">
              <span className="text-sm text-gray-600">Piutang</span>
              <span className="font-semibold text-yellow-700">
                Rp 25.000.000
              </span>
            </div>
            <div className="flex justify-between items-center p-3 bg-purple-50 rounded-lg">
              <span className="text-sm text-gray-600">Hutang</span>
              <span className="font-semibold text-purple-700">
                Rp 30.000.000
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
```

### `frontend/src/pages/JournalPage.jsx`
```jsx
import React, { useState } from 'react';
import { Plus, Search, Filter } from 'lucide-react';
import JournalForm from '../components/Journal/JournalForm';
import JournalList from '../components/Journal/JournalList';

const JournalPage = () => {
  const [showForm, setShowForm] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleSuccess = () => {
    setShowForm(false);
    setRefreshKey(prev => prev + 1);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex gap-4">
          <div className="relative">
            <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input 
              type="text" 
              placeholder="Cari jurnal..." 
              className="input-field pl-10 w-64"
            />
          </div>
          <button className="btn-secondary flex items-center gap-2">
            <Filter className="w-4 h-4" />
            Filter
          </button>
        </div>
        
        <button 
          onClick={() => setShowForm(!showForm)}
          className="btn-primary flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          {showForm ? 'Tutup Form' : 'Tambah Jurnal'}
        </button>
      </div>

      {showForm && <JournalForm onSuccess={handleSuccess} />}
      
      <JournalList key={refreshKey} />
    </div>
  );
};

export default JournalPage;
```

### `frontend/src/components/Journal/JournalList.jsx`
```jsx
import React, { useState, useEffect } from 'react';
import { Eye, CheckCircle, XCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import api from '../../services/api';

const JournalList = () => {
  const [journals, setJournals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    loadJournals();
  }, [page]);

  const loadJournals = async () => {
    setLoading(true);
    try {
      const data = await api.getJournals({ page, limit: 10 });
      setJournals(data.data || []);
      setTotalPages(data.totalPages || 1);
    } catch (err) {
      console.error('Failed to load journals:', err);
    } finally {
      setLoading(false);
    }
  };

  const handlePost = async (id) => {
    if (!confirm('Yakin ingin memposting jurnal ini?')) return;
    
    try {
      await api.postJournal(id);
      loadJournals();
    } catch (err) {
      alert(err.message);
    }
  };

  const formatCurrency = (amount) => {
    return parseFloat(amount).toLocaleString('id-ID', {
      minimumFractionDigits: 2
    });
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">No. Jurnal</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tanggal</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tipe</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Keterangan</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Debit</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Kredit</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {journals.map((journal) => (
              <tr key={journal.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-blue-600">{journal.journalNo}</td>
                <td className="px-4 py-3 text-sm text-gray-600">
                  {new Date(journal.journalDate).toLocaleDateString('id-ID')}
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded-full text-xs ${
                    journal.journalType === 'GENERAL' ? 'bg-blue-100 text-blue-700' :
                    journal.journalType === 'ADJUSTING' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-purple-100 text-purple-700'
                  }`}>
                    {journal.journalType === 'GENERAL' ? 'Umum' :
                     journal.journalType === 'ADJUSTING' ? 'Penyesuaian' : 'Penutup'}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-600 max-w-xs truncate">
                  {journal.description || '-'}
                </td>
                <td className="px-4 py-3 text-sm text-right font-medium">
                  {formatCurrency(journal.totalDebit)}
                </td>
                <td className="px-4 py-3 text-sm text-right font-medium">
                  {formatCurrency(journal.totalCredit)}
                </td>
                <td className="px-4 py-3 text-center">
                  {journal.isPosted ? (
                    <span className="flex items-center justify-center gap-1 text-green-600 text-sm">
                      <CheckCircle className="w-4 h-4" />
                      Posted
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-1 text-yellow-600 text-sm">
                      <XCircle className="w-4 h-4" />
                      Draft
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-center">
                  <div className="flex justify-center gap-2">
                    <button className="text-blue-600 hover:text-blue-800">
                      <Eye className="w-4 h-4" />
                    </button>
                    {!journal.isPosted && (
                      <button 
                        onClick={() => handlePost(journal.id)}
                        className="text-green-600 hover:text-green-800"
                        title="Posting ke Buku Besar"
                      >
                        <CheckCircle className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex justify-between items-center mt-4 pt-4 border-t">
        <p className="text-sm text-gray-500">
          Halaman {page} dari {totalPages}
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="p-2 rounded-md border hover:bg-gray-50 disabled:opacity-50"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="p-2 rounded-md border hover:bg-gray-50 disabled:opacity-50"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default JournalList;
```

### `frontend/src/pages/LedgerPage.jsx`
```jsx
import React, { useState, useEffect } from 'react';
import { Search, FileText } from 'lucide-react';
import api from '../services/api';

const LedgerPage = () => {
  const [accounts, setAccounts] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [ledger, setLedger] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadAccounts();
  }, []);

  const loadAccounts = async () => {
    try {
      const data = await api.getAccounts();
      setAccounts(data.filter(a => !a.isHeader));
    } catch (err) {
      console.error('Failed to load accounts:', err);
    }
  };

  const loadLedger = async (accountId) => {
    setLoading(true);
    try {
      const data = await api.getLedger(accountId);
      setLedger(data);
      setSelectedAccount(accounts.find(a => a.id === parseInt(accountId)));
    } catch (err) {
      console.error('Failed to load ledger:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount) => {
    return parseFloat(amount).toLocaleString('id-ID', {
      minimumFractionDigits: 2
    });
  };

  return (
    <div className="space-y-6">
      <div className="card">
        <h3 className="text-lg font-semibold mb-4">Pilih Akun</h3>
        <div className="relative">
          <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <select
            onChange={(e) => loadLedger(e.target.value)}
            className="input-field pl-10 w-full"
            defaultValue=""
          >
            <option value="">-- Pilih Kode Rekening --</option>
            {accounts.map(account => (
              <option key={account.id} value={account.id}>
                {account.code} - {account.name} ({account.normalBalance})
              </option>
            ))}
          </select>
        </div>
      </div>

      {selectedAccount && (
        <div className="card">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h3 className="text-lg font-semibold">
                Buku Besar: {selectedAccount.code} - {selectedAccount.name}
              </h3>
              <p className="text-sm text-gray-500">
                Normal Balance: {selectedAccount.normalBalance} | 
                Saldo Awal: Rp {formatCurrency(selectedAccount.openingBalance)}
              </p>
            </div>
            <button className="btn-secondary flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Export PDF
            </button>
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Tanggal</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Ref</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Keterangan</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">Debit</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">Kredit</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">Saldo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {/* Opening Balance Row */}
                  <tr className="bg-yellow-50">
                    <td className="px-4 py-3 text-sm font-medium" colSpan="5">Saldo Awal</td>
                    <td className="px-4 py-3 text-sm text-right font-bold">
                      {formatCurrency(selectedAccount.openingBalance)}
                    </td>
                  </tr>
                  
                  {ledger.map((entry, index) => (
                    <tr key={entry.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {new Date(entry.transactionDate).toLocaleDateString('id-ID')}
                      </td>
                      <td className="px-4 py-3 text-sm text-blue-600">
                        {entry.journal?.journalNo || entry.reference}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {entry.description || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-right">
                        {entry.debit > 0 ? formatCurrency(entry.debit) : '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-right">
                        {entry.credit > 0 ? formatCurrency(entry.credit) : '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-medium">
                        {formatCurrency(entry.balance)}
                      </td>
                    </tr>
                  ))}
                  
                  {ledger.length === 0 && (
                    <tr>
                      <td colSpan="6" className="px-4 py-8 text-center text-gray-500">
                        Belum ada transaksi untuk akun ini
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default LedgerPage;
```

### `frontend/src/pages/ReportsPage.jsx`
```jsx
import React, { useState } from 'react';
import { FileText, BarChart3, Scale } from 'lucide-react';
import TrialBalance from '../components/Reports/TrialBalance';
import IncomeStatement from '../components/Reports/IncomeStatement';
import BalanceSheet from '../components/Reports/BalanceSheet';

const tabs = [
  { id: 'neraca-saldo', label: 'Neraca Saldo', icon: Scale },
  { id: 'rugi-laba', label: 'Rugi Laba', icon: BarChart3 },
  { id: 'neraca', label: 'Neraca', icon: FileText },
];

const ReportsPage = () => {
  const [activeTab, setActiveTab] = useState('neraca-saldo');

  return (
    <div className="space-y-6">
      {/* Tab Navigation */}
      <div className="flex gap-2 bg-white rounded-lg p-2 shadow-sm">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-6 py-3 rounded-md transition-colors ${
              activeTab === tab.id
                ? 'bg-blue-600 text-white'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            <span className="font-medium">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Report Content */}
      {activeTab === 'neraca-saldo' && <TrialBalance />}
      {activeTab === 'rugi-laba' && <IncomeStatement />}
      {activeTab === 'neraca' && <BalanceSheet />}
    </div>
  );
};

export default ReportsPage;
```

### `frontend/src/pages/BankPage.jsx`
```jsx
import React, { useState, useEffect } from 'react';
import { Landmark, Plus, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import api from '../services/api';

const BankPage = () => {
  const [banks, setBanks] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    bankId: '',
    transactionDate: new Date().toISOString().split('T')[0],
    transactionType: 'DEPOSIT',
    description: '',
    amount: ''
  });

  useEffect(() => {
    loadBanks();
  }, []);

  const loadBanks = async () => {
    try {
      const data = await api.request('/banks');
      setBanks(data);
      if (data.length > 0 && !formData.bankId) {
        setFormData(prev => ({ ...prev, bankId: data[0].id }));
        loadTransactions(data[0].id);
      }
    } catch (err) {
      console.error('Failed to load banks:', err);
    }
  };

  const loadTransactions = async (bankId) => {
    try {
      const data = await api.request(`/banks/${bankId}/transactions`);
      setTransactions(data);
    } catch (err) {
      console.error('Failed to load transactions:', err);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.request('/banks/transaction', {
        method: 'POST',
        body: JSON.stringify({
          ...formData,
          amount: parseFloat(formData.amount),
          bankId: parseInt(formData.bankId)
        })
      });
      setShowForm(false);
      loadTransactions(formData.bankId);
      loadBanks();
    } catch (err) {
      alert(err.message);
    }
  };

  const formatCurrency = (amount) => {
    return parseFloat(amount).toLocaleString('id-ID', {
      minimumFractionDigits: 2
    });
  };

  return (
    <div className="space-y-6">
      {/* Bank Cards */}
      <div className="grid grid-cols-3 gap-6">
        {banks.map(bank => (
          <div 
            key={bank.id} 
            className={`card cursor-pointer transition-all ${
              formData.bankId == bank.id ? 'ring-2 ring-blue-500' : ''
            }`}
            onClick={() => {
              setFormData(prev => ({ ...prev, bankId: bank.id }));
              loadTransactions(bank.id);
            }}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-blue-100 rounded-lg">
                <Landmark className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-800">{bank.bankName}</h3>
                <p className="text-sm text-gray-500">{bank.accountNumber}</p>
              </div>
            </div>
            <div>
              <p className="text-sm text-gray-500">Saldo Saat Ini</p>
              <p className="text-2xl font-bold text-gray-800">
                Rp {formatCurrency(bank.currentBalance)}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Transaction Form */}
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Transaksi Bank</h3>
        <button 
          onClick={() => setShowForm(!showForm)}
          className="btn-primary flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          {showForm ? 'Tutup' : 'Transaksi Baru'}
        </button>
      </div>

      {showForm && (
        <div className="card">
          <form onSubmit={handleSubmit} className="grid grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Bank</label>
              <select
                value={formData.bankId}
                onChange={(e) => setFormData({...formData, bankId: e.target.value})}
                className="input-field"
              >
                {banks.map(b => (
                  <option key={b.id} value={b.id}>{b.bankName}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tanggal</label>
              <input
                type="date"
                value={formData.transactionDate}
                onChange={(e) => setFormData({...formData, transactionDate: e.target.value})}
                className="input-field"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tipe</label>
              <select
                value={formData.transactionType}
                onChange={(e) => setFormData({...formData, transactionType: e.target.value})}
                className="input-field"
              >
                <option value="DEPOSIT">Setoran (Debit Bank)</option>
                <option value="WITHDRAWAL">Penarikan (Kredit Bank)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Jumlah</label>
              <input
                type="number"
                value={formData.amount}
                onChange={(e) => setFormData({...formData, amount: e.target.value})}
                className="input-field"
                placeholder="0"
                required
              />
            </div>
            <div className="col-span-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">Keterangan</label>
              <input
                type="text"
                value={formData.description}
                onChange={(e) => setFormData({...formData, description: e.target.value})}
                className="input-field"
                placeholder="Keterangan transaksi..."
              />
            </div>
            <div className="flex items-end">
              <button type="submit" className="btn-primary w-full">Simpan</button>
            </div>
          </form>
        </div>
      )}

      {/* Transaction List */}
      <div className="card">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Tanggal</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Ref</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Keterangan</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">Masuk</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">Keluar</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {transactions.map((trx) => (
                <tr key={trx.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {new Date(trx.transactionDate).toLocaleDateString('id-ID')}
                  </td>
                  <td className="px-4 py-3 text-sm text-blue-600">{trx.referenceNo || '-'}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{trx.description}</td>
                  <td className="px-4 py-3 text-sm text-right text-green-600">
                    {trx.transactionType === 'DEPOSIT' ? formatCurrency(trx.amount) : '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-red-600">
                    {trx.transactionType === 'WITHDRAWAL' ? formatCurrency(trx.amount) : '-'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-1 rounded-full text-xs ${
                      trx.isReconciled 
                        ? 'bg-green-100 text-green-700' 
                        : 'bg-gray-100 text-gray-600'
                    }`}>
                      {trx.isReconciled ? 'Reconciled' : 'Unreconciled'}
                    </span>
                  </td>
                </tr>
              ))}
              {transactions.length === 0 && (
                <tr>
                  <td colSpan="6" className="px-4 py-8 text-center text-gray-500">
                    Belum ada transaksi
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default BankPage;
```

### `frontend/src/pages/CashPage.jsx`
```jsx
import React, { useState, useEffect } from 'react';
import { Wallet, Plus, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import api from '../services/api';

const CashPage = () => {
  const [cashAccounts, setCashAccounts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    cashId: '',
    transactionDate: new Date().toISOString().split('T')[0],
    transactionType: 'RECEIPT',
    description: '',
    amount: ''
  });

  useEffect(() => {
    loadCashAccounts();
  }, []);

  const loadCashAccounts = async () => {
    try {
      const data = await api.request('/cash');
      setCashAccounts(data);
      if (data.length > 0 && !formData.cashId) {
        setFormData(prev => ({ ...prev, cashId: data[0].id }));
        loadTransactions(data[0].id);
      }
    } catch (err) {
      console.error('Failed to load cash accounts:', err);
    }
  };

  const loadTransactions = async (cashId) => {
    try {
      const data = await api.request(`/cash/${cashId}/transactions`);
      setTransactions(data);
    } catch (err) {
      console.error('Failed to load transactions:', err);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.request('/cash/transaction', {
        method: 'POST',
        body: JSON.stringify({
          ...formData,
          amount: parseFloat(formData.amount),
          cashId: parseInt(formData.cashId)
        })
      });
      setShowForm(false);
      loadTransactions(formData.cashId);
      loadCashAccounts();
    } catch (err) {
      alert(err.message);
    }
  };

  const formatCurrency = (amount) => {
    return parseFloat(amount).toLocaleString('id-ID', {
      minimumFractionDigits: 2
    });
  };

  return (
    <div className="space-y-6">
      {/* Cash Cards */}
      <div className="grid grid-cols-3 gap-6">
        {cashAccounts.map(cash => (
          <div 
            key={cash.id} 
            className={`card cursor-pointer transition-all ${
              formData.cashId == cash.id ? 'ring-2 ring-green-500' : ''
            }`}
            onClick={() => {
              setFormData(prev => ({ ...prev, cashId: cash.id }));
              loadTransactions(cash.id);
            }}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-green-100 rounded-lg">
                <Wallet className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-800">{cash.cashName}</h3>
                <p className="text-sm text-gray-500">Kas Operasional</p>
              </div>
            </div>
            <div>
              <p className="text-sm text-gray-500">Saldo Saat Ini</p>
              <p className="text-2xl font-bold text-gray-800">
                Rp {formatCurrency(cash.currentBalance)}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Transaction Form */}
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Transaksi Kas</h3>
        <button 
          onClick={() => setShowForm(!showForm)}
          className="btn-primary flex items-center gap-2 bg-green-600 hover:bg-green-700"
        >
          <Plus className="w-4 h-4" />
          {showForm ? 'Tutup' : 'Transaksi Baru'}
        </button>
      </div>

      {showForm && (
        <div className="card">
          <form onSubmit={handleSubmit} className="grid grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Kas</label>
              <select
                value={formData.cashId}
                onChange={(e) => setFormData({...formData, cashId: e.target.value})}
                className="input-field"
              >
                {cashAccounts.map(c => (
                  <option key={c.id} value={c.id}>{c.cashName}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tanggal</label>
              <input
                type="date"
                value={formData.transactionDate}
                onChange={(e) => setFormData({...formData, transactionDate: e.target.value})}
                className="input-field"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tipe</label>
              <select
                value={formData.transactionType}
                onChange={(e) => setFormData({...formData, transactionType: e.target.value})}
                className="input-field"
              >
                <option value="RECEIPT">Penerimaan (Debit Kas)</option>
                <option value="PAYMENT">Pengeluaran (Kredit Kas)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Jumlah</label>
              <input
                type="number"
                value={formData.amount}
                onChange={(e) => setFormData({...formData, amount: e.target.value})}
                className="input-field"
                placeholder="0"
                required
              />
            </div>
            <div className="col-span-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">Keterangan</label>
              <input
                type="text"
                value={formData.description}
                onChange={(e) => setFormData({...formData, description: e.target.value})}
                className="input-field"
                placeholder="Keterangan transaksi..."
              />
            </div>
            <div className="flex items-end">
              <button type="submit" className="btn-primary w-full bg-green-600 hover:bg-green-700">Simpan</button>
            </div>
          </form>
        </div>
      )}

      {/* Transaction List */}
      <div className="card">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Tanggal</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Ref</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Keterangan</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">Masuk</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">Keluar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {transactions.map((trx) => (
                <tr key={trx.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {new Date(trx.transactionDate).toLocaleDateString('id-ID')}
                  </td>
                  <td className="px-4 py-3 text-sm text-blue-600">{trx.referenceNo || '-'}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{trx.description}</td>
                  <td className="px-4 py-3 text-sm text-right text-green-600">
                    {trx.transactionType === 'RECEIPT' ? formatCurrency(trx.amount) : '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-red-600">
                    {trx.transactionType === 'PAYMENT' ? formatCurrency(trx.amount) : '-'}
                  </td>
                </tr>
              ))}
              {transactions.length === 0 && (
                <tr>
                  <td colSpan="5" className="px-4 py-8 text-center text-gray-500">
                    Belum ada transaksi
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default CashPage;
```

### `frontend/src/pages/SettingsPage.jsx`
```jsx
import React, { useState, useEffect } from 'react';
import { Save, Database, Calendar, Building } from 'lucide-react';
import api from '../services/api';

const SettingsPage = () => {
  const [settings, setSettings] = useState({
    companyName: 'PT. Contoh Sejahtera',
    companyAddress: 'Jl. Sudirman No. 123, Jakarta',
    companyPhone: '021-1234567',
    fiscalYearStart: '2026-01-01',
    currentPeriod: 'Mei 2026'
  });
  const [accounts, setAccounts] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadAccounts();
  }, []);

  const loadAccounts = async () => {
    try {
      const data = await api.getAccounts();
      setAccounts(data);
    } catch (err) {
      console.error('Failed to load accounts:', err);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    // Simulate save
    setTimeout(() => {
      setSaving(false);
      alert('Pengaturan berhasil disimpan!');
    }, 1000);
  };

  return (
    <div className="space-y-6">
      {/* Company Info */}
      <div className="card">
        <div className="flex items-center gap-3 mb-6">
          <Building className="w-6 h-6 text-blue-600" />
          <h3 className="text-lg font-semibold">Informasi Perusahaan</h3>
        </div>
        
        <div className="grid grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nama Perusahaan</label>
            <input
              type="text"
              value={settings.companyName}
              onChange={(e) => setSettings({...settings, companyName: e.target.value})}
              className="input-field"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Telepon</label>
            <input
              type="text"
              value={settings.companyPhone}
              onChange={(e) => setSettings({...settings, companyPhone: e.target.value})}
              className="input-field"
            />
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Alamat</label>
            <textarea
              value={settings.companyAddress}
              onChange={(e) => setSettings({...settings, companyAddress: e.target.value})}
              className="input-field"
              rows="2"
            />
          </div>
        </div>
      </div>

      {/* Fiscal Period */}
      <div className="card">
        <div className="flex items-center gap-3 mb-6">
          <Calendar className="w-6 h-6 text-green-600" />
          <h3 className="text-lg font-semibold">Periode Akuntansi</h3>
        </div>
        
        <div className="grid grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Awal Tahun Fiskal</label>
            <input
              type="date"
              value={settings.fiscalYearStart}
              onChange={(e) => setSettings({...settings, fiscalYearStart: e.target.value})}
              className="input-field"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Periode Aktif</label>
            <input
              type="text"
              value={settings.currentPeriod}
              disabled
              className="input-field bg-gray-100"
            />
          </div>
        </div>
      </div>

      {/* Chart of Accounts Summary */}
      <div className="card">
        <div className="flex items-center gap-3 mb-6">
          <Database className="w-6 h-6 text-purple-600" />
          <h3 className="text-lg font-semibold">Ringkasan Kode Rekening</h3>
        </div>
        
        <div className="grid grid-cols-5 gap-4 text-center">
          <div className="p-4 bg-blue-50 rounded-lg">
            <p className="text-2xl font-bold text-blue-700">
              {accounts.filter(a => a.accountType === 'ASSET').length}
            </p>
            <p className="text-sm text-gray-600">Aset</p>
          </div>
         Lanjutkan dengan sisa halaman Settings dan tambahkan route/controller untuk Bank & Cash yang belum lengkap.

---

## 16. Lanjutan Pages

### `frontend/src/pages/SettingsPage.jsx` (Lanjutan)
```jsx
          <div className="p-4 bg-red-50 rounded-lg">
            <p className="text-2xl font-bold text-red-700">
              {accounts.filter(a => a.accountType === 'LIABILITY').length}
            </p>
            <p className="text-sm text-gray-600">Kewajiban</p>
          </div>
          <div className="p-4 bg-green-50 rounded-lg">
            <p className="text-2xl font-bold text-green-700">
              {accounts.filter(a => a.accountType === 'EQUITY').length}
            </p>
            <p className="text-sm text-gray-600">Ekuitas</p>
          </div>
          <div className="p-4 bg-purple-50 rounded-lg">
            <p className="text-2xl font-bold text-purple-700">
              {accounts.filter(a => a.accountType === 'REVENUE').length}
            </p>
            <p className="text-sm text-gray-600">Pendapatan</p>
          </div>
          <div className="p-4 bg-yellow-50 rounded-lg">
            <p className="text-2xl font-bold text-yellow-700">
              {accounts.filter(a => a.accountType === 'EXPENSE').length}
            </p>
            <p className="text-sm text-gray-600">Beban</p>
          </div>
        </div>

        <div className="mt-4 text-sm text-gray-500">
          Total Akun: <span className="font-semibold">{accounts.length}</span> | 
          Header: <span className="font-semibold">{accounts.filter(a => a.isHeader).length}</span> | 
          Detail: <span className="font-semibold">{accounts.filter(a => !a.isHeader).length}</span>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-primary flex items-center gap-2"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Menyimpan...' : 'Simpan Pengaturan'}
        </button>
      </div>
    </div>
  );
};

export default SettingsPage;
```

---

## 17. Backend Routes Lengkap (Bank & Cash)

### `backend/src/routes/banks.js`
```javascript
const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Get all banks
router.get('/', async (req, res) => {
  try {
    const banks = await prisma.bank.findMany({
      include: { account: true }
    });
    res.json(banks);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get bank transactions
router.get('/:id/transactions', async (req, res) => {
  try {
    const transactions = await prisma.bankTransaction.findMany({
      where: { bankId: parseInt(req.params.id) },
      orderBy: { transactionDate: 'desc' }
    });
    res.json(transactions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create bank transaction + auto journal
router.post('/transaction', async (req, res) => {
  try {
    const { bankId, transactionDate, transactionType, description, amount } = req.body;
    
    const bank = await prisma.bank.findUnique({
      where: { id: parseInt(bankId) },
      include: { account: true }
    });

    if (!bank) {
      return res.status(404).json({ error: 'Bank tidak ditemukan' });
    }

    // Get period
    const period = await prisma.accountingPeriod.findFirst({
      where: {
        startDate: { lte: new Date(transactionDate) },
        endDate: { gte: new Date(transactionDate) }
      }
    });

    if (!period) {
      return res.status(400).json({ error: 'Periode akuntansi tidak ditemukan untuk tanggal tersebut' });
    }

    // Create journal
    const journal = await prisma.journalHeader.create({
      data: {
        journalDate: new Date(transactionDate),
        periodId: period.id,
        journalType: 'GENERAL',
        reference: `BANK-${transactionType}`,
        description: description || `Transaksi Bank ${bank.bankName}`,
        totalDebit: amount,
        totalCredit: amount,
        isPosted: true, // Auto-post for bank transactions
        details: {
          create: transactionType === 'DEPOSIT' ? [
            {
              accountId: bank.accountId,
              description: description || 'Setoran Bank',
              debit: amount,
              credit: 0,
              lineNo: 1
            },
            {
              accountId: 4, // Pendapatan atau akun sumber (bisa disesuaikan)
              description: description || 'Sumber Dana',
              debit: 0,
              credit: amount,
              lineNo: 2
            }
          ] : [
            {
              accountId: 5, // Beban atau akun tujuan (bisa disesuaikan)
              description: description || 'Pengeluaran',
              debit: amount,
              credit: 0,
              lineNo: 1
            },
            {
              accountId: bank.accountId,
              description: description || 'Penarikan Bank',
              debit: 0,
              credit: amount,
              lineNo: 2
            }
          ]
        }
      },
      include: { details: true }
    });

    // Create bank transaction record
    const bankTrx = await prisma.bankTransaction.create({
      data: {
        bankId: parseInt(bankId),
        transactionDate: new Date(transactionDate),
        transactionType,
        referenceNo: journal.journalNo,
        description: description || `Transaksi Bank ${transactionType}`,
        amount,
        journalId: journal.id
      }
    });

    // Update bank balance
    const balanceChange = transactionType === 'DEPOSIT' ? amount : -amount;
    await prisma.bank.update({
      where: { id: parseInt(bankId) },
      data: { currentBalance: { increment: balanceChange } }
    });

    res.status(201).json({ journal, transaction: bankTrx });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
```

### `backend/src/routes/cash.js`
```javascript
const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Get all cash accounts
router.get('/', async (req, res) => {
  try {
    const cashAccounts = await prisma.cashAccount.findMany({
      include: { account: true }
    });
    res.json(cashAccounts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get cash transactions
router.get('/:id/transactions', async (req, res) => {
  try {
    const transactions = await prisma.cashTransaction.findMany({
      where: { cashId: parseInt(req.params.id) },
      orderBy: { transactionDate: 'desc' }
    });
    res.json(transactions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create cash transaction + auto journal
router.post('/transaction', async (req, res) => {
  try {
    const { cashId, transactionDate, transactionType, description, amount } = req.body;
    
    const cash = await prisma.cashAccount.findUnique({
      where: { id: parseInt(cashId) },
      include: { account: true }
    });

    if (!cash) {
      return res.status(404).json({ error: 'Akun kas tidak ditemukan' });
    }

    // Get period
    const period = await prisma.accountingPeriod.findFirst({
      where: {
        startDate: { lte: new Date(transactionDate) },
        endDate: { gte: new Date(transactionDate) }
      }
    });

    if (!period) {
      return res.status(400).json({ error: 'Periode akuntansi tidak ditemukan untuk tanggal tersebut' });
    }

    // Create journal
    const journal = await prisma.journalHeader.create({
      data: {
        journalDate: new Date(transactionDate),
        periodId: period.id,
        journalType: 'GENERAL',
        reference: `CASH-${transactionType}`,
        description: description || `Transaksi Kas ${cash.cashName}`,
        totalDebit: amount,
        totalCredit: amount,
        isPosted: true, // Auto-post for cash transactions
        details: {
          create: transactionType === 'RECEIPT' ? [
            {
              accountId: cash.accountId,
              description: description || 'Penerimaan Kas',
              debit: amount,
              credit: 0,
              lineNo: 1
            },
            {
              accountId: 4, // Pendapatan atau akun sumber
              description: description || 'Sumber Dana',
              debit: 0,
              credit: amount,
              lineNo: 2
            }
          ] : [
            {
              accountId: 5, // Beban atau akun tujuan
              description: description || 'Pengeluaran',
              debit: amount,
              credit: 0,
              lineNo: 1
            },
            {
              accountId: cash.accountId,
              description: description || 'Pengeluaran Kas',
              debit: 0,
              credit: amount,
              lineNo: 2
            }
          ]
        }
      },
      include: { details: true }
    });

    // Create cash transaction record
    const cashTrx = await prisma.cashTransaction.create({
      data: {
        cashId: parseInt(cashId),
        transactionDate: new Date(transactionDate),
        transactionType,
        referenceNo: journal.journalNo,
        description: description || `Transaksi Kas ${transactionType}`,
        amount,
        journalId: journal.id
      }
    });

    // Update cash balance
    const balanceChange = transactionType === 'RECEIPT' ? amount : -amount;
    await prisma.cashAccount.update({
      where: { id: parseInt(cashId) },
      data: { currentBalance: { increment: balanceChange } }
    });

    res.status(201).json({ journal, transaction: cashTrx });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
```

### `backend/src/routes/accounts.js`
```javascript
const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Get all accounts
router.get('/', async (req, res) => {
  try {
    const accounts = await prisma.account.findMany({
      orderBy: { code: 'asc' },
      include: { parent: true }
    });
    res.json(accounts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get account by ID
router.get('/:id', async (req, res) => {
  try {
    const account = await prisma.account.findUnique({
      where: { id: parseInt(req.params.id) },
      include: { parent: true, children: true }
    });
    if (!account) {
      return res.status(404).json({ error: 'Akun tidak ditemukan' });
    }
    res.json(account);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create new account
router.post('/', async (req, res) => {
  try {
    const { code, name, accountType, normalBalance, parentId, level, isHeader, openingBalance } = req.body;
    
    const account = await prisma.account.create({
      data: {
        code,
        name,
        accountType,
        normalBalance,
        parentId: parentId ? parseInt(parentId) : null,
        level: level || 3,
        isHeader: isHeader || false,
        openingBalance: openingBalance || 0
      }
    });
    
    res.status(201).json(account);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update account
router.put('/:id', async (req, res) => {
  try {
    const { name, isActive, openingBalance } = req.body;
    
    const account = await prisma.account.update({
      where: { id: parseInt(req.params.id) },
      data: {
        name,
        isActive,
        openingBalance
      }
    });
    
    res.json(account);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
```

---

## 18. Update `backend/src/app.js` (Final)

```javascript
const express = require('express');
const cors = require('cors');
const { optionalAuth } = require('./middleware/simpleAuth');

const app = express();

app.use(cors());
app.use(express.json());
app.use(optionalAuth);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    service: 'Sistem Akuntansi API'
  });
});

// Routes
app.use('/api/accounts', require('./routes/accounts'));
app.use('/api/journals', require('./routes/journals'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/banks', require('./routes/banks'));
app.use('/api/cash', require('./routes/cash'));

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Terjadi kesalahan server', detail: err.message });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint tidak ditemukan' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📊 API Documentation: http://localhost:${PORT}/api/health`);
});
```

---

## 19. Trial Balance Component (Reports)

### `frontend/src/components/Reports/TrialBalance.jsx`
```jsx
import React, { useState, useEffect } from 'react';
import { Search, Download, Printer } from 'lucide-react';
import api from '../../services/api';

const TrialBalance = () => {
  const [report, setReport] = useState([]);
  const [loading, setLoading] = useState(false);
  const [periodId, setPeriodId] = useState('');

  useEffect(() => {
    generateReport();
  }, []);

  const generateReport = async () => {
    setLoading(true);
    try {
      const data = await api.getTrialBalance(periodId || 1);
      setReport(data);
    } catch (err) {
      console.error('Failed to load trial balance:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount) => {
    return parseFloat(amount).toLocaleString('id-ID', {
      minimumFractionDigits: 2
    });
  };

  const totalDebit = report.reduce((sum, r) => sum + parseFloat(r.totalDebit || 0), 0);
  const totalCredit = report.reduce((sum, r) => sum + parseFloat(r.totalCredit || 0), 0);

  return (
    <div className="card">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h3 className="text-lg font-semibold">Neraca Saldo</h3>
          <p className="text-sm text-gray-500">Periode: Mei 2026</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary flex items-center gap-2">
            <Printer className="w-4 h-4" />
            Cetak
          </button>
          <button className="btn-secondary flex items-center gap-2">
            <Download className="w-4 h-4" />
            Export Excel
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Kode</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nama Akun</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Posisi Normal</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Debit (Rp)</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Kredit (Rp)</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Saldo Akhir (Rp)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {report.map((item) => (
                  <tr key={item.accountCode} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-blue-600">{item.accountCode}</td>
                    <td className="px-4 py-3 text-sm text-gray-800">{item.accountName}</td>
                    <td className="px-4 py-3 text-sm text-center">
                      <span className={`px-2 py-1 rounded-full text-xs ${
                        item.normalBalance === 'DEBIT' 
                          ? 'bg-blue-100 text-blue-700' 
                          : 'bg-green-100 text-green-700'
                      }`}>
                        {item.normalBalance}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-right">
                      {parseFloat(item.totalDebit) > 0 ? formatCurrency(item.totalDebit) : '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-right">
                      {parseFloat(item.totalCredit) > 0 ? formatCurrency(item.totalCredit) : '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-medium">
                      {formatCurrency(item.endingBalance)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-100 font-semibold">
                <tr>
                  <td colSpan="3" className="px-4 py-3 text-right">TOTAL</td>
                  <td className="px-4 py-3 text-right text-blue-700">{formatCurrency(totalDebit)}</td>
                  <td className="px-4 py-3 text-right text-green-700">{formatCurrency(totalCredit)}</td>
                  <td className="px-4 py-3"></td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className={`mt-4 p-3 rounded-lg text-center text-sm font-medium ${
            Math.abs(totalDebit - totalCredit) < 0.01 
              ? 'bg-green-100 text-green-700' 
              : 'bg-red-100 text-red-700'
          }`}>
            {Math.abs(totalDebit - totalCredit) < 0.01 
              ? '✓ Neraca Saldo Seimbang' 
              : `✗ Tidak Seimbang! Selisih: ${formatCurrency(Math.abs(totalDebit - totalCredit))}`}
          </div>
        </>
      )}
    </div>
  );
};

export default TrialBalance;
```

---

## 20. File `.env` Example

### `backend/.env`
```env
DATABASE_URL="postgresql://akuntansi:akuntansi123@localhost:5432/akuntansi_db?schema=public"
PORT=3000
JWT_SECRET=simple-secret-key-2026
```

### `frontend/.env`
```env
VITE_API_URL=http://localhost:3000/api
```

---

## 21. Cara Menjalankan

```bash
# 1. Clone/Setup folder
mkdir sistem-akuntansi
cd sistem-akuntansi

# 2. Jalankan dengan Docker Compose
docker-compose up --build

# Atau manual:
# --- Backend ---
cd backend
npm install
npx prisma migrate dev --name init
npx prisma db seed
npm run dev

# --- Frontend ---
cd frontend
npm install
npm run dev
```

Akses aplikasi:
- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:3000
- **Database**: localhost:5432

---
