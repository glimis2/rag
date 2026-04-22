import { Router } from 'express';
import userRoutes from './user.routes';
import chatRoutes from './chat.routes';
import knowledgeRoutes from './knowledge.routes';
import aiConfigRoutes from './aiConfig.routes';
import mcpRoutes from './mcp.routes';
import statsRoutes from './stats.routes';

const router = Router();

router.use('/user', userRoutes);
router.use('/chat', chatRoutes);
router.use('/v2/chat', chatRoutes);
router.use('/knowledge', knowledgeRoutes);
router.use('/v2/kb', knowledgeRoutes);
router.use('/admin/ai-config', aiConfigRoutes);
router.use('/mcp', mcpRoutes);
router.use('/v2/stats', statsRoutes);
router.use('/kb/chunks', knowledgeRoutes);

export default router;
