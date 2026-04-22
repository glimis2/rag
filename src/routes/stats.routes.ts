import { Router } from 'express';
import { StatsController } from '../controllers/stats.controller';
import { authMiddleware } from '../middleware/auth';

const router = Router();
const statsController = new StatsController();

router.get('/overview', authMiddleware, statsController.getOverview);
router.get('/trend', authMiddleware, statsController.getTrend);
router.get('/tool-distribution', authMiddleware, statsController.getToolDistribution);
router.get('/hot-kb', authMiddleware, statsController.getHotKb);
router.get('/response-time', authMiddleware, statsController.getResponseTime);

export default router;
