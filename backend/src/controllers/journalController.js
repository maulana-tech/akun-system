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
      
      if (!existing) {
        return res.status(404).json({ error: 'Jurnal tidak ditemukan' });
      }

      if (existing.isPosted) {
        return res.status(400).json({ error: 'Jurnal sudah diposting!' });
      }
      
      // Note: Posting is handled automatically by the database trigger trg_post_ledger
      // when is_posted is updated from FALSE to TRUE.
      
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
