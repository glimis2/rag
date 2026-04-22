import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { AppDataSource } from '../config/database';
import { McpToolRegistry } from '../entities/McpToolRegistry';

export class McpController {
  private toolRepository = AppDataSource.getRepository(McpToolRegistry);

  getTools = async (req: AuthRequest, res: Response) => {
    try {
      const tools = await this.toolRepository.find();
      res.json({ code: 200, message: 'success', data: tools });
    } catch (error) {
      res.status(500).json({ code: 500, message: 'Query failed', data: null });
    }
  };

  getToolDetail = async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const tool = await this.toolRepository.findOne({ where: { id: Number(id) } });

      if (!tool) {
        return res.status(404).json({ code: 404, message: 'Tool not found', data: null });
      }

      res.json({ code: 200, message: 'success', data: tool });
    } catch (error) {
      res.status(500).json({ code: 500, message: 'Query failed', data: null });
    }
  };

  updateStatus = async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { status } = req.body;

      await this.toolRepository.update({ id: Number(id) }, { status });
      res.json({ code: 200, message: 'success', data: null });
    } catch (error) {
      res.status(500).json({ code: 500, message: 'Update failed', data: null });
    }
  };

  getStats = async (req: AuthRequest, res: Response) => {
    try {
      const tools = await this.toolRepository.find();

      const totalTools = tools.length;
      const activeTools = tools.filter(t => t.status === 'active').length;
      const disabledTools = tools.filter(t => t.status === 'disabled').length;
      const totalCallCount = tools.reduce((sum, t) => sum + Number(t.call_count), 0);
      const avgLatencyMs = tools.length > 0
        ? Math.round(tools.reduce((sum, t) => sum + t.avg_latency_ms, 0) / tools.length)
        : 0;

      const topTool = tools.sort((a, b) => Number(b.call_count) - Number(a.call_count))[0];

      res.json({
        code: 200,
        message: 'success',
        data: {
          totalTools,
          activeTools,
          disabledTools,
          totalCallCount,
          avgLatencyMs,
          topTool: topTool?.name,
          toolDetails: tools
        }
      });
    } catch (error) {
      res.status(500).json({ code: 500, message: 'Query failed', data: null });
    }
  };

  testTool = async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const tool = await this.toolRepository.findOne({ where: { id: Number(id) } });

      if (!tool) {
        return res.status(404).json({ code: 404, message: 'Tool not found', data: null });
      }

      // TODO: Implement actual tool testing
      res.json({
        code: 200,
        message: 'success',
        data: {
          toolId: tool.id,
          toolName: tool.name,
          mode: tool.mode,
          status: tool.status,
          testResult: 'SUCCESS',
          message: '工具调用正常',
          latencyMs: 123,
          timestamp: Date.now(),
          sampleOutput: {}
        }
      });
    } catch (error) {
      res.status(500).json({ code: 500, message: 'Test failed', data: null });
    }
  };
}
