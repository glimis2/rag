# DocMindAgent Execute 方法执行流程分析与教程

## 文档信息

- 创建日期: 2026-04-23
- 目标读者: Node.js 开发者学习 RAG 相关内容
- 分析对象: DocMindAgent.java 的 execute 方法

## 概述

DocMindAgent 是一个基于 ReAct (Reasoning + Acting) 模式的 RAG (Retrieval-Augmented Generation) Agent 系统。它实现了一个完整的智能问答流程，包括多路检索、结果融合、重排序、上下文压缩和自纠错机制。


## 第一部分：核心架构概览

### 系统特点

1. **ReAct 推理模式**: 6 步思考-行动循环
2. **多路检索**: 向量检索 + BM25 + Web 搜索
3. **LLM 驱动工具选择**: 使用 Tool Calling 动态决策
4. **智能融合与重排**: RRF 融合 + Cross-Encoder 重排序
5. **上下文压缩**: 控制 token 预算
6. **自纠错机制**: Self-Reflection (最多 3 轮)
7. **智能缓存**: 基于查询频次的缓存策略
8. **流式输出**: SSE (Server-Sent Events) 实时推送

### 技术栈

- **框架**: Spring Boot + Spring AI
- **LLM**: 通过 AiConfigHolder 动态配置
- **向量数据库**: Milvus
- **全文检索**: BM25 (自实现)
- **数据库**: MyBatis Plus
- **流式通信**: SSE (SseEmitter)


## 第二部分：Execute 方法执行流程详解

### 主入口方法签名

```java
public Long execute(String userId, Long conversationId, String question, 
                    List<Long> kbIds, SseEmitter emitter)
```

**参数说明:**
- `userId`: 用户 ID（字符串格式，兼容 Long 和 UUID）
- `conversationId`: 会话 ID（null 时自动创建新会话）
- `question`: 用户提出的问题
- `kbIds`: 知识库 ID 列表（可选，用于文档直读模式）
- `emitter`: SSE 发射器，用于流式推送事件

**返回值:** 会话 ID (Long)

### 执行流程的 5 个阶段

#### 阶段 1: 初始化与会话管理 (122-135 行)

```java
// 1. 创建 AgentState 状态对象
AgentState state = new AgentState();
state.setUserId(userId);
state.setConversationId(conversationId);
state.setQuery(question);
state.setKbIds(kbIds != null ? new ArrayList<>(kbIds) : new ArrayList<>());

// 2. 获取或创建会话
QaConversation conversation = getOrCreateConversation(userId, conversationId, question, kbIds);
state.setConversationId(conversation.getId());

// 3. 保存用户消息到数据库
saveQaMessage(conversation.getId(), "user", question, null, null, null, null);
```

**关键点:**
- `AgentState` 是贯穿整个推理过程的状态容器
- 会话管理支持多轮对话
- 每条用户消息都会持久化到数据库


#### 阶段 2: 智能缓存检查 (136-149 行)

```java
// 1. 查询归一化（去除标点、统一大小写等）
String normalized = ragCacheService.normalize(question);

// 2. 增加查询频次计数
long frequency = ragCacheService.incrementFrequency(normalized);

// 3. 如果频次达到阈值且缓存命中，直接回放
int freqThreshold = safeGetInt("cache.freq_threshold", 3);
if (frequency >= freqThreshold) {
    RagCachedResult cached = ragCacheService.getCache(normalized);
    if (cached != null) {
        replayFromCache(conversation, cached, startTime, emitter, state);
        return conversation.getId();
    }
}
```

**缓存策略:**
- **频次驱动**: 只有查询频次 ≥ 3 次才会写入缓存
- **归一化**: 相似问题会命中同一缓存
- **模拟流式**: 缓存回放时每 30 字符一批推送，模拟真实生成

**Node.js 实现建议:**
```typescript
// 使用 Redis 实现频次统计和缓存
class RagCacheService {
  async incrementFrequency(normalized: string): Promise<number> {
    return await redis.incr(`freq:${normalized}`);
  }
  
  async getCache(normalized: string): Promise<CachedResult | null> {
    const cached = await redis.get(`cache:${normalized}`);
    return cached ? JSON.parse(cached) : null;
  }
  
  async putCache(normalized: string, result: CachedResult, frequency: number) {
    if (frequency >= 3) {
      await redis.setex(`cache:${normalized}`, 3600, JSON.stringify(result));
    }
  }
}
```


#### 阶段 3: ReAct 推理循环 (152-154 行)

```java
try {
    runReActLoop(state, conversation, startTime, emitter, normalized, frequency);
} catch (Exception e) {
    log.error("[DocMindAgent] 推理执行异常", e);
    sendSseEvent(emitter, "error", Map.of("message", "系统异常：" + e.getMessage()));
    emitter.completeWithError(e);
}
```

这是核心推理逻辑的入口，包含 6 个 Thought 步骤（详见下一节）。

---

## 第三部分：ReAct 推理循环的 6 个 Thought 步骤

### Thought 1: Query 改写 (173-185 行)

**目的:** 提升检索召回率

```java
// 使用 QueryRewriter 改写查询
String rewrittenQuery = queryRewriter.rewrite(question);
state.setRewrittenQuery(rewrittenQuery);

// 发送 SSE 事件
sendSseEvent(emitter, "rewrite", Map.of(
    "original", question,
    "rewritten", rewrittenQuery
));
```

**改写策略示例:**
- 原始问题: "糖尿病怎么治？"
- 改写后: "糖尿病的治疗方法和药物选择"

**Node.js 实现:**
```typescript
class QueryRewriter {
  async rewrite(question: string): Promise<string> {
    const prompt = `将以下用户问题改写为更适合检索的查询语句：
    
用户问题: ${question}

改写要求:
1. 补充关键医学术语
2. 扩展缩写
3. 明确查询意图
4. 保持简洁

改写后的查询:`;

    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3
    });
    
    return response.choices[0].message.content.trim();
  }
}
```


### Thought 2: 文档直读 & 显式记忆写入 (187-200 行)

**两个并行操作:**

#### 2.1 文档直读决策

```java
boolean documentScopedRetrieval = selectedDocumentScopeDecider.shouldDirectRead(
    state.getKbIds(), question
);
state.setDocumentScopedRetrieval(documentScopedRetrieval);
```

**文档直读模式的触发条件:**
- 用户明确选择了特定文档（kbIds 不为空）
- 问题适合直接从文档中提取（如"总结这份报告"）

**直读 vs 检索的区别:**
- **直读模式**: 从选中文档均匀采样 chunks，不做相似度计算
- **检索模式**: 使用向量/BM25 检索，基于相似度排序

#### 2.2 显式记忆提取与存储

```java
Map<String, Object> explicitMemory = explicitMemoryExtractor.extract(question);
if (!explicitMemory.isEmpty()) {
    Map<String, Object> storeResult = memoryTool.storeMemory(
        state.getUserId(), explicitMemory
    );
    state.getMemoryContext().putAll(explicitMemory);
}
```

**显式记忆示例:**
- 用户说: "我对青霉素过敏"
- 提取: `{ "allergy": ["青霉素"] }`
- 存储到用户偏好数据库

**Node.js 实现:**
```typescript
class ExplicitMemoryExtractor {
  async extract(question: string): Promise<Record<string, any>> {
    const prompt = `从用户问题中提取需要记住的偏好或事实：

用户问题: ${question}

提取规则:
- 过敏信息
- 疾病史
- 用药偏好
- 其他需要长期记住的信息

以 JSON 格式返回，如果没有则返回 {}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" }
    });
    
    return JSON.parse(response.choices[0].message.content);
  }
}
```


### Thought 3: LLM 驱动工具选择 & 多路召回 (202-222 行)

这是整个系统最核心的部分，实现了 **LLM 自主决策调用哪些检索工具**。

#### 3.1 两种检索模式

```java
List<RetrievedChunk> allChunks;
if (documentScopedRetrieval) {
    // 模式 A: 文档直读
    allChunks = retrieveSelectedDocumentChunks(state);
    if (allChunks.isEmpty()) {
        // 回退到 LLM 驱动检索
        allChunks = llmDrivenRetrieve(state, rewrittenQuery, emitter);
    }
} else {
    // 模式 B: LLM 驱动检索
    allChunks = llmDrivenRetrieve(state, rewrittenQuery, emitter);
}
```

#### 3.2 LLM 驱动检索的核心实现 (352-413 行)

**关键技术: Spring AI Tool Calling**

```java
// 1. 激活 ThreadLocal 上下文
AgentToolContext.activate(state.getKbIds(), state.getUserId());

try {
    // 2. 构建 ChatClient，注入工具
    ChatClient agentClient = ChatClient.builder(aiConfigHolder.getChatModel())
        .defaultSystem(AGENT_RETRIEVAL_SYSTEM_PROMPT)
        .defaultTools(toolCallbackProvider)  // 注册所有 MCP 工具
        .build();
    
    // 3. LLM 自主决策并调用工具
    agentClient.prompt()
        .user(rewrittenQuery)
        .call()
        .content();
    
    // 4. 从 ThreadLocal 收集结果
    List<RetrievedChunk> chunks = AgentToolContext.get().getChunks();
    Map<String, Object> memory = AgentToolContext.get().getMemoryContext();
    List<String> calledTools = AgentToolContext.get().getCalledTools();
    
    state.setSelectedTools(calledTools);
    return chunks;
    
} catch (Exception e) {
    // 5. 降级到规则路由
    return fallbackMultiRetrieve(state, rewrittenQuery, emitter);
} finally {
    AgentToolContext.clear();
}
```


#### 3.3 System Prompt 设计 (61-70 行)

```java
private static final String AGENT_RETRIEVAL_SYSTEM_PROMPT = """
    你是知识检索助手，负责调用工具收集与用户问题相关的信息。

    调用规则：
    - 默认调用 doc_search（语义检索），topK 设为 15，kbIds 留空
    - 条款/法规/编号/精确术语查询：同时调用 keyword_search，kbIds 留空
    - 问题涉及最新动态、时效性信息（含年份/近期/最新等词）：同时调用 web_search，maxResults 设为 5
    - 追问/个性化问题：先调用 recall_memory，userId 和 topic 留空
    - 不要生成最终答案，工具调用完成后只需回复"检索完成"
    """;
```

**关键设计点:**
1. **明确角色**: 只负责检索，不生成答案
2. **规则清晰**: 什么情况调用什么工具
3. **参数指导**: 告诉 LLM 如何设置参数
4. **防止越界**: 禁止生成最终答案

#### 3.4 可用的 MCP 工具

| 工具名 | 功能 | 参数 | 返回 |
|--------|------|------|------|
| `doc_search` | 向量语义检索 | query, topK, kbIds | RetrievedChunk[] |
| `keyword_search` | BM25 关键词检索 | query, kbIds, keywords | RetrievedChunk[] |
| `web_search` | 网络搜索 | query, maxResults | RetrievedChunk[] |
| `recall_memory` | 用户记忆召回 | userId, topic | Map<string, any> |
| `store_memory` | 存储用户偏好 | userId, prefs | Map<string, any> |


#### 3.5 Node.js 实现: LLM Tool Calling

**使用 Vercel AI SDK:**

```typescript
import { generateText, tool } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

class LLMDrivenRetriever {
  private tools = {
    doc_search: tool({
      description: '语义向量检索，适合概念性问题',
      parameters: z.object({
        query: z.string().describe('检索查询'),
        topK: z.number().default(15),
        kbIds: z.array(z.number()).optional()
      }),
      execute: async ({ query, topK, kbIds }) => {
        return await this.vectorRetriever.search(query, topK, kbIds);
      }
    }),
    
    keyword_search: tool({
      description: 'BM25 关键词检索，适合精确术语、编号查询',
      parameters: z.object({
        query: z.string(),
        kbIds: z.array(z.number()).optional(),
        keywords: z.array(z.string()).optional()
      }),
      execute: async ({ query, kbIds, keywords }) => {
        return await this.bm25Retriever.search(query, kbIds, keywords);
      }
    }),
    
    web_search: tool({
      description: '网络搜索，适合时效性信息',
      parameters: z.object({
        query: z.string(),
        maxResults: z.number().default(5)
      }),
      execute: async ({ query, maxResults }) => {
        return await this.webSearchTool.search(query, maxResults);
      }
    }),
    
    recall_memory: tool({
      description: '召回用户历史偏好和记忆',
      parameters: z.object({
        userId: z.string(),
        topic: z.string().optional()
      }),
      execute: async ({ userId, topic }) => {
        return await this.memoryTool.recall(userId, topic);
      }
    })
  };

  async retrieve(query: string, kbIds: number[], userId: string) {
    const result = await generateText({
      model: openai('gpt-4-turbo'),
      system: AGENT_RETRIEVAL_SYSTEM_PROMPT,
      prompt: query,
      tools: this.tools,
      maxToolRoundtrips: 5  // 允许多轮工具调用
    });
    
    // 收集所有工具调用的结果
    const chunks: RetrievedChunk[] = [];
    const calledTools: string[] = [];
    
    for (const step of result.steps) {
      if (step.toolCalls) {
        for (const toolCall of step.toolCalls) {
          calledTools.push(toolCall.toolName);
          if (Array.isArray(toolCall.result)) {
            chunks.push(...toolCall.result);
          }
        }
      }
    }
    
    return { chunks, calledTools };
  }
}
```


#### 3.6 降级路径: 规则检索 (429-503 行)

当 LLM Tool Calling 失败时，系统会降级到基于规则的检索：

```java
private List<RetrievedChunk> fallbackMultiRetrieve(AgentState state,
                                                    String rewrittenQuery,
                                                    SseEmitter emitter) {
    // 1. 使用 QueryRouter 进行意图识别
    QueryRouter.IntentResult intentResult = queryRouter.route(rewrittenQuery);
    state.setIntentType(intentResult.getIntentType());
    state.setSelectedTools(new ArrayList<>(intentResult.getTools()));
    
    // 2. 根据意图直接调用 Java 方法
    return multiRetrieve(state, rewrittenQuery, emitter);
}
```

**QueryRouter 意图识别示例:**
```typescript
class QueryRouter {
  route(query: string): IntentResult {
    const intentType = this.classifyIntent(query);
    const tools: string[] = [];
    
    // 默认使用向量检索
    tools.push('doc_search');
    
    // 规则判断
    if (/\d{4}年|最新|近期|今年/.test(query)) {
      tools.push('web_search');
    }
    
    if (/第\d+条|编号|条款|法规/.test(query)) {
      tools.push('keyword_search');
    }
    
    if (/我的|之前|上次/.test(query)) {
      tools.push('recall_memory');
    }
    
    return {
      intentType,
      tools,
      confidence: 0.8
    };
  }
}
```


### Thought 4: RRF 融合 + 重排序 (225-266 行)

#### 4.1 结果分组

```java
// 按来源分组
List<RetrievedChunk> vectorPart = allChunks.stream()
    .filter(c -> c.getSource() == RetrievedChunk.Source.VECTOR
              || c.getSource() == RetrievedChunk.Source.HYBRID)
    .collect(Collectors.toList());

List<RetrievedChunk> bm25Part = allChunks.stream()
    .filter(c -> c.getSource() == RetrievedChunk.Source.BM25)
    .collect(Collectors.toList());

List<RetrievedChunk> webPart = allChunks.stream()
    .filter(c -> c.getSource() == RetrievedChunk.Source.WEB)
    .collect(Collectors.toList());
```

#### 4.2 RRF (Reciprocal Rank Fusion) 融合

```java
List<RetrievedChunk> fused = rrfFusion.fuse(vectorPart, bm25Part, rrfTopN);
```

**RRF 算法原理:**

RRF 是一种无参数的融合算法，公式为：

```
RRF_score(chunk) = Σ 1 / (k + rank_i)
```

其中:
- `k` 是常数（通常为 60）
- `rank_i` 是该 chunk 在第 i 个检索结果列表中的排名

**Node.js 实现:**

```typescript
class RRFFusion {
  fuse(
    vectorResults: RetrievedChunk[],
    bm25Results: RetrievedChunk[],
    topN: number,
    k: number = 60
  ): RetrievedChunk[] {
    const scoreMap = new Map<string, { chunk: RetrievedChunk; score: number }>();
    
    // 处理向量检索结果
    vectorResults.forEach((chunk, index) => {
      const key = this.getChunkKey(chunk);
      const score = 1 / (k + index + 1);
      scoreMap.set(key, { chunk, score });
    });
    
    // 处理 BM25 结果
    bm25Results.forEach((chunk, index) => {
      const key = this.getChunkKey(chunk);
      const score = 1 / (k + index + 1);
      
      if (scoreMap.has(key)) {
        // 累加分数
        scoreMap.get(key)!.score += score;
      } else {
        scoreMap.set(key, { chunk, score });
      }
    });
    
    // 按分数排序并取 Top N
    return Array.from(scoreMap.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, topN)
      .map(item => {
        item.chunk.rrfScore = item.score;
        return item.chunk;
      });
  }
  
  private getChunkKey(chunk: RetrievedChunk): string {
    // 使用内容前 100 字符作为去重 key
    return `${chunk.knowledgeBaseId}_${chunk.content.substring(0, 100)}`;
  }
}
```


#### 4.3 Cross-Encoder 重排序

```java
List<RetrievedChunk> rerankCandidates = mergeForRerank(fused, webPart);
List<RetrievedChunk> reranked = reranker.rerank(rewrittenQuery, rerankCandidates, rerankTopK);
```

**Cross-Encoder vs Bi-Encoder:**

| 特性 | Bi-Encoder (向量检索) | Cross-Encoder (重排序) |
|------|---------------------|---------------------|
| 输入 | 分别编码 query 和 doc | 同时编码 [query, doc] |
| 速度 | 快（可预计算向量） | 慢（需实时计算） |
| 精度 | 较低 | 高 |
| 适用场景 | 初筛（Top 100） | 精排（Top 10） |

**Node.js 实现 (使用 Cohere Rerank API):**

```typescript
import { CohereClient } from 'cohere-ai';

class CrossEncoderReranker {
  private cohere = new CohereClient({ token: process.env.COHERE_API_KEY });
  
  async rerank(
    query: string,
    chunks: RetrievedChunk[],
    topK: number
  ): Promise<RetrievedChunk[]> {
    const documents = chunks.map(c => c.content);
    
    const response = await this.cohere.rerank({
      model: 'rerank-english-v3.0',
      query: query,
      documents: documents,
      topN: topK,
      returnDocuments: false
    });
    
    // 按重排序结果重新组织
    return response.results.map(result => {
      const chunk = chunks[result.index];
      chunk.rerankScore = result.relevanceScore;
      chunk.rrfRank = result.index + 1;
      return chunk;
    });
  }
}
```

**开源替代方案 (使用 BGE-reranker):**

```typescript
import { pipeline } from '@xenova/transformers';

class LocalReranker {
  private model: any;
  
  async initialize() {
    this.model = await pipeline(
      'text-classification',
      'BAAI/bge-reranker-base'
    );
  }
  
  async rerank(
    query: string,
    chunks: RetrievedChunk[],
    topK: number
  ): Promise<RetrievedChunk[]> {
    // 计算每个 chunk 的相关性分数
    const scores = await Promise.all(
      chunks.map(async (chunk) => {
        const result = await this.model(`${query} [SEP] ${chunk.content}`);
        return {
          chunk,
          score: result[0].score
        };
      })
    );
    
    // 排序并取 Top K
    return scores
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map((item, index) => {
        item.chunk.rerankScore = item.score;
        item.chunk.rrfRank = index + 1;
        return item.chunk;
      });
  }
}
```


#### 4.4 上下文压缩

```java
int maxTokens = state.isDocumentScopedRetrieval()
    ? safeGetInt("rag.document_scope_max_tokens", 5000)
    : safeGetInt("rag.context_max_tokens", 3000);

List<RetrievedChunk> compressed = contextCompressor.compress(
    reranked, rewrittenQuery, maxTokens
);
```

**上下文压缩的目的:**
1. 控制 LLM 输入 token 数量
2. 移除与问题无关的句子
3. 保留最相关的信息

**Node.js 实现 (基于句子级过滤):**

```typescript
import { encode } from 'gpt-tokenizer';

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
      const tokens = encode(compressedContent).length;
      
      if (totalTokens + tokens > maxTokens) {
        // 达到 token 上限，截断
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
  
  private splitSentences(text: string): string[] {
    return text.match(/[^.!?]+[.!?]+/g) || [text];
  }
  
  private isRelevant(sentence: string, query: string): boolean {
    // 简单的关键词匹配
    const queryWords = query.toLowerCase().split(/\s+/);
    const sentenceLower = sentence.toLowerCase();
    
    const matchCount = queryWords.filter(word => 
      sentenceLower.includes(word)
    ).length;
    
    return matchCount >= Math.min(2, queryWords.length * 0.3);
  }
  
  private truncateToTokens(text: string, maxTokens: number): string {
    const tokens = encode(text);
    if (tokens.length <= maxTokens) return text;
    
    // 简单截断（实际应该按句子边界）
    const truncatedTokens = tokens.slice(0, maxTokens);
    return this.decode(truncatedTokens);
  }
}
```


### Thought 5: 安全检查 + Prompt 组装 (268-279 行)

#### 5.1 安全评估

```java
boolean isEmergency = safetyGuard.isEmergency(question);
boolean needsFallback = safetyGuard.needsFallback(compressed);
```

**安全检查项:**
- `isEmergency`: 是否为紧急医疗问题（如"胸痛"、"呼吸困难"）
- `needsFallback`: 检索结果是否不足（chunks 太少或质量太低）

**Node.js 实现:**

```typescript
class SafetyGuard {
  private emergencyKeywords = [
    '胸痛', '呼吸困难', '大出血', '昏迷', '休克',
    'chest pain', 'difficulty breathing', 'unconscious'
  ];
  
  isEmergency(question: string): boolean {
    const lowerQuestion = question.toLowerCase();
    return this.emergencyKeywords.some(keyword => 
      lowerQuestion.includes(keyword.toLowerCase())
    );
  }
  
  needsFallback(chunks: RetrievedChunk[]): boolean {
    if (chunks.length === 0) return true;
    
    // 检查平均相关性分数
    const avgScore = chunks.reduce((sum, c) => sum + (c.rerankScore || 0), 0) / chunks.length;
    return avgScore < 0.3;  // 阈值可调
  }
  
  getEmergencyWarning(): string {
    return '\n\n⚠️ 警告：如果您正在经历紧急医疗状况，请立即拨打急救电话或前往最近的医院。';
  }
  
  getFallbackNotice(): string {
    return '\n\n💡 提示：未找到足够相关的信息，以下回答基于通用知识，建议咨询专业医生。';
  }
}
```

#### 5.2 Prompt 组装

```java
String history = buildConversationHistory(conversation.getId());
String prompt = needsFallback
    ? promptAssembler.assembleFallback(question, history)
    : promptAssembler.assemble(question, compressed, state.getMemoryContext(), null, history);
```

**Prompt 结构 (正常模式):**

```typescript
class PromptAssembler {
  assemble(
    question: string,
    chunks: RetrievedChunk[],
    memory: Record<string, any>,
    metadata: any,
    history: string
  ): string {
    const context = this.formatChunks(chunks);
    const memoryStr = this.formatMemory(memory);
    
    return `你是一个专业的医疗知识助手。请基于以下检索到的知识回答用户问题。

## 检索到的知识
${context}

${memoryStr ? `## 用户偏好\n${memoryStr}\n` : ''}

${history ? `## 对话历史\n${history}\n` : ''}

## 用户问题
${question}

## 回答要求
1. 基于检索到的知识回答，不要编造信息
2. 如果知识不足以回答，明确说明
3. 引用来源时标注文档名称
4. 使用专业但易懂的语言
5. 考虑用户的历史偏好

请回答：`;
  }
  
  private formatChunks(chunks: RetrievedChunk[]): string {
    return chunks.map((chunk, index) => 
      `[${index + 1}] 来源: ${chunk.sourceName}\n${chunk.content}`
    ).join('\n\n');
  }
  
  private formatMemory(memory: Record<string, any>): string {
    if (Object.keys(memory).length === 0) return '';
    return Object.entries(memory)
      .map(([key, value]) => `- ${key}: ${JSON.stringify(value)}`)
      .join('\n');
  }
  
  assembleFallback(question: string, history: string): string {
    return `你是一个专业的医疗知识助手。当前未检索到相关知识，请基于你的通用医学知识谨慎回答。

${history ? `## 对话历史\n${history}\n` : ''}

## 用户问题
${question}

## 回答要求
1. 明确说明这是基于通用知识的回答
2. 建议用户咨询专业医生
3. 不要过度自信或给出具体诊断
4. 提供一般性的健康建议

请回答：`;
  }
}
```


### Thought 6: LLM 生成 + 自纠错 (281-349 行)

#### 6.1 流式生成

```java
final StringBuilder answerBuilder = new StringBuilder();

aiConfigHolder.getChatModel()
    .stream(new org.springframework.ai.chat.prompt.Prompt(prompt))
    .doOnNext(chatResponse -> {
        String token = chatResponse.getResult().getOutput().getText();
        if (token != null && !token.isEmpty()) {
            answerBuilder.append(token);
            sendSseEvent(emitter, "token", Map.of("content", token));
        }
    })
    .blockLast();
```

**Node.js 实现 (使用 Vercel AI SDK):**

```typescript
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';

class StreamingGenerator {
  async generate(
    prompt: string,
    onToken: (token: string) => void,
    onComplete: (fullText: string) => void
  ) {
    const result = await streamText({
      model: openai('gpt-4-turbo'),
      prompt: prompt,
      temperature: 0.7,
      maxTokens: 2000
    });
    
    let fullText = '';
    
    for await (const chunk of result.textStream) {
      fullText += chunk;
      onToken(chunk);
    }
    
    onComplete(fullText);
  }
}
```

**SSE (Server-Sent Events) 实现:**

```typescript
import { NextRequest } from 'next/server';

export async function POST(req: NextRequest) {
  const { question, conversationId } = await req.json();
  
  // 创建 SSE 响应
  const encoder = new TextEncoder();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();
  
  // 异步处理
  (async () => {
    try {
      // 发送 rewrite 事件
      await writer.write(encoder.encode(
        `event: rewrite\ndata: ${JSON.stringify({ original: question, rewritten: rewrittenQuery })}\n\n`
      ));
      
      // 发送 token 事件
      await generator.generate(
        prompt,
        (token) => {
          writer.write(encoder.encode(
            `event: token\ndata: ${JSON.stringify({ content: token })}\n\n`
          ));
        },
        async (fullText) => {
          // 发送 done 事件
          await writer.write(encoder.encode(
            `event: done\ndata: ${JSON.stringify({ 
              sources, 
              conversationId,
              responseTime: Date.now() - startTime 
            })}\n\n`
          ));
          await writer.close();
        }
      );
    } catch (error) {
      await writer.write(encoder.encode(
        `event: error\ndata: ${JSON.stringify({ message: error.message })}\n\n`
      ));
      await writer.close();
    }
  })();
  
  return new Response(stream.readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  });
}
```


#### 6.2 Self-Reflection 自纠错机制 (657-706 行)

**核心逻辑:**

```java
private String runSelfReflection(AgentState state, String question,
                                 List<RetrievedChunk> chunks, 
                                 String answer, SseEmitter emitter) {
    int maxReflections = 3;
    String currentAnswer = answer;
    
    for (int i = 0; i < maxReflections; i++) {
        // 1. 评估当前答案
        ReflectionResult reflection = evaluateAnswer(question, chunks, currentAnswer);
        
        // 2. 记录反思结果
        sendSseEvent(emitter, "reflection", Map.of(
            "round", i + 1,
            "confidence", reflection.getConfidence(),
            "issues", reflection.getIssues()
        ));
        
        // 3. 如果置信度足够高，直接返回
        if (reflection.getConfidence() > 0.8) {
            return currentAnswer;
        }
        
        // 4. 如果是流式模式，无法重新生成
        if (emitter != null) {
            return currentAnswer + "\n\n[注: 检测到答案可能不够准确，但流式模式下无法重新生成]";
        }
        
        // 5. 重新生成答案
        String improvedPrompt = buildImprovedPrompt(question, chunks, currentAnswer, reflection);
        currentAnswer = generateAnswer(improvedPrompt);
    }
    
    return currentAnswer;
}
```

**Node.js 实现:**

```typescript
interface ReflectionResult {
  confidence: number;  // 0-1
  issues: string[];
  suggestions: string[];
}

class SelfReflection {
  private maxReflections = 3;
  private confidenceThreshold = 0.8;
  
  async reflect(
    question: string,
    chunks: RetrievedChunk[],
    answer: string,
    isStreaming: boolean,
    onReflection?: (result: ReflectionResult, round: number) => void
  ): Promise<string> {
    let currentAnswer = answer;
    
    for (let i = 0; i < this.maxReflections; i++) {
      // 评估答案质量
      const reflection = await this.evaluateAnswer(question, chunks, currentAnswer);
      
      // 通知前端
      onReflection?.(reflection, i + 1);
      
      // 置信度足够高，直接返回
      if (reflection.confidence > this.confidenceThreshold) {
        return currentAnswer;
      }
      
      // 流式模式下无法重新生成
      if (isStreaming) {
        return currentAnswer + '\n\n💡 提示：答案可能需要进一步完善，建议追问或重新提问。';
      }
      
      // 重新生成改进的答案
      currentAnswer = await this.regenerateAnswer(question, chunks, currentAnswer, reflection);
    }
    
    return currentAnswer;
  }
  
  private async evaluateAnswer(
    question: string,
    chunks: RetrievedChunk[],
    answer: string
  ): Promise<ReflectionResult> {
    const evaluationPrompt = `你是一个答案质量评估专家。请评估以下答案的质量。

## 用户问题
${question}

## 检索到的知识
${chunks.map(c => c.content).join('\n\n')}

## 待评估的答案
${answer}

## 评估标准
1. 答案是否基于检索到的知识？
2. 答案是否完整回答了问题？
3. 答案是否存在事实错误？
4. 答案是否存在逻辑矛盾？
5. 答案是否过于简略或冗长？

请以 JSON 格式返回评估结果：
{
  "confidence": 0.85,  // 0-1，答案质量评分
  "issues": ["问题1", "问题2"],  // 发现的问题列表
  "suggestions": ["建议1", "建议2"]  // 改进建议
}`;

    const result = await openai.chat.completions.create({
      model: 'gpt-4-turbo',
      messages: [{ role: 'user', content: evaluationPrompt }],
      response_format: { type: 'json_object' },
      temperature: 0.3
    });
    
    return JSON.parse(result.choices[0].message.content);
  }
  
  private async regenerateAnswer(
    question: string,
    chunks: RetrievedChunk[],
    previousAnswer: string,
    reflection: ReflectionResult
  ): Promise<string> {
    const improvedPrompt = `你是一个专业的医疗知识助手。之前的答案存在一些问题，请改进。

## 用户问题
${question}

## 检索到的知识
${chunks.map(c => c.content).join('\n\n')}

## 之前的答案
${previousAnswer}

## 发现的问题
${reflection.issues.join('\n')}

## 改进建议
${reflection.suggestions.join('\n')}

请生成一个改进后的答案，确保：
1. 解决上述所有问题
2. 基于检索到的知识
3. 完整、准确、易懂

改进后的答案：`;

    const result = await openai.chat.completions.create({
      model: 'gpt-4-turbo',
      messages: [{ role: 'user', content: improvedPrompt }],
      temperature: 0.7,
      max_tokens: 2000
    });
    
    return result.choices[0].message.content;
  }
}
```

**前端集成 (React):**

```typescript
function ChatInterface() {
  const [reflections, setReflections] = useState<Array<{
    round: number;
    confidence: number;
    issues: string[];
  }>>([]);
  
  useEffect(() => {
    const eventSource = new EventSource('/api/chat');
    
    eventSource.addEventListener('reflection', (e) => {
      const data = JSON.parse(e.data);
      setReflections(prev => [...prev, data]);
    });
    
    return () => eventSource.close();
  }, []);
  
  return (
    <div>
      {reflections.length > 0 && (
        <div className="reflection-panel">
          <h4>🔍 答案质量检查</h4>
          {reflections.map(r => (
            <div key={r.round}>
              <span>第 {r.round} 轮</span>
              <span>置信度: {(r.confidence * 100).toFixed(0)}%</span>
              {r.issues.length > 0 && (
                <ul>
                  {r.issues.map((issue, i) => <li key={i}>{issue}</li>)}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```


#### 6.3 持久化与完成 (318-343 行)

```java
// 1. 写入缓存
RagCachedResult cacheResult = new RagCachedResult(
    finalAnswer, sources, needsFallback, isEmergency, rewrittenQuery, retrievalLog
);
ragCacheService.putCacheIfFrequent(normalized, cacheResult, frequency);

// 2. 保存到数据库
saveQaMessage(conversation.getId(), "assistant", finalAnswer,
    JSON.toJSONString(sources),
    JSON.toJSONString(state.getAgentTrace()),
    JSON.toJSONString(state.getMcpCalls()),
    JSON.toJSONString(state.getReflectionLog()));

// 3. 更新会话
updateConversation(conversation);

// 4. 发送完成事件
sendSseEvent(emitter, "done", Map.of(
    "sources", sources,
    "isFallback", needsFallback,
    "isEmergency", isEmergency,
    "responseTime", elapsed,
    "conversationId", conversation.getId(),
    "retrievalLog", retrievalLog,
    "agentTrace", state.getAgentTrace(),
    "reflectionPassed", state.isReflectionPassed()
));

emitter.complete();
```

**Node.js 数据库持久化 (使用 Prisma):**

```typescript
// prisma/schema.prisma
model Conversation {
  id           String    @id @default(cuid())
  userId       String
  title        String
  kbIds        Json?
  messageCount Int       @default(0)
  lastActive   DateTime  @default(now())
  messages     Message[]
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
}

model Message {
  id             String       @id @default(cuid())
  conversationId String
  conversation   Conversation @relation(fields: [conversationId], references: [id])
  role           String       // "user" | "assistant"
  content        String       @db.Text
  sources        Json?
  agentTrace     Json?
  mcpCalls       Json?
  reflectionLog  Json?
  feedback       Int?
  createdAt      DateTime     @default(now())
}
```

```typescript
import { PrismaClient } from '@prisma/client';

class ConversationService {
  private prisma = new PrismaClient();
  
  async getOrCreateConversation(
    userId: string,
    conversationId?: string,
    question?: string,
    kbIds?: number[]
  ) {
    if (conversationId) {
      const existing = await this.prisma.conversation.findUnique({
        where: { id: conversationId }
      });
      if (existing && existing.userId === userId) {
        return existing;
      }
    }
    
    return await this.prisma.conversation.create({
      data: {
        userId,
        title: question?.substring(0, 50) || '新对话',
        kbIds: kbIds || [],
        messageCount: 0
      }
    });
  }
  
  async saveMessage(
    conversationId: string,
    role: 'user' | 'assistant',
    content: string,
    metadata?: {
      sources?: any[];
      agentTrace?: any[];
      mcpCalls?: any[];
      reflectionLog?: any[];
    }
  ) {
    await this.prisma.message.create({
      data: {
        conversationId,
        role,
        content,
        sources: metadata?.sources,
        agentTrace: metadata?.agentTrace,
        mcpCalls: metadata?.mcpCalls,
        reflectionLog: metadata?.reflectionLog
      }
    });
    
    // 更新会话
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: {
        messageCount: { increment: 1 },
        lastActive: new Date()
      }
    });
  }
  
  async getConversationHistory(conversationId: string, limit: number = 6) {
    const messages = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: limit
    });
    
    return messages.reverse();
  }
}
```


---

## 第四部分：关键技术深入解析

### 1. ThreadLocal 上下文传递机制

**问题背景:**
在 LLM Tool Calling 过程中，工具函数是由 Spring AI 框架异步调用的，如何在工具执行时访问当前请求的上下文（如 kbIds、userId）？

**解决方案: AgentToolContext (ThreadLocal)**

```java
public class AgentToolContext {
    private static final ThreadLocal<ToolExecutionContext> CONTEXT = new ThreadLocal<>();
    
    public static void activate(List<Long> kbIds, String userId) {
        CONTEXT.set(new ToolExecutionContext(kbIds, userId));
    }
    
    public static ToolExecutionContext get() {
        return CONTEXT.get();
    }
    
    public static void clear() {
        CONTEXT.remove();
    }
}

public class ToolExecutionContext {
    private List<Long> kbIds;
    private String userId;
    private List<RetrievedChunk> chunks = new ArrayList<>();
    private Map<String, Object> memoryContext = new HashMap<>();
    private List<String> calledTools = new ArrayList<>();
    
    // 工具执行时添加结果
    public void addChunks(List<RetrievedChunk> newChunks) {
        chunks.addAll(newChunks);
    }
}
```

**Node.js 实现 (使用 AsyncLocalStorage):**

```typescript
import { AsyncLocalStorage } from 'async_hooks';

interface ToolExecutionContext {
  kbIds: number[];
  userId: string;
  chunks: RetrievedChunk[];
  memoryContext: Record<string, any>;
  calledTools: string[];
}

class AgentToolContext {
  private static storage = new AsyncLocalStorage<ToolExecutionContext>();
  
  static run<T>(
    kbIds: number[],
    userId: string,
    callback: () => Promise<T>
  ): Promise<T> {
    const context: ToolExecutionContext = {
      kbIds,
      userId,
      chunks: [],
      memoryContext: {},
      calledTools: []
    };
    
    return this.storage.run(context, callback);
  }
  
  static get(): ToolExecutionContext | undefined {
    return this.storage.getStore();
  }
  
  static addChunks(chunks: RetrievedChunk[]) {
    const context = this.get();
    if (context) {
      context.chunks.push(...chunks);
    }
  }
  
  static addCalledTool(toolName: string) {
    const context = this.get();
    if (context) {
      context.calledTools.push(toolName);
    }
  }
}

// 使用示例
async function llmDrivenRetrieve(query: string, kbIds: number[], userId: string) {
  return await AgentToolContext.run(kbIds, userId, async () => {
    const result = await generateText({
      model: openai('gpt-4-turbo'),
      prompt: query,
      tools: {
        doc_search: tool({
          description: '语义检索',
          parameters: z.object({ query: z.string(), topK: z.number() }),
          execute: async ({ query, topK }) => {
            // 从上下文获取 kbIds
            const context = AgentToolContext.get();
            const chunks = await vectorRetriever.search(query, topK, context?.kbIds);
            
            // 添加到上下文
            AgentToolContext.addChunks(chunks);
            AgentToolContext.addCalledTool('doc_search');
            
            return chunks;
          }
        })
      }
    });
    
    // 返回收集到的所有 chunks
    return AgentToolContext.get()?.chunks || [];
  });
}
```


### 2. 文档直读模式详解 (506-574 行)

**触发条件:**
- 用户明确选择了特定文档（kbIds 不为空）
- 问题适合从整个文档中提取信息（如"总结这份报告"）

**实现流程:**

```java
private List<RetrievedChunk> retrieveSelectedDocumentChunks(AgentState state) {
    // 1. 查询选中的文档
    List<KbKnowledgeBase> docs = kbKnowledgeBaseMapper.selectList(
        new LambdaQueryWrapper<KbKnowledgeBase>()
            .in(KbKnowledgeBase::getId, state.getKbIds())
            .eq(KbKnowledgeBase::getStatus, "ready")
    );
    
    // 2. 计算每个文档的 chunk 预算
    int totalBudget = 18;  // 总共最多 18 个 chunks
    int perDocBudget = Math.max(4, totalBudget / docs.size());
    
    // 3. 从每个文档加载 chunks
    List<RetrievedChunk> result = new ArrayList<>();
    for (KbKnowledgeBase doc : docs) {
        List<RetrievedChunk> chunks = loadChunksFromDocument(doc, perDocBudget);
        result.addAll(chunks);
    }
    
    return result;
}

private List<RetrievedChunk> loadChunksFromDocument(KbKnowledgeBase doc, int budget) {
    // 优先从数据库加载已切片的 chunks
    List<KbChunk> persistedChunks = kbChunkMapper.selectList(
        new LambdaQueryWrapper<KbChunk>()
            .eq(KbChunk::getKbId, doc.getId())
            .orderByAsc(KbChunk::getChunkIndex)
    );
    
    if (!persistedChunks.isEmpty()) {
        // 均匀采样
        return sampleEvenly(persistedChunks, budget);
    }
    
    // 如果数据库没有，实时提取并切片
    Path filePath = Paths.get(uploadPath, doc.getFileUrl());
    try (InputStream inputStream = Files.newInputStream(filePath)) {
        String text = documentExtractor.extract(inputStream, doc.getFileType());
        List<TextChunk> chunks = textChunker.chunk(text, doc.getId(), doc.getCategory());
        return sampleEvenly(chunks, budget);
    }
}

// 均匀采样算法
private <T> List<T> sampleEvenly(List<T> items, int limit) {
    if (items.size() <= limit) return items;
    
    Set<Integer> indices = new LinkedHashSet<>();
    for (int i = 0; i < limit; i++) {
        int idx = (int) Math.round((double) i * (items.size() - 1) / (limit - 1));
        indices.add(idx);
    }
    
    return indices.stream().map(items::get).collect(Collectors.toList());
}
```

**均匀采样示例:**
```
文档有 100 个 chunks，预算是 6 个
采样索引: [0, 20, 40, 60, 80, 99]
```

**Node.js 实现:**

```typescript
class DocumentScopeRetriever {
  async retrieveSelectedDocuments(
    kbIds: number[],
    totalBudget: number = 18
  ): Promise<RetrievedChunk[]> {
    // 1. 查询文档
    const docs = await prisma.knowledgeBase.findMany({
      where: {
        id: { in: kbIds },
        status: 'ready',
        deleted: 0
      }
    });
    
    if (docs.length === 0) return [];
    
    // 2. 计算每个文档的预算
    const perDocBudget = Math.max(4, Math.floor(totalBudget / docs.length));
    
    // 3. 从每个文档加载 chunks
    const allChunks: RetrievedChunk[] = [];
    for (const doc of docs) {
      const chunks = await this.loadChunksFromDocument(doc, perDocBudget);
      allChunks.push(...chunks);
    }
    
    return allChunks;
  }
  
  private async loadChunksFromDocument(
    doc: KnowledgeBase,
    budget: number
  ): Promise<RetrievedChunk[]> {
    // 优先从数据库加载
    const persistedChunks = await prisma.chunk.findMany({
      where: { kbId: doc.id },
      orderBy: { chunkIndex: 'asc' }
    });
    
    if (persistedChunks.length > 0) {
      return this.sampleEvenly(persistedChunks, budget).map(chunk => ({
        id: `doc_${doc.id}_${chunk.chunkIndex}`,
        content: chunk.content,
        knowledgeBaseId: doc.id,
        sourceName: doc.name,
        source: 'HYBRID' as const,
        score: 1.0,
        chunkIndex: chunk.chunkIndex
      }));
    }
    
    // 实时提取
    const text = await this.extractDocument(doc.fileUrl, doc.fileType);
    const chunks = await this.chunkText(text, doc.id);
    return this.sampleEvenly(chunks, budget);
  }
  
  private sampleEvenly<T>(items: T[], limit: number): T[] {
    if (items.length <= limit) return items;
    
    const indices = new Set<number>();
    for (let i = 0; i < limit; i++) {
      const idx = Math.round((i * (items.length - 1)) / (limit - 1));
      indices.add(idx);
    }
    
    return Array.from(indices).map(idx => items[idx]);
  }
}
```

**直读模式 vs 检索模式对比:**

| 特性 | 直读模式 | 检索模式 |
|------|---------|---------|
| 触发条件 | 用户选择特定文档 | 默认模式 |
| Chunk 选择 | 均匀采样 | 相似度排序 |
| 适用场景 | 文档总结、全文分析 | 问答、信息查找 |
| Token 预算 | 5000 | 3000 |
| 是否需要向量化 | 否 | 是 |
| 性能 | 快（无向量计算） | 慢（需要向量检索） |


### 3. SSE 事件流设计

**事件类型与时序:**

```
1. rewrite      - Query 改写完成
2. thinking     - Agent 正在思考
3. intent       - 意图识别完成
4. retrieval    - 检索完成
5. rerank       - 重排序完成
6. start        - 开始生成
7. token        - 流式 token (多次)
8. reflection   - 自纠错检查 (可能多次)
9. done         - 生成完成
10. error       - 发生错误
```

**完整的事件流示例:**

```typescript
// 前端监听 SSE
const eventSource = new EventSource('/api/chat');

eventSource.addEventListener('rewrite', (e) => {
  const { original, rewritten } = JSON.parse(e.data);
  console.log(`Query 改写: ${original} → ${rewritten}`);
});

eventSource.addEventListener('thinking', (e) => {
  const { step, message } = JSON.parse(e.data);
  console.log(`思考中: ${message}`);
});

eventSource.addEventListener('intent', (e) => {
  const { intentType, tools, confidence } = JSON.parse(e.data);
  console.log(`意图: ${intentType}, 工具: ${tools.join(', ')}`);
});

eventSource.addEventListener('retrieval', (e) => {
  const { totalCount, tools, mode } = JSON.parse(e.data);
  console.log(`检索完成: ${totalCount} 条结果, 模式: ${mode}`);
});

eventSource.addEventListener('rerank', (e) => {
  const { topK, compressed } = JSON.parse(e.data);
  console.log(`重排序: Top ${topK}, 压缩后 ${compressed} 条`);
});

eventSource.addEventListener('start', (e) => {
  console.log('开始生成答案...');
});

eventSource.addEventListener('token', (e) => {
  const { content } = JSON.parse(e.data);
  appendToAnswer(content);  // 追加到 UI
});

eventSource.addEventListener('reflection', (e) => {
  const { round, passed, confidence } = JSON.parse(e.data);
  console.log(`自纠错第 ${round} 轮: ${passed ? '通过' : '未通过'}, 置信度: ${confidence}`);
});

eventSource.addEventListener('done', (e) => {
  const { 
    sources, 
    conversationId, 
    responseTime,
    agentTrace,
    reflectionPassed 
  } = JSON.parse(e.data);
  
  console.log(`完成! 耗时: ${responseTime}ms`);
  displaySources(sources);
  eventSource.close();
});

eventSource.addEventListener('error', (e) => {
  const { message } = JSON.parse(e.data);
  console.error(`错误: ${message}`);
  eventSource.close();
});
```

**React 组件实现:**

```typescript
import { useState, useEffect, useRef } from 'react';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  sources?: any[];
  metadata?: {
    agentTrace?: any[];
    reflectionPassed?: boolean;
    responseTime?: number;
  };
}

export function ChatInterface() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentAnswer, setCurrentAnswer] = useState('');
  const [status, setStatus] = useState<string>('');
  const [sources, setSources] = useState<any[]>([]);
  const eventSourceRef = useRef<EventSource | null>(null);
  
  const sendMessage = async (question: string) => {
    // 添加用户消息
    setMessages(prev => [...prev, { role: 'user', content: question }]);
    setCurrentAnswer('');
    setSources([]);
    
    // 创建 SSE 连接
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question })
    });
    
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    
    while (true) {
      const { done, value } = await reader!.read();
      if (done) break;
      
      const chunk = decoder.decode(value);
      const lines = chunk.split('\n\n');
      
      for (const line of lines) {
        if (!line.trim()) continue;
        
        const [eventLine, dataLine] = line.split('\n');
        const event = eventLine.replace('event: ', '');
        const data = JSON.parse(dataLine.replace('data: ', ''));
        
        handleEvent(event, data);
      }
    }
  };
  
  const handleEvent = (event: string, data: any) => {
    switch (event) {
      case 'rewrite':
        setStatus(`Query 改写: ${data.rewritten}`);
        break;
        
      case 'thinking':
        setStatus(data.message);
        break;
        
      case 'intent':
        setStatus(`意图识别: ${data.intentType}`);
        break;
        
      case 'retrieval':
        setStatus(`检索到 ${data.totalCount} 条结果`);
        break;
        
      case 'start':
        setStatus('生成中...');
        break;
        
      case 'token':
        setCurrentAnswer(prev => prev + data.content);
        break;
        
      case 'reflection':
        setStatus(`自纠错第 ${data.round} 轮 (置信度: ${(data.confidence * 100).toFixed(0)}%)`);
        break;
        
      case 'done':
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: currentAnswer,
          sources: data.sources,
          metadata: {
            agentTrace: data.agentTrace,
            reflectionPassed: data.reflectionPassed,
            responseTime: data.responseTime
          }
        }]);
        setSources(data.sources);
        setStatus('');
        setCurrentAnswer('');
        break;
        
      case 'error':
        setStatus(`错误: ${data.message}`);
        break;
    }
  };
  
  return (
    <div className="chat-interface">
      <div className="messages">
        {messages.map((msg, i) => (
          <div key={i} className={`message ${msg.role}`}>
            <div className="content">{msg.content}</div>
            {msg.sources && (
              <div className="sources">
                {msg.sources.map((src, j) => (
                  <div key={j} className="source">
                    📄 {src.sourceName}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        
        {currentAnswer && (
          <div className="message assistant streaming">
            <div className="content">{currentAnswer}</div>
          </div>
        )}
      </div>
      
      {status && (
        <div className="status-bar">
          <span className="spinner">⏳</span>
          {status}
        </div>
      )}
      
      <ChatInput onSend={sendMessage} />
    </div>
  );
}
```


---

## 第五部分：完整的 Node.js/TypeScript 实现示例

### 项目结构

```
rag-agent/
├── src/
│   ├── agent/
│   │   ├── DocMindAgent.ts          # 主 Agent 类
│   │   ├── AgentState.ts            # 状态管理
│   │   └── AgentToolContext.ts      # 上下文传递
│   ├── retrieval/
│   │   ├── VectorRetriever.ts       # 向量检索
│   │   ├── BM25Retriever.ts         # BM25 检索
│   │   ├── WebSearchTool.ts         # Web 搜索
│   │   ├── RRFFusion.ts             # RRF 融合
│   │   ├── CrossEncoderReranker.ts  # 重排序
│   │   └── ContextCompressor.ts     # 上下文压缩
│   ├── processing/
│   │   ├── QueryRewriter.ts         # Query 改写
│   │   ├── QueryRouter.ts           # 意图识别
│   │   ├── PromptAssembler.ts       # Prompt 组装
│   │   ├── SafetyGuard.ts           # 安全检查
│   │   └── SelfReflection.ts        # 自纠错
│   ├── memory/
│   │   ├── MemoryTool.ts            # 记忆工具
│   │   └── ExplicitMemoryExtractor.ts
│   ├── cache/
│   │   └── RagCacheService.ts       # 缓存服务
│   ├── api/
│   │   └── chat/
│   │       └── route.ts             # API 路由
│   └── lib/
│       ├── prisma.ts                # 数据库客户端
│       └── vectordb.ts              # 向量数据库
├── prisma/
│   └── schema.prisma                # 数据库 Schema
├── package.json
└── tsconfig.json
```

### API 路由实现

```typescript
// src/app/api/chat/route.ts
import { NextRequest } from 'next/server';
import { DocMindAgent } from '@/agent/DocMindAgent';
import { SseEmitter } from '@/agent/SseEmitter';

export async function POST(req: NextRequest) {
  const { userId, conversationId, question, kbIds } = await req.json();
  
  const encoder = new TextEncoder();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();
  
  const emitter = new SseEmitter(writer, encoder);
  const agent = new DocMindAgent(/* 注入依赖 */);
  
  // 异步执行
  agent.execute(userId, conversationId, question, kbIds || [], emitter)
    .catch(error => {
      emitter.sendEvent('error', { message: error.message });
      writer.close();
    });
  
  return new Response(stream.readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  });
}
```


### Package.json 依赖

```json
{
  "name": "rag-agent",
  "version": "1.0.0",
  "dependencies": {
    "@ai-sdk/openai": "^0.0.66",
    "@prisma/client": "^5.22.0",
    "@xenova/transformers": "^2.17.2",
    "ai": "^3.4.0",
    "cohere-ai": "^7.14.0",
    "gpt-tokenizer": "^2.5.0",
    "ioredis": "^5.4.1",
    "milvus2-sdk-node": "^2.4.9",
    "next": "^15.0.0",
    "react": "^19.0.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "prisma": "^5.22.0",
    "typescript": "^5.6.0"
  }
}
```

---

## 第六部分：性能优化建议

### 1. 向量检索优化

**使用 HNSW 索引:**
```typescript
// Milvus 索引配置
await milvusClient.createIndex({
  collection_name: 'knowledge_base',
  field_name: 'embedding',
  index_type: 'HNSW',
  metric_type: 'COSINE',
  params: {
    M: 16,              // 每层最大连接数
    efConstruction: 200 // 构建时搜索深度
  }
});

// 搜索时设置 ef 参数
const results = await milvusClient.search({
  collection_name: 'knowledge_base',
  vector: queryEmbedding,
  limit: 20,
  params: { ef: 100 }  // 搜索时深度
});
```

**批量 Embedding:**
```typescript
class VectorRetriever {
  private embeddingCache = new Map<string, number[]>();
  
  async search(query: string, topK: number, kbIds?: number[]) {
    // 检查缓存
    let embedding = this.embeddingCache.get(query);
    
    if (!embedding) {
      embedding = await this.getEmbedding(query);
      this.embeddingCache.set(query, embedding);
    }
    
    return await this.milvusClient.search({
      collection_name: 'knowledge_base',
      vector: embedding,
      limit: topK,
      filter: kbIds ? `kb_id in [${kbIds.join(',')}]` : undefined
    });
  }
}
```

### 2. 缓存策略优化

**多级缓存:**
```typescript
class RagCacheService {
  private l1Cache = new Map<string, CachedResult>();  // 内存缓存
  private redis: Redis;                                // Redis 缓存
  
  async getCache(normalized: string): Promise<CachedResult | null> {
    // L1: 内存缓存
    if (this.l1Cache.has(normalized)) {
      return this.l1Cache.get(normalized)!;
    }
    
    // L2: Redis 缓存
    const cached = await this.redis.get(`cache:${normalized}`);
    if (cached) {
      const result = JSON.parse(cached);
      this.l1Cache.set(normalized, result);  // 回填 L1
      return result;
    }
    
    return null;
  }
  
  async putCache(normalized: string, result: CachedResult) {
    // 写入 L1
    this.l1Cache.set(normalized, result);
    
    // 写入 L2
    await this.redis.setex(
      `cache:${normalized}`,
      3600,  // 1 小时过期
      JSON.stringify(result)
    );
  }
}
```

### 3. 并行处理

**并行检索:**
```typescript
async function parallelRetrieve(query: string, kbIds: number[]) {
  const [vectorResults, bm25Results, webResults] = await Promise.all([
    vectorRetriever.search(query, 20, kbIds),
    bm25Retriever.search(query, kbIds),
    webSearchTool.search(query, 5)
  ]);
  
  return [...vectorResults, ...bm25Results, ...webResults];
}
```

**流水线处理:**
```typescript
async function pipelineProcess(query: string) {
  // 阶段 1: Query 改写
  const rewritten = await queryRewriter.rewrite(query);
  
  // 阶段 2 & 3 并行: 检索 + 记忆提取
  const [chunks, memory] = await Promise.all([
    parallelRetrieve(rewritten, kbIds),
    memoryExtractor.extract(query)
  ]);
  
  // 阶段 4: RRF + 重排序
  const fused = rrfFusion.fuse(chunks);
  const reranked = await reranker.rerank(rewritten, fused, 6);
  
  // 阶段 5 & 6 串行: Prompt 组装 -> LLM 生成
  const prompt = promptAssembler.assemble(query, reranked, memory);
  const answer = await llm.generate(prompt);
  
  return answer;
}
```

### 4. 数据库查询优化

**索引优化:**
```sql
-- 会话查询索引
CREATE INDEX idx_conversation_user_active 
ON qa_conversation(user_id, last_active DESC);

-- 消息查询索引
CREATE INDEX idx_message_conversation_time 
ON qa_message(conversation_id, create_time DESC);

-- Chunk 查询索引
CREATE INDEX idx_chunk_kb_index 
ON kb_chunk(kb_id, chunk_index);
```

**连接池配置:**
```typescript
// prisma/schema.prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  
  // 连接池配置
  pool_timeout = 10
  connection_limit = 20
}
```

### 5. 流式输出优化

**背压控制:**
```typescript
class SseEmitter {
  private buffer: string[] = [];
  private maxBufferSize = 100;
  
  async sendEvent(event: string, data: any) {
    const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    
    this.buffer.push(message);
    
    if (this.buffer.length >= this.maxBufferSize) {
      await this.flush();
    }
  }
  
  private async flush() {
    if (this.buffer.length === 0) return;
    
    const chunk = this.buffer.join('');
    await this.writer.write(this.encoder.encode(chunk));
    this.buffer = [];
  }
}
```


---

## 第七部分：部署与监控

### 1. Docker 部署

**Dockerfile:**
```dockerfile
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json

EXPOSE 3000
CMD ["npm", "start"]
```

**docker-compose.yml:**
```yaml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://user:pass@postgres:5432/ragdb
      - REDIS_URL=redis://redis:6379
      - MILVUS_ADDRESS=milvus:19530
      - OPENAI_API_KEY=${OPENAI_API_KEY}
    depends_on:
      - postgres
      - redis
      - milvus
  
  postgres:
    image: postgres:16-alpine
    environment:
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=pass
      - POSTGRES_DB=ragdb
    volumes:
      - postgres_data:/var/lib/postgresql/data
  
  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data
  
  milvus:
    image: milvusdb/milvus:v2.4.0
    environment:
      - ETCD_ENDPOINTS=etcd:2379
      - MINIO_ADDRESS=minio:9000
    ports:
      - "19530:19530"
    depends_on:
      - etcd
      - minio
  
  etcd:
    image: quay.io/coreos/etcd:v3.5.5
    environment:
      - ETCD_AUTO_COMPACTION_MODE=revision
      - ETCD_AUTO_COMPACTION_RETENTION=1000
  
  minio:
    image: minio/minio:latest
    environment:
      - MINIO_ROOT_USER=minioadmin
      - MINIO_ROOT_PASSWORD=minioadmin
    command: server /minio_data

volumes:
  postgres_data:
  redis_data:
```

### 2. 监控与日志

**Prometheus 指标:**
```typescript
import { Counter, Histogram, register } from 'prom-client';

class MetricsCollector {
  private requestCounter = new Counter({
    name: 'rag_requests_total',
    help: 'Total number of RAG requests',
    labelNames: ['status', 'intent_type']
  });
  
  private responseTime = new Histogram({
    name: 'rag_response_time_seconds',
    help: 'RAG response time in seconds',
    buckets: [0.1, 0.5, 1, 2, 5, 10]
  });
  
  private retrievalCount = new Histogram({
    name: 'rag_retrieval_chunks',
    help: 'Number of chunks retrieved',
    buckets: [0, 5, 10, 20, 50, 100]
  });
  
  recordRequest(status: string, intentType: string) {
    this.requestCounter.inc({ status, intent_type: intentType });
  }
  
  recordResponseTime(seconds: number) {
    this.responseTime.observe(seconds);
  }
  
  recordRetrievalCount(count: number) {
    this.retrievalCount.observe(count);
  }
}

// API 路由中使用
export async function POST(req: NextRequest) {
  const startTime = Date.now();
  
  try {
    const result = await agent.execute(/* ... */);
    
    const elapsed = (Date.now() - startTime) / 1000;
    metrics.recordRequest('success', result.intentType);
    metrics.recordResponseTime(elapsed);
    metrics.recordRetrievalCount(result.retrievalCount);
    
    return Response.json(result);
  } catch (error) {
    metrics.recordRequest('error', 'unknown');
    throw error;
  }
}
```

**结构化日志:**
```typescript
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

// 在 Agent 中使用
class DocMindAgent {
  async execute(/* ... */) {
    logger.info('Agent execution started', {
      userId,
      conversationId,
      question: question.substring(0, 100)
    });
    
    try {
      // ... 执行逻辑
      
      logger.info('Agent execution completed', {
        conversationId,
        responseTime: elapsed,
        retrievalCount: allChunks.length,
        intentType: state.intentType
      });
    } catch (error) {
      logger.error('Agent execution failed', {
        conversationId,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }
}
```

### 3. 错误处理与重试

**指数退避重试:**
```typescript
class RetryableOperation {
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    baseDelay: number = 1000
  ): Promise<T> {
    let lastError: Error;
    
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        
        if (i < maxRetries - 1) {
          const delay = baseDelay * Math.pow(2, i);
          await this.sleep(delay);
        }
      }
    }
    
    throw lastError!;
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// 使用示例
const retryable = new RetryableOperation();

const embedding = await retryable.executeWithRetry(
  () => openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: query
  }),
  3,
  1000
);
```

**熔断器模式:**
```typescript
class CircuitBreaker {
  private failureCount = 0;
  private lastFailureTime = 0;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  
  constructor(
    private threshold: number = 5,
    private timeout: number = 60000
  ) {}
  
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.timeout) {
        this.state = 'HALF_OPEN';
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }
    
    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }
  
  private onSuccess() {
    this.failureCount = 0;
    this.state = 'CLOSED';
  }
  
  private onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    
    if (this.failureCount >= this.threshold) {
      this.state = 'OPEN';
    }
  }
}

// 使用示例
const vectorSearchBreaker = new CircuitBreaker(5, 60000);

const results = await vectorSearchBreaker.execute(
  () => vectorRetriever.search(query, topK, kbIds)
);
```


---

## 第八部分：测试策略

### 1. 单元测试

**测试 RRF 融合:**
```typescript
import { describe, it, expect } from 'vitest';
import { RRFFusion } from '@/retrieval/RRFFusion';

describe('RRFFusion', () => {
  const fusion = new RRFFusion();
  
  it('should correctly fuse vector and BM25 results', () => {
    const vectorResults = [
      { id: '1', content: 'A', score: 0.9 },
      { id: '2', content: 'B', score: 0.8 },
      { id: '3', content: 'C', score: 0.7 }
    ];
    
    const bm25Results = [
      { id: '2', content: 'B', score: 0.95 },
      { id: '4', content: 'D', score: 0.85 },
      { id: '1', content: 'A', score: 0.75 }
    ];
    
    const fused = fusion.fuse(vectorResults, bm25Results, 3);
    
    // ID '1' 和 '2' 在两个列表中都出现，应该排名靠前
    expect(fused[0].id).toMatch(/1|2/);
    expect(fused.length).toBe(3);
  });
  
  it('should handle empty input', () => {
    const fused = fusion.fuse([], [], 10);
    expect(fused).toEqual([]);
  });
});
```

**测试 Query 改写:**
```typescript
describe('QueryRewriter', () => {
  const rewriter = new QueryRewriter(mockLLM);
  
  it('should expand medical abbreviations', async () => {
    const original = 'DM患者如何控制血糖？';
    const rewritten = await rewriter.rewrite(original);
    
    expect(rewritten).toContain('糖尿病');
    expect(rewritten).not.toContain('DM');
  });
  
  it('should add medical context', async () => {
    const original = '头痛怎么办？';
    const rewritten = await rewriter.rewrite(original);
    
    expect(rewritten.length).toBeGreaterThan(original.length);
  });
});
```

### 2. 集成测试

**测试完整的 RAG 流程:**
```typescript
describe('DocMindAgent Integration', () => {
  let agent: DocMindAgent;
  let testDb: PrismaClient;
  
  beforeAll(async () => {
    testDb = new PrismaClient({
      datasources: { db: { url: process.env.TEST_DATABASE_URL } }
    });
    
    agent = new DocMindAgent(/* 注入测试依赖 */);
  });
  
  afterAll(async () => {
    await testDb.$disconnect();
  });
  
  it('should complete a full RAG cycle', async () => {
    const userId = 'test-user';
    const question = '糖尿病的症状有哪些？';
    
    const events: any[] = [];
    const emitter = new MockSseEmitter((event, data) => {
      events.push({ event, data });
    });
    
    const conversationId = await agent.execute(
      userId,
      null,
      question,
      [],
      emitter
    );
    
    // 验证事件序列
    expect(events.map(e => e.event)).toEqual([
      'rewrite',
      'thinking',
      'intent',
      'retrieval',
      'rerank',
      'start',
      'token',  // 可能多次
      'done'
    ]);
    
    // 验证最终结果
    const doneEvent = events.find(e => e.event === 'done');
    expect(doneEvent.data.sources).toBeDefined();
    expect(doneEvent.data.conversationId).toBe(conversationId);
    
    // 验证数据库持久化
    const messages = await testDb.message.findMany({
      where: { conversationId }
    });
    expect(messages).toHaveLength(2);  // user + assistant
  });
  
  it('should use cache on repeated queries', async () => {
    const question = '什么是高血压？';
    
    // 第一次查询
    await agent.execute('user1', null, question, [], mockEmitter);
    
    // 第二次查询
    await agent.execute('user1', null, question, [], mockEmitter);
    
    // 第三次查询应该命中缓存
    const startTime = Date.now();
    await agent.execute('user1', null, question, [], mockEmitter);
    const elapsed = Date.now() - startTime;
    
    // 缓存命中应该很快（< 100ms）
    expect(elapsed).toBeLessThan(100);
  });
});
```

### 3. 性能测试

**负载测试:**
```typescript
import { check } from 'k6';
import http from 'k6/http';

export const options = {
  stages: [
    { duration: '1m', target: 10 },   // 预热
    { duration: '5m', target: 50 },   // 正常负载
    { duration: '2m', target: 100 },  // 峰值负载
    { duration: '1m', target: 0 }     // 冷却
  ],
  thresholds: {
    http_req_duration: ['p(95)<5000'],  // 95% 请求 < 5s
    http_req_failed: ['rate<0.01']      // 错误率 < 1%
  }
};

export default function() {
  const payload = JSON.stringify({
    userId: 'test-user',
    question: '糖尿病的治疗方法有哪些？',
    kbIds: []
  });
  
  const res = http.post('http://localhost:3000/api/chat', payload, {
    headers: { 'Content-Type': 'application/json' }
  });
  
  check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 5s': (r) => r.timings.duration < 5000
  });
}
```


---

## 第九部分：常见问题与解决方案

### 1. 检索质量问题

**问题: 检索结果不相关**

解决方案:
- 调整 Query 改写策略，增加领域术语
- 优化 Embedding 模型选择（如使用领域微调模型）
- 增加 BM25 权重，平衡语义和关键词匹配
- 调整 RRF 的 k 参数（默认 60）

```typescript
// 调整 RRF 参数
const fused = rrfFusion.fuse(vectorPart, bm25Part, topN, k = 40);  // 降低 k 增加高排名项的权重
```

**问题: 重排序效果不佳**

解决方案:
- 使用更强的 Cross-Encoder 模型（如 bge-reranker-large）
- 增加重排序的候选数量
- 针对特定领域微调 Reranker

### 2. 性能问题

**问题: 响应时间过长**

优化策略:
1. **并行化**: 向量检索、BM25、Web 搜索并行执行
2. **缓存**: 多级缓存（内存 + Redis）
3. **索引优化**: 使用 HNSW 索引，调整 ef 参数
4. **批处理**: Embedding 批量计算
5. **异步处理**: 非关键路径异步执行

```typescript
// 性能监控
const performanceLog = {
  queryRewrite: 150,      // ms
  retrieval: 800,         // ms (并行)
  rrfFusion: 50,          // ms
  rerank: 1200,           // ms
  contextCompression: 100,// ms
  llmGeneration: 3000,    // ms
  total: 5300             // ms
};
```

**问题: 内存占用过高**

解决方案:
- 限制 Chunk 数量和大小
- 使用流式处理，避免一次性加载所有数据
- 定期清理缓存
- 使用对象池复用大对象

### 3. LLM 相关问题

**问题: LLM 生成内容不基于检索结果**

解决方案:
- 优化 System Prompt，强调必须基于提供的知识
- 在 Prompt 中明确标注知识来源
- 使用 Self-Reflection 检测幻觉
- 降低 temperature 参数（0.3-0.5）

```typescript
const systemPrompt = `你是专业助手。回答时：
1. 必须基于【检索到的知识】回答
2. 如果知识不足，明确说明"根据现有资料无法回答"
3. 不要编造信息
4. 引用时标注来源编号 [1] [2]`;
```

**问题: Tool Calling 不稳定**

解决方案:
- 使用更强的模型（GPT-4 而非 GPT-3.5）
- 优化 Tool 描述，使其更清晰
- 添加示例（Few-shot）
- 实现降级机制（规则路由）

### 4. 数据一致性问题

**问题: 向量和元数据不同步**

解决方案:
- 使用事务确保原子性
- 实现双写机制
- 定期校验和修复

```typescript
async function indexDocument(doc: Document) {
  const transaction = await prisma.$transaction(async (tx) => {
    // 1. 保存元数据
    const saved = await tx.knowledgeBase.create({ data: doc });
    
    // 2. 生成 Embedding
    const embedding = await getEmbedding(doc.content);
    
    // 3. 写入向量数据库
    await milvusClient.insert({
      collection_name: 'knowledge_base',
      data: [{
        id: saved.id,
        embedding: embedding,
        kb_id: saved.id
      }]
    });
    
    return saved;
  });
  
  return transaction;
}
```

### 5. 缓存失效问题

**问题: 知识库更新后缓存未失效**

解决方案:
- 监听知识库变更事件
- 使用 Tag-based 缓存失效
- 设置合理的 TTL

```typescript
class RagCacheService {
  async invalidateByKbId(kbId: number) {
    // 获取所有包含该 kbId 的缓存 key
    const keys = await redis.keys(`cache:*`);
    
    for (const key of keys) {
      const cached = await redis.get(key);
      if (cached) {
        const data = JSON.parse(cached);
        if (data.kbIds?.includes(kbId)) {
          await redis.del(key);
        }
      }
    }
  }
  
  // 知识库更新时调用
  async onKnowledgeBaseUpdate(kbId: number) {
    await this.invalidateByKbId(kbId);
  }
}
```

---

## 第十部分：总结与最佳实践

### 核心要点回顾

1. **ReAct 模式**: 6 步思考-行动循环，每步都有明确的目标和输出
2. **LLM Tool Calling**: 让 LLM 自主决策调用哪些工具，比规则路由更灵活
3. **多路检索**: 向量 + BM25 + Web，覆盖不同类型的查询
4. **RRF 融合**: 无参数融合算法，简单有效
5. **Cross-Encoder 重排序**: 精排阶段提升相关性
6. **Self-Reflection**: 自纠错机制提升答案质量
7. **智能缓存**: 基于频次的缓存策略，平衡性能和成本

### 最佳实践

#### 1. 架构设计
- 模块化设计，每个组件职责单一
- 使用依赖注入，便于测试和替换
- 实现降级机制，确保系统鲁棒性

#### 2. 性能优化
- 并行化独立操作
- 多级缓存策略
- 合理设置 Token 预算
- 使用流式输出提升用户体验

#### 3. 质量保证
- 完善的单元测试和集成测试
- 性能监控和告警
- 结构化日志便于问题排查
- A/B 测试验证优化效果

#### 4. 用户体验
- SSE 实时推送进度
- 清晰的错误提示
- 引用来源增强可信度
- 支持多轮对话

### 扩展方向

1. **多模态支持**: 图片、表格、图表的理解和生成
2. **个性化**: 基于用户历史的个性化推荐
3. **协作式 Agent**: 多个 Agent 协作完成复杂任务
4. **持续学习**: 从用户反馈中学习和改进
5. **多语言支持**: 跨语言检索和生成

### 参考资源

- **论文**:
  - ReAct: Synergizing Reasoning and Acting in Language Models
  - Reciprocal Rank Fusion outperforms Condorcet and individual Rank Learning Methods
  - Dense Passage Retrieval for Open-Domain Question Answering

- **开源项目**:
  - LangChain: https://github.com/langchain-ai/langchainjs
  - Vercel AI SDK: https://github.com/vercel/ai
  - Milvus: https://github.com/milvus-io/milvus

- **工具和服务**:
  - OpenAI API: https://platform.openai.com/docs
  - Cohere Rerank: https://cohere.com/rerank
  - Pinecone: https://www.pinecone.io/

---

## 结语

DocMindAgent 展示了一个完整的生产级 RAG Agent 系统的实现。通过 ReAct 模式、LLM Tool Calling、多路检索、智能融合和自纠错机制，系统能够高质量地回答用户问题。

对于 Node.js 开发者，本文档提供了从概念到实现的完整指南，包括：
- 详细的执行流程分析
- 关键技术的深入解析
- 完整的 TypeScript 实现示例
- 性能优化和部署建议
- 测试策略和问题排查

希望这份教程能帮助您理解 RAG 系统的核心原理，并在实际项目中应用这些技术。

**文档版本**: 1.0  
**最后更新**: 2026-04-23  
**作者**: Claude (Sonnet 4.6)

