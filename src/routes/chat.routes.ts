import { Router } from 'express';
import { ChatController } from '../controllers/chat.controller';
import { authMiddleware } from '../middleware/auth';

const router = Router();
const chatController = new ChatController();

router.get('/stream', authMiddleware, chatController.stream);
router.get('/conversations', authMiddleware, chatController.getConversations);
router.get('/history/:conversationId', authMiddleware, chatController.getHistory);
router.delete('/conversations/:conversationId', authMiddleware, chatController.deleteConversation);
router.post('/feedback', authMiddleware, chatController.submitFeedback);
router.get('/export/:conversationId', authMiddleware, chatController.exportConversation);
router.get('/agent-trace/:messageId', authMiddleware, chatController.getAgentTrace);

export default router;
