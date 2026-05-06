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
