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
