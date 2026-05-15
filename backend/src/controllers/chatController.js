const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function findAdminUser() {
  let admin = await prisma.user.findFirst({
    where: { role: 'ADMIN' },
    orderBy: { createdAt: 'asc' },
  });
  if (admin) return admin;
  return prisma.user.findFirst({
    where: { role: 'SUPER_ADMIN' },
    orderBy: { createdAt: 'asc' },
  });
}

function serializeMessage(message, currentUserId) {
  return {
    id: message.id,
    body: message.body,
    senderId: message.senderId,
    recipientId: message.recipientId,
    createdAt: message.createdAt,
    read: message.read,
    sender: message.sender ? {
      id: message.sender.id,
      firstName: message.sender.firstName,
      lastName: message.sender.lastName,
      email: message.sender.email,
      role: message.sender.role,
    } : null,
    recipient: message.recipient ? {
      id: message.recipient.id,
      firstName: message.recipient.firstName,
      lastName: message.recipient.lastName,
      email: message.recipient.email,
      role: message.recipient.role,
    } : null,
    isMine: message.senderId === currentUserId,
  };
}

async function getAdminConversations(req, res) {
  try {
    const adminId = req.user.id;
    console.log('getAdminConversations adminId=', adminId);
    const messages = await prisma.chatMessage.findMany({
      where: {
        OR: [
          { senderId: adminId },
          { recipientId: adminId },
        ],
      },
      include: {
        sender: true,
        recipient: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const conversations = new Map();
    messages.forEach((message) => {
      const partner = message.senderId === adminId ? message.recipient : message.sender;
      if (!partner) return;
      const existing = conversations.get(partner.id);
      const unread = message.recipientId === adminId && !message.read ? 1 : 0;
      const lastMessageAt = existing?.lastMessageAt || message.createdAt;
      const lastMessage = existing?.lastMessage || message.body;
      const shouldUpdateLast = !existing || message.createdAt > existing.lastMessageAt;
      conversations.set(partner.id, {
        partner: {
          id: partner.id,
          firstName: partner.firstName,
          lastName: partner.lastName,
          email: partner.email,
          role: partner.role,
        },
        lastMessage: shouldUpdateLast ? message.body : lastMessage,
        lastMessageAt: shouldUpdateLast ? message.createdAt : lastMessageAt,
        unreadCount: (existing?.unreadCount || 0) + unread,
      });
    });

    const result = Array.from(conversations.values())
      .sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt));

    res.json({ conversations: result });
  } catch (error) {
    console.error('Erreur getAdminConversations:', error?.message, error?.stack);
    res.status(500).json({ error: 'Erreur lors du chargement des conversations' });
  }
}

async function getConversationMessages(req, res) {
  try {
    const adminId = req.user.id;
    const otherUserId = req.params.userId;
    const conversationUser = await prisma.user.findUnique({
      where: { id: otherUserId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
      },
    });

    if (!conversationUser) {
      return res.status(404).json({ error: 'Utilisateur introuvable' });
    }

    const messages = await prisma.chatMessage.findMany({
      where: {
        OR: [
          { senderId: adminId, recipientId: otherUserId },
          { senderId: otherUserId, recipientId: adminId },
        ],
      },
      include: {
        sender: true,
        recipient: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    await prisma.chatMessage.updateMany({
      where: {
        senderId: otherUserId,
        recipientId: adminId,
        read: false,
      },
      data: { read: true },
    });

    res.json({
      partner: conversationUser,
      messages: messages.map((message) => serializeMessage(message, adminId)),
    });
  } catch (error) {
    console.error('Erreur getConversationMessages:', error);
    res.status(500).json({ error: 'Erreur lors du chargement de la conversation' });
  }
}

async function postAdminChatMessage(req, res) {
  try {
    const adminId = req.user.id;
    const recipientId = req.params.userId;
    const { body } = req.body || {};
    if (!body || typeof body !== 'string' || !body.trim()) {
      return res.status(400).json({ error: 'Le message est requis' });
    }

    const recipient = await prisma.user.findUnique({ where: { id: recipientId } });
    if (!recipient) {
      return res.status(404).json({ error: 'Utilisateur destinataire introuvable' });
    }

    const message = await prisma.chatMessage.create({
      data: {
        senderId: adminId,
        recipientId,
        body: body.trim(),
        read: false,
      },
    });

    res.status(201).json({ message: serializeMessage(message, adminId) });
  } catch (error) {
    console.error('Erreur postAdminChatMessage:', error);
    res.status(500).json({ error: 'Erreur lors de l’envoi du message' });
  }
}

async function getMyChat(req, res) {
  try {
    const currentUserId = req.user.id;
    const admin = await findAdminUser();
    if (!admin) {
      return res.status(404).json({ error: 'Aucun administrateur disponible' });
    }

    const messages = await prisma.chatMessage.findMany({
      where: {
        OR: [
          { senderId: currentUserId, recipientId: admin.id },
          { senderId: admin.id, recipientId: currentUserId },
        ],
      },
      include: {
        sender: true,
        recipient: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    await prisma.chatMessage.updateMany({
      where: {
        senderId: admin.id,
        recipientId: currentUserId,
        read: false,
      },
      data: { read: true },
    });

    res.json({
      partner: {
        id: admin.id,
        firstName: admin.firstName,
        lastName: admin.lastName,
        email: admin.email,
        role: admin.role,
      },
      messages: messages.map((message) => serializeMessage(message, currentUserId)),
    });
  } catch (error) {
    console.error('Erreur getMyChat:', error);
    res.status(500).json({ error: 'Erreur lors du chargement du chat' });
  }
}

async function postMyChat(req, res) {
  try {
    const currentUserId = req.user.id;
    const admin = await findAdminUser();
    if (!admin) {
      return res.status(404).json({ error: 'Aucun administrateur disponible' });
    }

    const { body } = req.body || {};
    if (!body || typeof body !== 'string' || !body.trim()) {
      return res.status(400).json({ error: 'Le message est requis' });
    }

    const message = await prisma.chatMessage.create({
      data: {
        senderId: currentUserId,
        recipientId: admin.id,
        body: body.trim(),
        read: false,
      },
    });

    res.status(201).json({ message: serializeMessage(message, currentUserId) });
  } catch (error) {
    console.error('Erreur postMyChat:', error);
    res.status(500).json({ error: 'Erreur lors de l’envoi du message' });
  }
}

async function getChatThread(req, res) {
  try {
    const currentUserId = req.user.id;
    const otherUserId = req.params.id;

    // Vérifier que l'utilisateur peut discuter avec cette personne
    const otherUser = await prisma.user.findUnique({ where: { id: otherUserId } });
    if (!otherUser) {
      return res.status(404).json({ error: 'Utilisateur introuvable' });
    }

    // Pour les utilisateurs normaux, ils ne peuvent discuter qu'avec l'admin
    if (req.user.role === 'FAMILLE' || req.user.role === 'PROFESSEUR') {
      const admin = await findAdminUser();
      if (otherUserId !== admin.id) {
        return res.status(403).json({ error: 'Vous ne pouvez discuter qu\'avec l\'administrateur' });
      }
    }

    const messages = await prisma.chatMessage.findMany({
      where: {
        OR: [
          { senderId: currentUserId, recipientId: otherUserId },
          { senderId: otherUserId, recipientId: currentUserId },
        ],
      },
      include: {
        sender: true,
        recipient: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    // Marquer les messages comme lus si l'utilisateur actuel est le destinataire
    await prisma.chatMessage.updateMany({
      where: {
        senderId: otherUserId,
        recipientId: currentUserId,
        read: false,
      },
      data: { read: true },
    });

    const serializedMessages = messages.map(msg => serializeMessage(msg, currentUserId));
    res.json(serializedMessages);
  } catch (error) {
    console.error('Erreur getChatThread:', error);
    res.status(500).json({ error: 'Erreur lors du chargement des messages' });
  }
}

async function sendChatMessage(req, res) {
  try {
    console.log('sendChatMessage called for user=', req.user && req.user.id);
    const currentUserId = req.user.id;
    const { recipientId, body } = req.body;

    if (!body || !body.trim()) {
      return res.status(400).json({ error: 'Le message est requis' });
    }

    // Vérifier que le destinataire existe
    const recipient = await prisma.user.findUnique({ where: { id: recipientId } });
    if (!recipient) {
      return res.status(404).json({ error: 'Utilisateur destinataire introuvable' });
    }

    // Pour les utilisateurs normaux, ils ne peuvent envoyer qu'à l'admin
    if (req.user.role === 'FAMILLE' || req.user.role === 'PROFESSEUR') {
      const admin = await findAdminUser();
      if (recipientId !== admin.id) {
        return res.status(403).json({ error: 'Vous ne pouvez envoyer des messages qu\'à l\'administrateur' });
      }
    }

    const message = await prisma.chatMessage.create({
      data: {
        senderId: currentUserId,
        recipientId,
        body: body.trim(),
        read: false,
      },
      include: {
        sender: true,
        recipient: true,
      },
    });

    res.status(201).json(serializeMessage(message, currentUserId));
  } catch (error) {
    console.error('Erreur sendChatMessage:', error);
    res.status(500).json({ error: 'Erreur lors de l\'envoi du message' });
  }
}

module.exports = {
  getAdminConversations,
  getConversationMessages,
  postAdminChatMessage,
  getMyChat,
  postMyChat,
  getChatThread,
  sendChatMessage,
};
