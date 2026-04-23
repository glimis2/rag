# RAG Agent 完整重构设计文档

## 文档信息

- 创建日期: 2026-04-24
- 项目: DocMind RAG System
- 目标: 基于 DocMindAgent 分析文档，完整实现 ReAct 模式的 RAG Agent
- 实现方案: 混合式（核心功能优先）

## 概述

本设计文档描述了如何将当前的基础 RAG 系统重构为完整的 ReAct 模式 Agent，包含以下核心特性：

1. **多路检索**: 向量检索 + BM25 + Web 搜索
2. **智能融合**: RRF 融合 + Cross-Encoder 重排序
3. **智能缓存**: 基于查询频次的缓存策略
4. **LLM 工具选择**: 使用 Tool Calling 动态决策
5. **记忆系统**: 显式记忆提取与召回
6. **自纠错机制**: Self-Reflection（最多 3 轮）
7. **安全检查**: 紧急情况检测和降级处理
8. **上下文压缩**: Token 预算控制

## 实现策略

采用**三阶段渐进式实现**，每个阶段都能产出可用功能：

### 第一阶段：核心检索链路
- 多路检索（向量 + BM25 + Web）
- RRF 融合算法
- Cross-Encoder 重排序
- 上下文压缩

### 第二阶段：智能化增强
- Redis 智能缓存
- LLM 工具选择
- 工具执行框架

### 第三阶段：用户体验完善
- 用户记忆系统
- Self-Reflection 自纠错
- 安全检查与降级

---

## 第一阶段：核心检索链路

### 架构设计

#### 模块划分

```
src/services/
├── ragService.ts              # 主流程编排
├── retrieval/
│   ├── vectorRetriever.ts     # 向量检索器
│   ├── bm25Retriever.ts       # BM25 检索器（新增）
│   ├── webRetriever.ts        # Web 搜索检索器（新增）
│   ├── fusionService.ts       # RRF 融合服务（新增）
│   └── rerankerService.ts     # 重排序服务（新增）
├── compression/
│   └── contextCompressor.ts   # 上下文压缩（新增）
└── queryRewriter.ts           # Query 改写服务（新增）
```

#### 核心接口

```typescript
// 统一的检索结果格式
interface RetrievedChunk {
  id: string;
  content: string;
  score: number;
  source: 'vector' | 'bm25' | 'web' | 'hybrid';
  metadata: {
    source: string;
    chapter?: string;
    page?: number;
    category?: string;
    url?: string;
  };
}

// 检索器接口
interface Retriever {
  retrieve(query: string, topK: number): Promise<RetrievedChunk[]>;
}

// 融合服务接口
interface FusionService {
  fuse(results: RetrievedChunk[][]): RetrievedChunk[];
}

// 重排序服务接口
interface RerankerService {
  rerank(query: string, chunks: RetrievedChunk[], topK: number): Promise<RetrievedChunk[]>;
}

// 上下文压缩接口
interface ContextCompressor {
  compress(chunks: RetrievedChunk[], query: string, maxTokens: number): RetrievedChunk[];
}
```

### 数据流

```
用户问题
    ↓
Query 改写
    ↓
并行检索 ──┬── 向量检索 (Milvus)
           ├── BM25 检索 (本地倒排索引)
           └── Web 搜索 (Tavily API，可选)
    ↓
RRF 融合（合并多路结果）
    ↓
Cross-Encoder 重排序（精排 Top 10）
    ↓
上下文压缩（控制 Token 预算）
    ↓
Prompt 组装 → LLM 生成
```

### 技术选型

#### BM25 实现
**选择：自实现 BM25**
- 完全可控，可针对中文优化
- 便于后续扩展和调优
- 实现倒排索引结构

#### 重排序方案
**选择：Cohere Rerank API**
- 效果好，开箱即用
- 快速验证效果
- 后续可替换为本地模型

#### Web 搜索
**选择：Tavily API**
- 专为 RAG 设计
- 返回结构化结果
- 支持中文搜索

### BM25 算法设计

```typescript
class BM25Retriever implements Retriever {
  private invertedIndex: Map<string, PostingList>;
  private docLengths: Map<string, number>;
  private avgDocLength: number;
  private k1 = 1.5;  // 词频饱和参数
  private b = 0.75;  // 长度归一化参数
  
  // 构建倒排索引
  async buildIndex(chunks: Chunk[]): Promise<void>;
  
  // BM25 检索
  async retrieve(query: string, topK: number): Promise<RetrievedChunk[]>;
  
  // 计算 BM25 分数
  private calculateBM25Score(term: string, docId: string, queryTermFreq: number): number;
}
```

### RRF 融合算法

```typescript
class FusionService {
  private k = 60;  // RRF 常数
  
  fuse(results: RetrievedChunk[][]): RetrievedChunk[] {
    const scoreMap = new Map<string, number>();
    
    // 对每个检索结果列表
    for (const resultList of results) {
      resultList.forEach((chunk, rank) => {
        const chunkId = chunk.id;
        const rrfScore = 1 / (this.k + rank + 1);
        
        if (scoreMap.has(chunkId)) {
          scoreMap.set(chunkId, scoreMap.get(chunkId)! + rrfScore);
        } else {
          scoreMap.set(chunkId, rrfScore);
        }
      });
    }
    
    // 按融合分数排序
    return Array.from(scoreMap.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([id, score]) => findChunkById(id, results));
  }
}
```

### 上下文压缩

```typescript
class ContextCompressor {
  compress(
    chunks: RetrievedChunk[],
    query: string,
    maxTokens: number
  ): RetrievedChunk[] {
    const compressed: RetrievedChunk[] = [];
    let totalTokens = 0;
    
    for (const chunk of chunks) {
      // 句子级过滤
      const sentences = this.splitSentences(chunk.content);
      const relevantSentences = sentences.filter(sentence => 
        this.isRelevant(sentence, query)
      );
      
      const compressedContent = relevantSentences.join(' ');
      const tokens = this.countTokens(compressedContent);
      
      if (totalTokens + tokens > maxTokens) {
        // 达到上限，截断
        const remainingTokens = maxTokens - totalTokens;
        if (remainingTokens > 50) {
          chunk.content = this.truncateToTokens(compressedContent, remainingTokens);
          compressed.push(chunk);
        }
        break;
      }
      
      chunk.content = compressedContent;
      compressed.push(chunk);
      totalTokens += tokens;
    }
    
    return compressed;
  }
}
```

### 错误处理策略

- **向量检索失败**: 降级到 BM25
- **BM25 检索失败**: 仅使用向量检索
- **重排序失败**: 使用融合后的原始排序
- **Web 搜索超时**: 跳过 Web 结果，仅使用本地检索

---

## 第二阶段：智能化增强

### 架构设计

#### 模块划分

```
src/services/
├── cache/
│   ├── ragCacheService.ts     # RAG 缓存服务（新增）
│   └── redisClient.ts         # Redis 客户端封装（新增）
├── tools/
│   ├── toolRegistry.ts        # 工具注册表（新增）
│   ├── toolExecutor.ts        # 工具执行器（新增）
│   └── tools/
│       ├── docSearchTool.ts   # 文档检索工具
│       ├── webSearchTool.ts   # Web 搜索工具
│       └── memoryTool.ts      # 记忆召回/存储工具
└── llm/
    └── toolCallingService.ts  # LLM 工具调用服务（新增）
```

### 智能缓存设计

#### 缓存结构

```typescript
interface CachedResult {
  answer: string;
  sources: SourceInfo[];
  retrievalLog: RetrievalLog;
  agentTrace: any[];
  timestamp: number;
  isFallback: boolean;
}

interface RagCacheService {
  normalize(query: string): string;
  incrementFrequency(normalizedQuery: string): Promise<number>;
  getCache(normalizedQuery: string): Promise<CachedResult | null>;
  putCache(normalizedQuery: string, result: CachedResult, frequency: number): Promise<void>;
  replayCache(cached: CachedResult, sse: SSE): Promise<void>;
}
```

#### 缓存策略

- **频次驱动**: 只有查询频次 ≥ 3 次才写入缓存
- **TTL**: 缓存有效期 1 小时
- **归一化**: 去除标点、统一大小写，相似问题命中同一缓存
- **流式回放**: 每 30 字符一批推送，模拟真实生成

#### Redis 数据结构

```
# 查询频次
freq:{normalized_query} -> integer (TTL: 24h)

# 缓存结果
cache:{normalized_query} -> JSON (TTL: 1h)

# 用户记忆
memory:{user_id}:{topic} -> JSON (TTL: 30d)
```

### LLM 工具选择设计

#### 工具定义

```typescript
interface Tool {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, any>;
    required: string[];
  };
  execute: (params: any) => Promise<any>;
}

interface ToolCallingService {
  selectTools(query: string, availableTools: Tool[]): Promise<ToolCall[]>;
  executeTools(toolCalls: ToolCall[]): Promise<ToolResult[]>;
}
```

#### 可用工具列表

1. **doc_search** - 文档检索（向量 + BM25 + 重排序）
2. **web_search** - 网络搜索（Tavily API）
3. **recall_memory** - 召回用户记忆
4. **store_memory** - 存储用户偏好

#### 实现方案（Vercel AI SDK）

```typescript
import { generateText, tool } from 'ai';
import { z } from 'zod';

const tools = {
  doc_search: tool({
    description: '在知识库中搜索相关文档',
    parameters: z.object({
      query: z.string().describe('搜索查询'),
      topK: z.number().default(10),
    }),
    execute: async ({ query, topK }) => {
      return await docSearchTool.execute(query, topK);
    },
  }),
  
  web_search: tool({
    description: '在互联网上搜索最新信息',
    parameters: z.object({
      query: z.string(),
      maxResults: z.number().default(5),
    }),
    execute: async ({ query, maxResults }) => {
      return await webSearchTool.execute(query, maxResults);
    },
  }),
};

const result = await generateText({
  model: openai('gpt-4'),
  tools,
  maxSteps: 3,
  prompt: `用户问题：${question}\n\n请选择合适的工具来回答这个问题。`,
});
```

### 数据流

```
用户问题
    ↓
缓存检查 ──→ 命中 ──→ 流式回放 ──→ 返回
    ↓ 未命中
Query 改写
    ↓
LLM 工具选择 ──→ 决定使用哪些工具
    ↓
并行执行工具 ──┬── doc_search
                ├── web_search (可选)
                └── recall_memory (可选)
    ↓
RRF 融合 + 重排序
    ↓
上下文压缩
    ↓
LLM 生成
    ↓
写入缓存（如果频次 >= 3）
```

### 错误处理

- **Redis 连接失败**: 跳过缓存，直接执行检索
- **工具调用失败**: 降级到规则检索（不使用 LLM 决策）
- **LLM 工具选择超时**: 使用默认工具组合（doc_search）

---

## 第三阶段：用户体验完善

### 架构设计

#### 模块划分

```
src/services/
├── memory/
│   ├── memoryService.ts           # 记忆管理服务（新增）
│   ├── memoryExtractor.ts         # 显式记忆提取（新增）
│   └── memoryRetriever.ts         # 记忆召回（新增）
├── reflection/
│   ├── selfReflectionService.ts   # 自纠错服务（新增）
│   └── answerEvaluator.ts         # 答案质量评估（新增）
├── safety/
│   ├── safetyGuard.ts             # 安全检查服务（新增）
│   └── emergencyDetector.ts       # 紧急情况检测（新增）
└── prompt/
    └── promptAssembler.ts         # Prompt 组装服务（新增）
```

### 记忆系统设计

#### 数据结构

```typescript
interface UserMemory {
  userId: number;
  topic: string;
  content: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

interface MemoryService {
  extractMemory(question: string): Promise<Record<string, any>>;
  storeMemory(userId: number, topic: string, content: Record<string, any>): Promise<void>;
  recallMemory(userId: number, query: string): Promise<Record<string, any>>;
  mergeMemoryToContext(memory: Record<string, any>): string;
}
```

#### 记忆提取示例

```typescript
// 输入：用户说 "我对青霉素过敏"
// 输出：{ "allergy": ["青霉素"] }

// 输入：用户说 "我喜欢简洁的回答"
// 输出：{ "preference": { "answer_style": "concise" } }
```

#### 存储策略

- **Redis**: 短期记忆（30天 TTL）
- **MySQL**: 长期记忆（永久存储）

#### 数据库表设计

```sql
CREATE TABLE user_memory (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  topic VARCHAR(50) NOT NULL,
  content JSON NOT NULL,
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_user_topic (user_id, topic)
);
```

### Self-Reflection 自纠错设计

#### 核心接口

```typescript
interface ReflectionResult {
  confidence: number;
  issues: string[];
  suggestions: string[];
}

interface SelfReflectionService {
  evaluateAnswer(
    question: string,
    chunks: RetrievedChunk[],
    answer: string
  ): Promise<ReflectionResult>;
  
  regenerateAnswer(
    question: string,
    chunks: RetrievedChunk[],
    previousAnswer: string,
    reflection: ReflectionResult
  ): Promise<string>;
  
  reflect(
    question: string,
    chunks: RetrievedChunk[],
    answer: string,
    isStreaming: boolean
  ): Promise<string>;
}
```

#### 反思流程

```
生成答案
    ↓
评估质量 ──→ 置信度 > 0.8 ──→ 返回答案
    ↓ 置信度 ≤ 0.8
检查是否流式 ──→ 是 ──→ 添加提示后返回
    ↓ 否
重新生成（最多 3 轮）
    ↓
返回改进后的答案
```

#### 评估标准

1. 答案是否基于检索到的知识？
2. 答案是否完整回答了问题？
3. 答案是否存在事实错误？
4. 答案是否存在逻辑矛盾？
5. 答案是否过于简略或冗长？

### 安全检查设计

#### 核心接口

```typescript
interface SafetyGuard {
  isEmergency(question: string): boolean;
  needsFallback(chunks: RetrievedChunk[]): boolean;
  getEmergencyNotice(): string;
  getFallbackNotice(): string;
}
```

#### 紧急关键词

```typescript
const emergencyKeywords = [
  '胸痛', '呼吸困难', '大出血', '昏迷', '休克',
  '心脏骤停', '中毒', '严重外伤', '窒息'
];
```

#### 降级条件

- 检索结果数量 < 3
- 所有结果的平均分数 < 0.5
- 检索失败或超时

### Prompt 组装设计

#### 核心接口

```typescript
interface PromptAssembler {
  assemble(
    question: string,
    chunks: RetrievedChunk[],
    memory: Record<string, any>,
    history: string
  ): string;
  
  assembleFallback(question: string, history: string): string;
  assembleEmergency(question: string): string;
}
```

#### Prompt 结构（正常模式）

```
你是一个专业的AI助手。请根据提供的上下文信息准确回答用户的问题。

## 检索到的知识
[文档1] 来源: xxx
内容...

[文档2] 来源: yyy
内容...

## 用户偏好
- allergy: ["青霉素"]
- preference: { "answer_style": "concise" }

## 对话历史
用户: 之前的问题
助手: 之前的回答

## 用户问题
当前问题

## 回答要求
1. 基于检索到的知识回答
2. 考虑用户的历史偏好
3. 如果知识不足，明确说明
4. 使用专业但易懂的语言
```

### 完整数据流

```
用户问题
    ↓
缓存检查 ──→ 命中 ──→ 返回
    ↓ 未命中
Query 改写
    ↓
显式记忆提取 ──→ 存储到 Redis/MySQL
    ↓
召回历史记忆
    ↓
LLM 工具选择
    ↓
并行执行工具
    ↓
RRF 融合 + 重排序
    ↓
安全检查 ──→ 紧急情况 ──→ 返回紧急提示
    ↓ 正常
    ├→ 降级 ──→ 使用 Fallback Prompt
    ↓ 正常
上下文压缩
    ↓
Prompt 组装（包含记忆和历史）
    ↓
LLM 生成
    ↓
Self-Reflection ──→ 置信度低 ──→ 重新生成（最多3轮）
    ↓ 置信度高
保存答案 + 写入缓存
    ↓
返回结果
```

### 错误处理

- **记忆提取失败**: 跳过记忆，继续检索
- **反思评估失败**: 直接返回原始答案
- **安全检查失败**: 默认为非紧急情况
- **Prompt 组装失败**: 使用简化版 Prompt

---

## 技术栈总结

### 核心依赖

```json
{
  "dependencies": {
    "express": "^4.18.2",
    "typeorm": "^0.3.17",
    "mysql2": "^3.6.0",
    "redis": "^4.6.0",
    "langchain": "^0.1.0",
    "ai": "^3.0.0",
    "@ai-sdk/openai": "^0.0.20",
    "zod": "^3.22.0",
    "cohere-ai": "^7.0.0",
    "natural": "^6.0.0",
    "gpt-tokenizer": "^2.0.0",
    "sse-express": "^1.0.0"
  }
}
```

### 外部服务

- **向量数据库**: Milvus
- **关系数据库**: MySQL 8.0+
- **缓存**: Redis 7.0+
- **LLM**: DeepSeek / OpenAI
- **重排序**: Cohere Rerank API
- **Web 搜索**: Tavily API

---

## SSE 事件设计

### 事件类型

```typescript
// 会话创建
{ event: 'conversation', data: { conversationId: number } }

// Thought 步骤
{ event: 'thought', data: { step: number, name: string } }

// Query 改写
{ event: 'rewrite', data: { original: string, rewritten: string } }

// 文档范围决策
{ event: 'scope', data: { mode: string, kbIds: string[] } }

// 工具选择
{ event: 'tool_selection', data: { tools: string[] } }

// 检索结果
{ event: 'retrieval', data: { totalCount: number, tools: string[], mode: string } }

// 融合与重排
{ event: 'rerank', data: { beforeCount: number, afterCount: number } }

// 上下文压缩
{ event: 'compression', data: { beforeTokens: number, afterTokens: number } }

// 开始生成
{ event: 'start', data: { message: string } }

// Token 流式输出
{ event: 'token', data: { content: string } }

// 反思结果
{ event: 'reflection', data: { round: number, confidence: number, issues: string[] } }

// 完成
{ event: 'done', data: { 
  sources: SourceInfo[], 
  isFallback: boolean,
  isEmergency: boolean,
  responseTime: number,
  conversationId: number,
  retrievalLog: RetrievalLog,
  agentTrace: any[]
}}

// 错误
{ event: 'error', data: { message: string } }
```

---

## 性能优化建议

### 1. 并行处理

- 向量检索、BM25、Web 搜索并行执行
- 记忆提取和检索并行
- 使用 Promise.all() 优化

### 2. 缓存策略

- 频次驱动的智能缓存
- 查询归一化提高命中率
- Redis 连接池复用

### 3. 索引优化

- BM25 倒排索引预构建
- 定期更新索引
- 增量索引更新

### 4. Token 控制

- 上下文压缩减少 LLM 成本
- 句子级相关性过滤
- 动态 Token 预算调整

---

## 测试策略

### 单元测试

- 每个服务独立测试
- Mock 外部依赖
- 覆盖率 > 80%

### 集成测试

- 端到端流程测试
- 多路检索融合测试
- 缓存命中率测试

### 性能测试

- 检索延迟 < 500ms
- 生成延迟 < 2s
- 并发支持 100+ QPS

---

## 部署建议

### Docker Compose

```yaml
version: '3.8'
services:
  app:
    build: .
    ports:
      - "3000:3000"
    depends_on:
      - mysql
      - redis
      - milvus
  
  mysql:
    image: mysql:8.0
    environment:
      MYSQL_ROOT_PASSWORD: password
      MYSQL_DATABASE: docmind
  
  redis:
    image: redis:7.0
  
  milvus:
    image: milvusdb/milvus:latest
```

### 环境变量

```env
# LLM
DEEPSEEK_API_KEY=xxx

# 重排序
COHERE_API_KEY=xxx

# Web 搜索
TAVILY_API_KEY=xxx

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# 缓存配置
CACHE_FREQ_THRESHOLD=3
CACHE_TTL=3600
```

---

## 监控指标

### 关键指标

- 检索召回率
- 重排序效果
- 缓存命中率
- 平均响应时间
- 错误率
- Token 消耗

### 日志记录

- 每个 Thought 步骤的执行时间
- 工具调用记录
- 错误堆栈
- 用户反馈

---

## 总结

本设计文档描述了一个完整的 ReAct 模式 RAG Agent 系统，采用三阶段渐进式实现：

1. **第一阶段**：核心检索链路（多路检索 + 融合 + 重排序）
2. **第二阶段**：智能化增强（缓存 + LLM 工具选择）
3. **第三阶段**：用户体验完善（记忆 + 自纠错 + 安全检查）

每个阶段都有明确的价值产出，风险可控，便于迭代优化。
