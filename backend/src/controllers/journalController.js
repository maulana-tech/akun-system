const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

class JournalController {
  // Helper to generate Journal No
  async generateJournalNo(date, type) {
    const year = new Date(date).getFullYear();
    const prefix = `JU-${year}-`;
    
    const lastJournal = await prisma.journalHeader.findFirst({
      where: {
        journalNo: { startsWith: prefix }
      },
      orderBy: { journalNo: 'desc' }
    });

    let seq = 1;
    if (lastJournal && lastJournal.journalNo) {
      const lastSeq = parseInt(lastJournal.journalNo.split('-')[2]);
      seq = lastSeq + 1;
    }

    return `${prefix}${String(seq).padStart(4, '0')}`;
  }

  // Helper to post a single journal to ledger
  async postJournalInternal(journalId, tx) {
    const journal = await tx.journalHeader.findUnique({
      where: { id: journalId },
      include: { details: { include: { account: true } } }
    });

    if (!journal || journal.isPosted) return;

    for (const detail of journal.details) {
      const acc = detail.account;
      
      // Get latest balance from ledger or account opening
      const lastLedger = await tx.generalLedger.findFirst({
        where: { accountId: detail.accountId },
        orderBy: { id: 'desc' }
      });

      let runningBalance = lastLedger ? parseFloat(lastLedger.balance) : parseFloat(acc.openingBalance);

      // Update balance based on normal balance
      if (acc.normalBalance === 'DEBIT') {
        runningBalance += (parseFloat(detail.debit) - parseFloat(detail.credit));
      } else {
        runningBalance += (parseFloat(detail.credit) - parseFloat(detail.debit));
      }

      // Insert to Ledger
      await tx.generalLedger.create({
        data: {
          accountId: detail.accountId,
          periodId: journal.periodId,
          journalId: journal.id,
          transactionDate: journal.journalDate,
          description: detail.description || journal.description,
          debit: detail.debit,
          credit: detail.credit,
          balance: runningBalance,
          reference: journal.journalNo
        }
      });
    }

    // Mark as posted
    await tx.journalHeader.update({
      where: { id: journalId },
      data: { isPosted: true }
    });
  }

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

      const result = await prisma.$transaction(async (tx) => {
        const journalNo = await this.generateJournalNo(journalDate, journalType);
        
        const journal = await tx.journalHeader.create({
          data: {
            journalNo,
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

        // Auto-post
        await this.postJournalInternal(journal.id, tx);
        
        return tx.journalHeader.findUnique({
          where: { id: journal.id },
          include: { details: { include: { account: true } } }
        });
      });
      
      res.status(201).json(result);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: error.message });
    }
  }
  
  // Post Journal to Ledger
  async post(req, res) {
    try {
      const { id } = req.params;
      
      const result = await prisma.$transaction(async (tx) => {
        const existing = await tx.journalHeader.findUnique({
          where: { id: parseInt(id) }
        });
        
        if (!existing) throw new Error('Jurnal tidak ditemukan');
        if (existing.isPosted) throw new Error('Jurnal sudah diposting!');
        
        await this.postJournalInternal(parseInt(id), tx);
        
        return tx.journalHeader.findUnique({
          where: { id: parseInt(id) }
        });
      });
      
      res.json({ message: 'Jurnal berhasil diposting!', journal: result });
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
