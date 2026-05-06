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
