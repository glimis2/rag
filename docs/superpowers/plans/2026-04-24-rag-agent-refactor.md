# RAG Agent 重构实现计划

## 项目概述

基于设计文档 `2026-04-24-rag-agent-refactor-design.md`，本计划将分三个阶段实现完整的 RAG Agent 系统。

**核心目标**：
- 实现多路检索（向量 + BM25 + Web）
- 实现 RRF 融合和 Cross-Encoder 重排序
- 实现智能缓存和 LLM 工具选择
- 实现记忆系统和自纠错机制

**技术栈**：
- TypeScript + NestJS
- PostgreSQL (pgvector) + Redis
- Cohere Rerank API
- Tavily Web Search API
- Vercel AI SDK

---

## 第一阶段：核心检索链路

### 阶段目标
实现多路检索、RRF 融合、重排序和上下文压缩的完整链路。

### 任务列表

#### 1.1 定义核心接口和类型
**文件**: `src/services/rag/types.ts`

**任务**:
- [ ] 定义 `RetrievedChunk` 接口
- [ ] 定义 `Retriever` 接口
- [ ] 定义 `FusionService` 接口
- [ ] 定义 `RerankerService` 接口
- [ ] 定义 `ContextCompressor` 接口
- [ ] 定义 `RetrievalResult` 类型
- [ ] 定义 `RerankResult` 类型

**验收标准**:
- 所有接口包含完整的 JSDoc 注释
- 类型定义符合设计文档规范
- 通过 TypeScript 编译检查

**预计时间**: 30 分钟

---

#### 1.2 实现向量检索器
**文件**: `src/services/rag/retrievers/vectorRetriever.ts`

**任务**:
- [ ] 创建 `VectorRetriever` 类实现 `Retriever` 接口
- [ ] 实现 `retrieve(query, topK)` 方法
- [ ] 调用 `vectorStoreService.similaritySearch`
- [ ] 转换结果为 `RetrievedChunk[]` 格式
- [ ] 添加错误处理和日志

**依赖**:
- 任务 1.1（类型定义）
- 现有的 `vectorStoreService`

**验收标准**:
- 成功调用向量数据库
- 返回格式符合 `RetrievedChunk` 接口
- 错误情况返回空数组
- 添加单元测试

**预计时间**: 1 小时

---

#### 1.3 实现 BM25 检索器
**文件**: `src/services/rag/retrievers/bm25Retriever.ts`

**任务**:
- [ ] 创建 `BM25Retriever` 类实现 `Retriever` 接口
- [ ] 实现 BM25 算法核心逻辑
  - [ ] 文档索引构建（IDF 计算）
  - [ ] 查询评分（TF-IDF + 长度归一化）
  - [ ] 中文分词支持（使用 nodejieba）
- [ ] 实现 `retrieve(query, topK)` 方法
- [ ] 添加索引缓存机制
- [ ] 添加错误处理和日志

**依赖**:
- 任务 1.1（类型定义）
- 安装 `nodejieba` 依赖

**验收标准**:
- BM25 算法实现正确（k1=1.5, b=0.75）
- 支持中文分词
- 返回格式符合 `RetrievedChunk` 接口
- 添加单元测试（包含中文查询）

**预计时间**: 3 小时

---

#### 1.4 实现 Web 检索器
**文件**: `src/services/rag/retrievers/webRetriever.ts`

**任务**:
- [ ] 创建 `WebRetriever` 类实现 `Retriever` 接口
- [ ] 集成 Tavily API
- [ ] 实现 `retrieve(query, topK)` 方法
- [ ] 转换 Tavily 结果为 `RetrievedChunk` 格式
- [ ] 添加 API 错误处理和重试逻辑
- [ ] 添加日志

**依赖**:
- 任务 1.1（类型定义）
- 安装 `@tavily/core` 依赖
- 配置 Tavily API Key

**验收标准**:
- 成功调用 Tavily API
- 返回格式符合 `RetrievedChunk` 接口
- API 失败时返回空数组
- 添加单元测试（使用 mock）

**预计时间**: 1.5 小时

---

#### 1.5 实现 RRF 融合服务
**文件**: `src/services/rag/fusionService.ts`

**任务**:
- [ ] 创建 `FusionService` 类实现 `FusionService` 接口
- [ ] 实现 RRF 算法
  - [ ] 计算每个检索器的 RRF 分数
  - [ ] 合并相同文档的分数
  - [ ] 按最终分数排序
- [ ] 实现 `fuse(results, k)` 方法
- [ ] 添加去重逻辑（基于 chunkId）
- [ ] 添加日志

**依赖**:
- 任务 1.1（类型定义）

**验收标准**:
- RRF 算法实现正确（k=60）
- 正确处理重复文档
- 返回排序后的结果
- 添加单元测试（包含重复文档场景）

**预计时间**: 2 小时

---

#### 1.6 实现重排序服务
**文件**: `src/services/rag/rerankerService.ts`

**任务**:
- [ ] 创建 `RerankerService` 类实现 `RerankerService` 接口
- [ ] 集成 Cohere Rerank API
- [ ] 实现 `rerank(query, chunks, topK)` 方法
- [ ] 添加 API 错误处理和降级逻辑
- [ ] 添加日志

**依赖**:
- 任务 1.1（类型定义）
- 安装 `cohere-ai` 依赖
- 配置 Cohere API Key

**验收标准**:
- 成功调用 Cohere Rerank API
- 返回格式符合 `RerankResult` 接口
- API 失败时返回原始排序
- 添加单元测试（使用 mock）

**预计时间**: 1.5 小时

---

#### 1.7 实现上下文压缩器
**文件**: `src/services/rag/contextCompressor.ts`

**任务**:
- [ ] 创建 `ContextCompressor` 类实现 `ContextCompressor` 接口
- [ ] 实现 Token 计数逻辑（使用 tiktoken）
- [ ] 实现压缩策略
  - [ ] 优先保留高分文档
  - [ ] 截断超长文档
  - [ ] 保持文档完整性
- [ ] 实现 `compress(chunks, maxTokens)` 方法
- [ ] 添加日志

**依赖**:
- 任务 1.1（类型定义）
- 安装 `tiktoken` 依赖

**验收标准**:
- Token 计数准确
- 压缩后不超过 maxTokens
- 优先保留高分文档
- 添加单元测试

**预计时间**: 2 小时

---

#### 1.8 重构 RAG Service 集成检索链路
**文件**: `src/services/ragService.ts`

**任务**:
- [ ] 注入所有检索器和服务
- [ ] 修改 `runReActLoop` 中的 Step 4（检索）
  - [ ] 并行调用三个检索器
  - [ ] 调用 RRF 融合
  - [ ] 调用重排序
  - [ ] 调用上下文压缩
- [ ] 更新 SSE 事件（添加融合和重排序事件）
- [ ] 更新 RetrievalLog（记录各阶段结果）
- [ ] 添加错误处理和降级逻辑

**依赖**:
- 任务 1.2-1.7（所有检索和处理服务）

**验收标准**:
- 检索链路完整运行
- SSE 事件正确发送
- 降级逻辑正常工作
- 添加集成测试

**预计时间**: 3 小时

---

#### 1.9 第一阶段测试和验证
**任务**:
- [ ] 编写端到端测试
- [ ] 测试多路检索场景
- [ ] 测试降级场景（向量失败、重排序失败）
- [ ] 测试性能（并行检索耗时）
- [ ] 验证 SSE 事件流
- [ ] 代码审查和优化

**依赖**:
- 任务 1.8（集成完成）

**验收标准**:
- 所有测试通过
- 性能符合预期（<2s）
- 代码质量良好

**预计时间**: 2 小时

---

### 第一阶段总结
**总预计时间**: 16.5 小时  
**关键里程碑**: 完整的多路检索链路，支持降级和错误处理

---

## 第二阶段：Agent 决策层

### 阶段目标
实现智能缓存、LLM 工具选择和工具执行系统。

### 任务列表

#### 2.1 配置 Redis 客户端
**文件**: `src/config/redis.config.ts`

**任务**:
- [ ] 创建 Redis 配置模块
- [ ] 配置连接参数（host, port, password）
- [ ] 添加连接错误处理
- [ ] 添加健康检查

**依赖**:
- 安装 `ioredis` 依赖

**验收标准**:
- Redis 连接成功
- 错误处理完善
- 添加单元测试

**预计时间**: 1 小时

---

#### 2.2 实现 RAG 缓存服务
**文件**: `src/services/rag/ragCacheService.ts`

**任务**:
- [ ] 创建 `RagCacheService` 类
- [ ] 实现查询归一化（小写、去空格、排序）
- [ ] 实现频次统计逻辑
  - [ ] `incrementFrequency(query)`
  - [ ] `getFrequency(query)`
- [ ] 实现缓存读写
  - [ ] `get(query)` - 返回缓存的 chunks 和 answer
  - [ ] `set(query, chunks, answer)` - 仅当频次 ≥3 时写入
- [ ] 实现 TTL 管理（1 小时）
- [ ] 添加日志

**依赖**:
- 任务 2.1（Redis 配置）

**验收标准**:
- 频次统计正确
- 缓存命中率可追踪
- TTL 正常工作
- 添加单元测试

**预计时间**: 2.5 小时

---

#### 2.3 实现工具注册表
**文件**: `src/services/rag/tools/toolRegistry.ts`

**任务**:
- [ ] 定义 `Tool` 接口
- [ ] 创建 `ToolRegistry` 类
- [ ] 注册四个工具：
  - [ ] `doc_search` - 文档检索
  - [ ] `web_search` - Web 搜索
  - [ ] `recall_memory` - 召回记忆
  - [ ] `store_memory` - 存储记忆
- [ ] 实现 `getTool(name)` 方法
- [ ] 实现 `getAllTools()` 方法

**依赖**:
- 无

**验收标准**:
- 所有工具正确注册
- 工具描述清晰（供 LLM 理解）
- 添加单元测试

**预计时间**: 1.5 小时

---

#### 2.4 实现工具执行器
**文件**: `src/services/rag/tools/toolExecutor.ts`

**任务**:
- [ ] 创建 `ToolExecutor` 类
- [ ] 实现 `doc_search` 工具
  - [ ] 调用第一阶段的检索链路
- [ ] 实现 `web_search` 工具
  - [ ] 调用 WebRetriever
- [ ] 实现 `recall_memory` 工具（占位符）
- [ ] 实现 `store_memory` 工具（占位符）
- [ ] 实现 `execute(toolName, args)` 方法
- [ ] 添加错误处理和日志

**依赖**:
- 任务 2.3（工具注册表）
- 第一阶段的检索服务

**验收标准**:
- 所有工具可执行
- 错误处理完善
- 添加单元测试

**预计时间**: 2 小时

---

#### 2.5 实现 LLM 工具调用服务
**文件**: `src/services/rag/toolCallingService.ts`

**任务**:
- [ ] 创建 `ToolCallingService` 类
- [ ] 集成 Vercel AI SDK
- [ ] 实现 `selectTools(query, conversationHistory)` 方法
  - [ ] 构造 LLM Prompt
  - [ ] 调用 LLM 进行工具选择
  - [ ] 解析 LLM 返回的工具列表
- [ ] 实现工具执行循环
- [ ] 添加日志

**依赖**:
- 任务 2.4（工具执行器）
- 安装 `ai` 依赖（Vercel AI SDK）

**验收标准**:
- LLM 正确选择工具
- 工具执行结果正确
- 添加单元测试（使用 mock）

**预计时间**: 3 小时

---

#### 2.6 重构 RAG Service 集成缓存和工具调用
**文件**: `src/services/ragService.ts`

**任务**:
- [ ] 注入 `RagCacheService` 和 `ToolCallingService`
- [ ] 修改 `chat` 方法
  - [ ] 在 Step 1 前检查缓存
  - [ ] 缓存命中时流式回放
- [ ] 修改 `runReActLoop` 中的 Step 3（工具选择）
  - [ ] 调用 `ToolCallingService.selectTools`
  - [ ] 执行选中的工具
  - [ ] 更新 agentState.toolsUsed
- [ ] 修改 Step 6（保存）
  - [ ] 调用 `RagCacheService.set` 写入缓存
- [ ] 更新 SSE 事件（添加缓存命中事件）
- [ ] 添加日志

**依赖**:
- 任务 2.2（缓存服务）
- 任务 2.5（工具调用服务）

**验收标准**:
- 缓存逻辑正常工作
- 工具选择和执行正确
- SSE 事件正确发送
- 添加集成测试

**预计时间**: 3 小时

---

#### 2.7 第二阶段测试和验证
**任务**:
- [ ] 编写端到端测试
- [ ] 测试缓存命中和未命中场景
- [ ] 测试工具选择逻辑
- [ ] 测试多工具执行场景
- [ ] 验证性能提升（缓存命中 <100ms）
- [ ] 代码审查和优化

**依赖**:
- 任务 2.6（集成完成）

**验收标准**:
- 所有测试通过
- 缓存命中率 >30%
- 代码质量良好

**预计时间**: 2 小时

---

### 第二阶段总结
**总预计时间**: 15 小时  
**关键里程碑**: 智能缓存和 LLM 工具选择系统

---

## 第三阶段：高级特性

### 阶段目标
实现记忆系统、Self-Reflection 和安全检查。

### 任务列表

#### 3.1 设计记忆数据库表
**文件**: `src/migrations/xxxx-create-user-memory.ts`

**任务**:
- [ ] 创建 `user_memory` 表
  - [ ] id (UUID)
  - [ ] user_id (UUID, 外键)
  - [ ] topic (VARCHAR)
  - [ ] content (TEXT)
  - [ ] embedding (VECTOR)
  - [ ] created_at (TIMESTAMP)
  - [ ] updated_at (TIMESTAMP)
- [ ] 添加索引（user_id, topic）
- [ ] 添加向量索引

**依赖**:
- 无

**验收标准**:
- 迁移脚本正确
- 索引创建成功
- 添加回滚脚本

**预计时间**: 1 小时

---

#### 3.2 实现记忆提取器
**文件**: `src/services/rag/memory/memoryExtractor.ts`

**任务**:
- [ ] 创建 `MemoryExtractor` 类
- [ ] 实现 `extract(conversationHistory)` 方法
  - [ ] 调用 LLM 提取显式记忆
  - [ ] 解析 LLM 返回的记忆列表
  - [ ] 分类记忆（topic）
- [ ] 添加日志

**依赖**:
- 安装 `ai` 依赖（Vercel AI SDK）

**验收标准**:
- LLM 正确提取记忆
- 记忆格式规范
- 添加单元测试（使用 mock）

**预计时间**: 2 小时

---

#### 3.3 实现记忆服务
**文件**: `src/services/rag/memory/memoryService.ts`

**任务**:
- [ ] 创建 `MemoryService` 类
- [ ] 实现 `store(userId, topic, content)` 方法
  - [ ] 生成 embedding
  - [ ] 写入数据库
  - [ ] 写入 Redis 缓存
- [ ] 实现 `recall(userId, query, topK)` 方法
  - [ ] 向量检索相关记忆
  - [ ] 返回记忆列表
- [ ] 实现 `delete(userId, memoryId)` 方法
- [ ] 添加日志

**依赖**:
- 任务 3.1（数据库表）
- 任务 3.2（记忆提取器）

**验收标准**:
- 记忆存储和召回正确
- Redis 缓存正常工作
- 添加单元测试

**预计时间**: 3 小时

---

#### 3.4 实现答案评估器
**文件**: `src/services/rag/reflection/answerEvaluator.ts`

**任务**:
- [ ] 创建 `AnswerEvaluator` 类
- [ ] 实现 `evaluate(query, answer, chunks)` 方法
  - [ ] 调用 LLM 评估答案质量
  - [ ] 评估五个维度：相关性、完整性、准确性、连贯性、引用质量
  - [ ] 返回评分和改进建议
- [ ] 添加日志

**依赖**:
- 安装 `ai` 依赖（Vercel AI SDK）

**验收标准**:
- LLM 评估结果合理
- 评分范围 0-1
- 添加单元测试（使用 mock）

**预计时间**: 2 小时

---

#### 3.5 实现 Self-Reflection 服务
**文件**: `src/services/rag/reflection/selfReflectionService.ts`

**任务**:
- [ ] 创建 `SelfReflectionService` 类
- [ ] 实现 `reflect(query, answer, chunks, maxRetries)` 方法
  - [ ] 调用 AnswerEvaluator 评估
  - [ ] 如果评分 <0.8，重新生成答案
  - [ ] 最多重试 3 次
  - [ ] 返回最佳答案和评分
- [ ] 添加日志

**依赖**:
- 任务 3.4（答案评估器）

**验收标准**:
- 重试逻辑正确
- 返回最佳答案
- 添加单元测试

**预计时间**: 2 小时

---

#### 3.6 实现安全检查服务
**文件**: `src/services/rag/safety/safetyGuard.ts`

**任务**:
- [ ] 创建 `SafetyGuard` 类
- [ ] 实现 `check(query)` 方法
  - [ ] 检测紧急关键词（医疗、法律、金融）
  - [ ] 返回是否需要降级
- [ ] 实现 `getSafetyPrompt()` 方法
  - [ ] 返回专用的安全 Prompt 模板
- [ ] 添加日志

**依赖**:
- 无

**验收标准**:
- 关键词检测准确
- 降级逻辑合理
- 添加单元测试

**预计时间**: 1.5 小时

---

#### 3.7 实现 Prompt 组装器
**文件**: `src/services/rag/promptAssembler.ts`

**任务**:
- [ ] 创建 `PromptAssembler` 类
- [ ] 实现 `assemble(query, chunks, memories, conversationHistory)` 方法
  - [ ] 合并所有上下文
  - [ ] 格式化为 LLM Prompt
  - [ ] 添加系统指令
- [ ] 实现 `assembleSafetyPrompt(query)` 方法
- [ ] 添加日志

**依赖**:
- 无

**验收标准**:
- Prompt 格式正确
- 上下文合并完整
- 添加单元测试

**预计时间**: 1.5 小时

---

#### 3.8 重构 RAG Service 集成高级特性
**文件**: `src/services/ragService.ts`

**任务**:
- [ ] 注入所有第三阶段服务
- [ ] 修改 `runReActLoop` 中的 Step 1（改写）
  - [ ] 调用 SafetyGuard 检查
  - [ ] 如果需要降级，使用安全 Prompt
- [ ] 修改 Step 4（检索）
  - [ ] 调用 MemoryService.recall 召回记忆
  - [ ] 合并记忆到上下文
- [ ] 修改 Step 5（生成）
  - [ ] 使用 PromptAssembler 组装 Prompt
  - [ ] 调用 SelfReflectionService 评估和重试
- [ ] 修改 Step 6（保存）
  - [ ] 调用 MemoryExtractor 提取记忆
  - [ ] 调用 MemoryService.store 存储记忆
- [ ] 更新 SSE 事件（添加记忆和反思事件）
- [ ] 添加日志

**依赖**:
- 任务 3.3（记忆服务）
- 任务 3.5（Self-Reflection 服务）
- 任务 3.6（安全检查服务）
- 任务 3.7（Prompt 组装器）

**验收标准**:
- 所有高级特性正常工作
- SSE 事件正确发送
- 添加集成测试

**预计时间**: 4 小时

---

#### 3.9 第三阶段测试和验证
**任务**:
- [ ] 编写端到端测试
- [ ] 测试记忆存储和召回
- [ ] 测试 Self-Reflection 重试逻辑
- [ ] 测试安全检查降级
- [ ] 验证完整的 RAG Agent 流程
- [ ] 性能测试和优化
- [ ] 代码审查

**依赖**:
- 任务 3.8（集成完成）

**验收标准**:
- 所有测试通过
- 性能符合预期
- 代码质量良好

**预计时间**: 3 小时

---

### 第三阶段总结
**总预计时间**: 20 小时  
**关键里程碑**: 完整的 RAG Agent 系统，包含记忆、反思和安全检查

---

## 项目总结

### 总预计时间
- 第一阶段：16.5 小时
- 第二阶段：15 小时
- 第三阶段：20 小时
- **总计**：51.5 小时

### 关键里程碑
1. **第一阶段完成**：多路检索链路上线
2. **第二阶段完成**：智能缓存和工具调用系统上线
3. **第三阶段完成**：完整的 RAG Agent 系统上线

### 风险和缓解措施
1. **API 依赖风险**（Cohere, Tavily）
   - 缓解：添加降级逻辑，API 失败时使用本地方案
2. **性能风险**（多路检索耗时）
   - 缓解：并行调用、缓存优化、超时控制
3. **LLM 工具选择不准确**
   - 缓解：优化 Prompt、添加示例、人工审核

### 后续优化方向
1. 替换 Cohere 为本地重排序模型（BGE-reranker）
2. 优化 BM25 中文分词效果
3. 添加更多工具（计算器、代码执行等）
4. 实现多轮对话的上下文管理
5. 添加用户反馈机制（点赞/点踩）

---

## 附录

### 依赖安装清单
```bash
npm install ioredis
npm install nodejieba
npm install @tavily/core
npm install cohere-ai
npm install tiktoken
npm install ai
```

### 环境变量配置
```env
# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# Cohere
COHERE_API_KEY=your_cohere_api_key

# Tavily
TAVILY_API_KEY=your_tavily_api_key

# OpenAI (for LLM tool calling)
OPENAI_API_KEY=your_openai_api_key
```

### 参考文档
- 设计文档：`docs/superpowers/specs/2026-04-24-rag-agent-refactor-design.md`
- RRF 论文：https://plg.uwaterloo.ca/~gvcormac/cormacksigir09-rrf.pdf
- Cohere Rerank API：https://docs.cohere.com/reference/rerank
- Tavily API：https://docs.tavily.com/
- Vercel AI SDK：https://sdk.vercel.ai/docs
