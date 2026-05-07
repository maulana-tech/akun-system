const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Cleaning up database...');
  const beforeCount = await prisma.account.count();
  console.log(`Current account count: ${beforeCount}`);

  // Delete in order of dependencies
  await prisma.generalLedger.deleteMany();
  await prisma.journalDetail.deleteMany();
  await prisma.bankTransaction.deleteMany();
  await prisma.cashTransaction.deleteMany();
  await prisma.journalHeader.deleteMany();
  await prisma.bank.deleteMany();
  await prisma.cashAccount.deleteMany();
  await prisma.trialBalance.deleteMany();
  
  // Clear parentId first to allow deleting self-referencing accounts
  await prisma.account.updateMany({ data: { parentId: null } });
  await prisma.account.deleteMany();
  await prisma.accountingPeriod.deleteMany();

  // Reset sequences (SQLite)
  await prisma.$executeRawUnsafe('DELETE FROM sqlite_sequence WHERE name="accounts"');
  await prisma.$executeRawUnsafe('DELETE FROM sqlite_sequence WHERE name="accounting_periods"');
  await prisma.$executeRawUnsafe('DELETE FROM sqlite_sequence WHERE name="journal_headers"');
  await prisma.$executeRawUnsafe('DELETE FROM sqlite_sequence WHERE name="journal_details"');
  await prisma.$executeRawUnsafe('DELETE FROM sqlite_sequence WHERE name="general_ledger"');

  const afterCount = await prisma.account.count();
  console.log(`Account count after cleanup: ${afterCount}`);

  console.log('Seeding database...');

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
    data: { code: '1000', name: 'ASET', accountType: 'ASSET', normalBalance: 'DEBIT', level: 1, isHeader: true }
  });
  
  const liability = await prisma.account.create({
    data: { code: '2000', name: 'KEWAJIBAN', accountType: 'LIABILITY', normalBalance: 'CREDIT', level: 1, isHeader: true }
  });
  
  const equity = await prisma.account.create({
    data: { code: '3000', name: 'EKUITAS', accountType: 'EQUITY', normalBalance: 'CREDIT', level: 1, isHeader: true }
  });
  
  const revenue = await prisma.account.create({
    data: { code: '4000', name: 'PENDAPATAN', accountType: 'REVENUE', normalBalance: 'CREDIT', level: 1, isHeader: true }
  });
  
  const expense = await prisma.account.create({
    data: { code: '5000', name: 'BEBAN', accountType: 'EXPENSE', normalBalance: 'DEBIT', level: 1, isHeader: true }
  });

  // Level 2 - Asset Sub-headers
  const currentAsset = await prisma.account.create({
    data: { code: '1100', name: 'ASET LANCAR', accountType: 'ASSET', normalBalance: 'DEBIT', parentId: asset.id, level: 2, isHeader: true }
  });
  
  const fixedAsset = await prisma.account.create({
    data: { code: '1200', name: 'ASET TETAP', accountType: 'ASSET', normalBalance: 'DEBIT', parentId: asset.id, level: 2, isHeader: true }
  });

  // Level 3 - Detail Accounts (Aset Lancar)
  const kas = await prisma.account.create({
    data: { code: '1110', name: 'Kas', accountType: 'ASSET', normalBalance: 'DEBIT', parentId: currentAsset.id, level: 3, isHeader: false, openingBalance: 50000000 }
  });
  
  const bank = await prisma.account.create({
    data: { code: '1120', name: 'Bank', accountType: 'ASSET', normalBalance: 'DEBIT', parentId: currentAsset.id, level: 3, isHeader: false, openingBalance: 100000000 }
  });
  
  const piutang = await prisma.account.create({
    data: { code: '1130', name: 'Piutang Usaha', accountType: 'ASSET', normalBalance: 'DEBIT', parentId: currentAsset.id, level: 3, isHeader: false, openingBalance: 25000000 }
  });
  
  const persediaan = await prisma.account.create({
    data: { code: '1140', name: 'Persediaan Barang', accountType: 'ASSET', normalBalance: 'DEBIT', parentId: currentAsset.id, level: 3, isHeader: false, openingBalance: 75000000 }
  });

  // Level 3 - Detail Accounts (Aset Tetap)
  const tanah = await prisma.account.create({
    data: { code: '1210', name: 'Tanah', accountType: 'ASSET', normalBalance: 'DEBIT', parentId: fixedAsset.id, level: 3, isHeader: false, openingBalance: 200000000 }
  });
  
  const bangunan = await prisma.account.create({
    data: { code: '1220', name: 'Bangunan', accountType: 'ASSET', normalBalance: 'DEBIT', parentId: fixedAsset.id, level: 3, isHeader: false, openingBalance: 500000000 }
  });
  
  const akumPenyusutan = await prisma.account.create({
    data: { code: '1230', name: 'Akumulasi Penyusutan', accountType: 'ASSET', normalBalance: 'CREDIT', parentId: fixedAsset.id, level: 3, isHeader: false, openingBalance: 50000000 }
  });

  // Level 2 - Liability Sub-headers
  const currentLiability = await prisma.account.create({
    data: { code: '2100', name: 'KEWAJIBAN LANCAR', accountType: 'LIABILITY', normalBalance: 'CREDIT', parentId: liability.id, level: 2, isHeader: true }
  });

  // Level 3 - Detail Accounts (Kewajiban)
  const hutangUsaha = await prisma.account.create({
    data: { code: '2110', name: 'Hutang Usaha', accountType: 'LIABILITY', normalBalance: 'CREDIT', parentId: currentLiability.id, level: 3, isHeader: false, openingBalance: 30000000 }
  });
  
  const hutangBank = await prisma.account.create({
    data: { code: '2120', name: 'Hutang Bank', accountType: 'LIABILITY', normalBalance: 'CREDIT', parentId: currentLiability.id, level: 3, isHeader: false, openingBalance: 100000000 }
  });

  // Level 2 - Equity
  const modal = await prisma.account.create({
    data: { code: '3100', name: 'Modal Pemilik', accountType: 'EQUITY', normalBalance: 'CREDIT', parentId: equity.id, level: 2, isHeader: false, openingBalance: 500000000 }
  });
  
  const labaDitahan = await prisma.account.create({
    data: { code: '3200', name: 'Laba Ditahan', accountType: 'EQUITY', normalBalance: 'CREDIT', parentId: equity.id, level: 2, isHeader: false, openingBalance: 270000000 }
  });

  // Level 2 - Revenue
  const pendapatanUsaha = await prisma.account.create({
    data: { code: '4100', name: 'Pendapatan Usaha', accountType: 'REVENUE', normalBalance: 'CREDIT', parentId: revenue.id, level: 2, isHeader: false, openingBalance: 0 }
  });
  
  const pendapatanLain = await prisma.account.create({
    data: { code: '4200', name: 'Pendapatan Lain-lain', accountType: 'REVENUE', normalBalance: 'CREDIT', parentId: revenue.id, level: 2, isHeader: false, openingBalance: 0 }
  });

  // Level 2 - Expense Sub-headers
  const bebanPokok = await prisma.account.create({
    data: { code: '5100', name: 'BEBAN POKOK PENJUALAN', accountType: 'EXPENSE', normalBalance: 'DEBIT', parentId: expense.id, level: 2, isHeader: true }
  });
  
  const bebanOperasional = await prisma.account.create({
    data: { code: '5200', name: 'BEBAN OPERASIONAL', accountType: 'EXPENSE', normalBalance: 'DEBIT', parentId: expense.id, level: 2, isHeader: true }
  });

  // Level 3 - Detail Accounts (Beban)
  const hpp = await prisma.account.create({
    data: { code: '5110', name: 'Harga Pokok Penjualan', accountType: 'EXPENSE', normalBalance: 'DEBIT', parentId: bebanPokok.id, level: 3, isHeader: false, openingBalance: 0 }
  });
  
  const hpproduksi = await prisma.account.create({
    data: { code: '5120', name: 'Harga Pokok Produksi', accountType: 'EXPENSE', normalBalance: 'DEBIT', parentId: bebanPokok.id, level: 3, isHeader: false, openingBalance: 0 }
  });
  
  const gaji = await prisma.account.create({
    data: { code: '5210', name: 'Beban Gaji dan Upah', accountType: 'EXPENSE', normalBalance: 'DEBIT', parentId: bebanOperasional.id, level: 3, isHeader: false, openingBalance: 0 }
  });
  
  const sewa = await prisma.account.create({
    data: { code: '5220', name: 'Beban Sewa', accountType: 'EXPENSE', normalBalance: 'DEBIT', parentId: bebanOperasional.id, level: 3, isHeader: false, openingBalance: 0 }
  });
  
  const listrik = await prisma.account.create({
    data: { code: '5230', name: 'Beban Listrik dan Air', accountType: 'EXPENSE', normalBalance: 'DEBIT', parentId: bebanOperasional.id, level: 3, isHeader: false, openingBalance: 0 }
  });
  
  const penyusutan = await prisma.account.create({
    data: { code: '5240', name: 'Beban Penyusutan', accountType: 'EXPENSE', normalBalance: 'DEBIT', parentId: bebanOperasional.id, level: 3, isHeader: false, openingBalance: 0 }
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

  // Create Initial Deposit Journal
  const initialDeposit = await prisma.journalHeader.create({
    data: {
      journalDate: new Date('2026-05-01'),
      periodId: period.id,
      journalType: 'GENERAL',
      description: 'Setoran Modal Awal (Cash)',
      totalDebit: 10000000,
      totalCredit: 10000000,
      isPosted: false,
      details: {
        create: [
          { accountId: kas.id, debit: 10000000, credit: 0, lineNo: 1, description: 'Setoran Modal' },
          { accountId: modal.id, debit: 0, credit: 10000000, lineNo: 2, description: 'Setoran Modal' }
        ]
      }
    }
  });

  // Post the journal via stored procedure (update is_posted to true to trigger it)
  await prisma.journalHeader.update({
    where: { id: initialDeposit.id },
    data: { isPosted: true }
  });

  console.log('Seeding completed!');
  console.log(`Period: ${period.periodName}`);
  console.log(`Total accounts: 20`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
