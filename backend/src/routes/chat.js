const { Router } = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const {
  getAdminConversations,
  getConversationMessages,
  postAdminChatMessage,
  getMyChat,
  postMyChat,
  getChatThread,
  sendChatMessage,
} = require('../controllers/chatController');

const router = Router();
// Log incoming requests for easier debugging of 404/parse issues
router.use((req, res, next) => {
  try {
    console.log('chat route ->', req.method, req.originalUrl, 'auth=', !!req.headers.authorization, 'ct=', req.headers['content-type']);
  } catch (e) {
    // ignore
  }
  next();
});

router.use(authenticate);

router.get('/admin/conversations', authorize('ADMIN', 'SUPER_ADMIN'), getAdminConversations);
router.get('/admin/conversations/:userId', authorize('ADMIN', 'SUPER_ADMIN'), getConversationMessages);
router.post('/admin/conversations/:userId', authorize('ADMIN', 'SUPER_ADMIN'), postAdminChatMessage);

router.get('/teacher', authorize('PROFESSEUR'), getMyChat);
router.post('/teacher', authorize('PROFESSEUR'), postMyChat);

router.get('/family', authorize('FAMILLE'), getMyChat);
router.post('/family', authorize('FAMILLE'), postMyChat);

// Routes génériques pour le chatbot flottant
router.get('/thread/:id', getChatThread);
router.post('/send', sendChatMessage);

// Dump registered chat routes for debugging
try {
  const routes = router.stack
    .filter((s) => s.route)
    .map((s) => {
      const methods = Object.keys(s.route.methods).join(',');
      return `${methods.toUpperCase()} ${s.route.path}`;
    });
  console.log('chat registered routes ->', routes.join(' | '));
} catch (e) {
  // ignore
}

module.exports = router;
