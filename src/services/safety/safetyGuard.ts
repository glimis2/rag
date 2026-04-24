/**
 * 安全检查服务
 *
 * 检测紧急情况和降级条件
 */

import { RetrievedChunk } from '../rag/types';

/**
 * 安全检查结果
 */
export interface SafetyCheckResult {
  /** 是否为紧急情况 */
  isEmergency: boolean;

  /** 是否需要降级 */
  needsFallback: boolean;

  /** 检测到的紧急关键词 */
  emergencyKeywords?: string[];

  /** 降级原因 */
  fallbackReason?: string;
}

/**
 * 安全检查服务
 */
export class SafetyGuard {
  // 紧急关键词列表（医疗、法律、金融等敏感领域）
  private readonly emergencyKeywords = [
    // 医疗紧急
    '胸痛',
    '呼吸困难',
    '大出血',
    '昏迷',
    '休克',
    '心脏骤停',
    '中毒',
    '严重外伤',
    '窒息',
    '自杀',
    '自残',
    // 法律紧急
    '报警',
    '紧急求助',
    '人身威胁',
    // 金融风险
    '破产',
    '诈骗',
  ];

  /**
   * 执行安全检查
   * @param query 用户查询
   * @param chunks 检索结果
   * @returns 安全检查结果
   */
  check(query: string, chunks: RetrievedChunk[]): SafetyCheckResult {
    // 1. 检查紧急情况
    const emergencyCheck = this.checkEmergency(query);

    // 2. 检查是否需要降级
    const fallbackCheck = this.checkFallback(chunks);

    return {
      isEmergency: emergencyCheck.isEmergency,
      needsFallback: fallbackCheck.needsFallback,
      emergencyKeywords: emergencyCheck.keywords,
      fallbackReason: fallbackCheck.reason,
    };
  }

  /**
   * 检查紧急情况
   */
  private checkEmergency(query: string): {
    isEmergency: boolean;
    keywords: string[];
  } {
    const lowerQuery = query.toLowerCase();
    const detectedKeywords: string[] = [];

    for (const keyword of this.emergencyKeywords) {
      if (lowerQuery.includes(keyword)) {
        detectedKeywords.push(keyword);
      }
    }

    return {
      isEmergency: detectedKeywords.length > 0,
      keywords: detectedKeywords,
    };
  }

  /**
   * 检查是否需要降级
   */
  private checkFallback(chunks: RetrievedChunk[]): {
    needsFallback: boolean;
    reason?: string;
  } {
    // 1. 检查结果数量
    if (chunks.length === 0) {
      return {
        needsFallback: true,
        reason: '未检索到相关文档',
      };
    }

    if (chunks.length < 3) {
      return {
        needsFallback: true,
        reason: '检索结果数量不足',
      };
    }

    // 2. 检查平均分数
    const avgScore =
      chunks.reduce((sum, chunk) => sum + chunk.score, 0) / chunks.length;

    if (avgScore < 0.5) {
      return {
        needsFallback: true,
        reason: '检索结果相关性较低',
      };
    }

    return {
      needsFallback: false,
    };
  }

  /**
   * 获取紧急情况提示
   */
  getEmergencyNotice(): string {
    return `

⚠️ 重要提示：检测到您的问题可能涉及紧急情况。

如果您正面临医疗紧急情况，请立即：
- 拨打急救电话 120
- 前往最近的医院急诊科
- 联系您的医生

如果您正面临人身安全威胁，请立即：
- 拨打报警电话 110
- 前往安全的地方
- 联系家人或朋友

AI 助手无法替代专业的医疗、法律或紧急救援服务。`;
  }

  /**
   * 获取降级提示
   */
  getFallbackNotice(reason?: string): string {
    return `

💡 提示：${reason || '未找到足够相关的信息'}，以下回答基于通用知识。

建议：
- 尝试换一种方式提问
- 提供更多上下文信息
- 咨询相关领域的专业人士`;
  }
}
