/**
 * RAG Agent 核心类型定义
 *
 * 定义了多路检索、融合、重排序、压缩等核心接口
 */

/**
 * 统一的检索结果格式
 * 支持多种来源：向量数据库、BM25、Web搜索
 */
export interface RetrievedChunk {
  /** 唯一标识符 */
  id: string;

  /** 文本内容 */
  content: string;

  /** 来源类型 */
  source: 'vector' | 'bm25' | 'web';

  /** 原始分数（来自检索器） */
  score: number;

  /** 元数据 */
  metadata: {
    /** 文档ID（vector/bm25） */
    documentId?: number;

    /** 知识库ID（vector/bm25） */
    knowledgeBaseId?: number;

    /** 文档标题 */
    title?: string;

    /** URL（web） */
    url?: string;

    /** 发布时间（web） */
    publishedDate?: string;

    /** 其他自定义字段 */
    [key: string]: any;
  };

  /** 重排序后的分数（可选） */
  rerankedScore?: number;

  /** 最终融合分数（可选） */
  fusedScore?: number;
}

/**
 * 统一的检索器接口
 * 所有检索器（向量、BM25、Web）都实现此接口
 */
export interface Retriever {
  /**
   * 执行检索
   * @param query 查询文本
   * @param options 检索选项
   * @returns 检索结果列表
   */
  retrieve(query: string, options: RetrievalOptions): Promise<RetrievedChunk[]>;

  /**
   * 检索器名称（用于日志和追踪）
   */
  readonly name: string;
}

/**
 * 检索选项
 */
export interface RetrievalOptions {
  /** 返回结果数量 */
  topK: number;

  /** 知识库ID列表（vector/bm25） */
  knowledgeBaseIds?: number[];

  /** 最小分数阈值 */
  minScore?: number;

  /** 其他自定义选项 */
  [key: string]: any;
}

/**
 * RRF 融合服务接口
 */
export interface FusionService {
  /**
   * 使用 RRF 算法融合多个检索结果列表
   * @param results 多个检索器的结果列表
   * @param k RRF 参数（默认 60）
   * @returns 融合并去重后的结果列表
   */
  fuse(results: RetrievedChunk[][], k?: number): RetrievedChunk[];
}

/**
 * 重排序服务接口
 */
export interface RerankerService {
  /**
   * 对检索结果进行重排序
   * @param query 原始查询
   * @param chunks 待重排序的结果列表
   * @param topK 返回前 K 个结果
   * @returns 重排序后的结果列表
   */
  rerank(query: string, chunks: RetrievedChunk[], topK: number): Promise<RetrievedChunk[]>;
}

/**
 * 上下文压缩器接口
 */
export interface ContextCompressor {
  /**
   * 压缩上下文以适应 Token 限制
   * @param chunks 检索结果列表
   * @param maxTokens 最大 Token 数
   * @returns 压缩后的结果列表
   */
  compress(chunks: RetrievedChunk[], maxTokens: number): RetrievedChunk[];

  /**
   * 计算文本的 Token 数量
   * @param text 文本内容
   * @returns Token 数量
   */
  countTokens(text: string): number;
}

/**
 * 检索配置
 */
export interface RetrievalConfig {
  /** 是否启用向量检索 */
  enableVector: boolean;

  /** 是否启用 BM25 检索 */
  enableBM25: boolean;

  /** 是否启用 Web 检索 */
  enableWeb: boolean;

  /** 向量检索 topK */
  vectorTopK: number;

  /** BM25 检索 topK */
  bm25TopK: number;

  /** Web 检索 topK */
  webTopK: number;

  /** 是否启用重排序 */
  enableRerank: boolean;

  /** 重排序后保留的结果数 */
  rerankTopK: number;

  /** 上下文最大 Token 数 */
  maxContextTokens: number;

  /** RRF 参数 k */
  rrfK: number;
}

/**
 * 检索结果统计
 */
export interface RetrievalStats {
  /** 向量检索结果数 */
  vectorCount: number;

  /** BM25 检索结果数 */
  bm25Count: number;

  /** Web 检索结果数 */
  webCount: number;

  /** 融合后结果数 */
  fusedCount: number;

  /** 重排序后结果数 */
  rerankedCount: number;

  /** 压缩后结果数 */
  compressedCount: number;

  /** 最终 Token 数 */
  finalTokens: number;

  /** 各阶段耗时（毫秒） */
  timings: {
    vector?: number;
    bm25?: number;
    web?: number;
    fusion?: number;
    rerank?: number;
    compression?: number;
    total: number;
  };
}
