const { listPoleClasses } = require('../services/poleManagerService');

async function getPoleClasses(req, res) {
  try {
    const classes = await listPoleClasses({ role: req.user.role });
    return res.json({ classes });
  } catch (error) {
    console.error('Erreur getPoleClasses:', error);
    return res.status(error.statusCode || 500).json({ error: error.message || 'Erreur serveur' });
  }
}

module.exports = { getPoleClasses };
