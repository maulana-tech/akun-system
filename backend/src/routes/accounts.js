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
    const { code, name, isActive, openingBalance } = req.body;
    
    const account = await prisma.account.update({
      where: { id: parseInt(req.params.id) },
      data: {
        code,
        name,
        isActive,
        openingBalance: openingBalance !== undefined ? parseFloat(openingBalance) : undefined
      }
    });
    
    res.json(account);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
