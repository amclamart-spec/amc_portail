const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');

const config = require('./config');
const routes = require('./routes');
const authRoutes = require('./routes/auth');
const configurePassport = require('./config/passport');

const app = express();
const passport = configurePassport();

app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({
  origin: config.corsOrigin,
  credentials: true,
}));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Trop de requêtes, veuillez réessayer plus tard' },
});
app.use('/api/auth', limiter);
app.use('/auth', limiter);

app.use(cookieParser());
app.use(passport.initialize());

// Webhooks paiement: body brut nécessaire pour vérifier les signatures
app.use('/api/payments/webhooks/stripe', express.raw({ type: 'application/json' }));
app.use('/api/payments/webhooks/gocardless', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

if (config.nodeEnv !== 'test') {
  app.use(morgan('dev'));
}

app.use('/api', routes);
// Alias sans /api pour OAuth (compatibilité demandée)
app.use('/auth', authRoutes);

app.get('/', (req, res) => {
  res.json({
    name: 'AMC Portail API',
    version: '1.0.0',
    description: 'Portail d\'Inscription Scolaire — Association Partage et des Musulmans de Clamart',
  });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Route non trouvée' });
});

app.use((err, req, res, _next) => {
  console.error('Erreur non gérée:', err);
  res.status(500).json({ error: 'Erreur interne du serveur' });
});

const PORT = config.port;
const server = app.listen(PORT, () => {
  console.log(`
  🟢 AMC Portail API démarrée
  🌐 Port: ${PORT}
  📀 Environnement: ${config.nodeEnv}
  🔗 Frontend: ${config.frontendUrl}
  `);
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} déjà utilisé. Fermez l’autre instance ou changez la variable d’environnement PORT.`);
    process.exit(1);
  }
  console.error('Erreur du serveur :', error);
  process.exit(1);
});

module.exports = app;