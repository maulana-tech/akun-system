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
