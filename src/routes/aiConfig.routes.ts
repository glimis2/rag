import { Router } from 'express';
import { AiConfigController } from '../controllers/aiConfig.controller';
import { authMiddleware } from '../middleware/auth';
import { adminMiddleware } from '../middleware/admin';

const router = Router();
const aiConfigController = new AiConfigController();

router.get('/list', authMiddleware, adminMiddleware, aiConfigController.list);
router.put('/batch', authMiddleware, adminMiddleware, aiConfigController.batchUpdate);
router.post('/reset/:groupName', authMiddleware, adminMiddleware, aiConfigController.resetGroup);
router.post('/reset-all', authMiddleware, adminMiddleware, aiConfigController.resetAll);
router.get('/models', authMiddleware, adminMiddleware, aiConfigController.getModels);

export default router;
