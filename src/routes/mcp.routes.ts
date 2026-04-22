import { Router } from 'express';
import { McpController } from '../controllers/mcp.controller';
import { authMiddleware } from '../middleware/auth';

const router = Router();
const mcpController = new McpController();

router.get('/tools', authMiddleware, mcpController.getTools);
router.get('/tools/:id', authMiddleware, mcpController.getToolDetail);
router.put('/tools/:id/status', authMiddleware, mcpController.updateStatus);
router.get('/stats', authMiddleware, mcpController.getStats);
router.post('/tools/:id/test', authMiddleware, mcpController.testTool);

export default router;
