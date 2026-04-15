const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const config = require('./config');
const routes = require('./routes');

const app = express();

// Sécurité
app.use(helmet());
app.use(cors({
  origin: config.corsOrigin,
  credentials: true,
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requêtes par fenêtre
  message: { error: 'Trop de requêtes, veuillez réessayer plus tard' },
});
app.use('/api/auth', limiter);

// Parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Logging
if (config.nodeEnv !== 'test') {
  app.use(morgan('dev'));
}

// Routes
app.use('/api', routes);

// Route racine
app.get('/', (req, res) => {
  res.json({
    name: 'AMC Portail API',
    version: '1.0.0',
    description: 'Portail d\'Inscription Scolaire — Association des Musulmans de Clamart',
  });
});

// 404
app.use((req, res) => {
  res.status(404).json({ error: 'Route non trouvée' });
});

// Gestion d'erreurs globale
app.use((err, req, res, _next) => {
  console.error('Erreur non gérée:', err);
  res.status(500).json({ error: 'Erreur interne du serveur' });
});

// Démarrage du serveur
const PORT = config.port;
app.listen(PORT, () => {
  console.log(`
  🟢 AMC Portail API démarrée
  🌐 Port: ${PORT}
  📀 Environnement: ${config.nodeEnv}
  🔗 Frontend: ${config.frontendUrl}
  `);
});

module.exports = app;
