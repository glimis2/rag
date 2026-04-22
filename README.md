# DocMind RAG System

基于 Node.js + Express + TypeORM + MySQL + Milvus 的 RAG (检索增强生成) 系统。

## 技术栈

- **后端框架**: Express.js
- **数据库**: MySQL 8.0+
- **ORM**: TypeORM
- **向量数据库**: Milvus
- **语言**: TypeScript
- **认证**: JWT
- **文件上传**: Multer

## 项目结构

```
node_rag/
├── src/
│   ├── config/           # 配置文件
│   │   └── database.ts   # 数据库配置
│   ├── controllers/      # 控制器
│   │   ├── user.controller.ts
│   │   ├── chat.controller.ts
│   │   ├── knowledge.controller.ts
│   │   ├── aiConfig.controller.ts
│   │   ├── mcp.controller.ts
│   │   └── stats.controller.ts
│   ├── entities/         # 数据库实体
│   │   ├── User.ts
│   │   ├── KnowledgeBase.ts
│   │   ├── Chunk.ts
│   │   ├── Conversation.ts
│   │   ├── Message.ts
│   │   ├── AiConfig.ts
│   │   └── McpToolRegistry.ts
│   ├── middleware/       # 中间件
│   │   ├── auth.ts
│   │   ├── admin.ts
│   │   ├── upload.ts
│   │   └── errorHandler.ts
│   ├── routes/           # 路由
│   │   ├── index.ts
│   │   ├── user.routes.ts
│   │   ├── chat.routes.ts
│   │   ├── knowledge.routes.ts
│   │   ├── aiConfig.routes.ts
│   │   ├── mcp.routes.ts
│   │   └── stats.routes.ts
│   └── index.ts          # 入口文件
├── uploads/              # 文件上传目录
├── .env                  # 环境变量
├── .env.example          # 环境变量示例
├── package.json
├── tsconfig.json
└── README.md
```

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

复制 `.env.example` 为 `.env` 并修改配置：

```bash
cp .env.example .env
```

编辑 `.env` 文件：

```env
PORT=3000
NODE_ENV=development

# 数据库配置
DB_HOST=localhost
DB_PORT=3306
DB_USERNAME=root
DB_PASSWORD=your_password
DB_DATABASE=docmind

# JWT 配置
JWT_SECRET=your-secret-key-change-in-production
JWT_EXPIRES_IN=7d

# Milvus 配置
MILVUS_ADDRESS=localhost:19530

# 文件上传配置
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=10485760
```

### 3. 初始化数据库

执行 `1.sql` 文件创建数据库和表：

```bash
mysql -u root -p < 1.sql
```

### 4. 启动开发服务器

```bash
npm run dev
```

服务器将在 `http://localhost:3000` 启动。

### 5. 构建生产版本

```bash
npm run build
npm start
```

## API 文档

详细的 API 文档请参考 `api.md` 文件。

### 主要接口模块

- **用户管理** (`/api/user`): 注册、登录、用户信息管理
- **对话接口** (`/api/chat`, `/api/v2/chat`): SSE 流式对话、会话管理
- **知识库管理** (`/api/knowledge`, `/api/v2/kb`): 文档上传、管理、检索
- **AI 配置** (`/api/admin/ai-config`): RAG 参数配置
- **MCP 工具** (`/api/mcp`): 工具注册、调用统计
- **数据统计** (`/api/v2/stats`): 系统数据统计

## 数据库表说明

- `sys_user`: 系统用户表
- `kb_knowledge_base`: 知识库文档表
- `kb_chunk`: 文档切片表
- `qa_conversation`: 对话会话表
- `qa_message`: 对话消息表
- `sys_ai_config`: AI 动态配置表
- `mcp_tool_registry`: MCP 工具注册表

## 开发说明

### 添加新的 API 接口

1. 在 `src/entities/` 创建实体类
2. 在 `src/controllers/` 创建控制器
3. 在 `src/routes/` 创建路由文件
4. 在 `src/routes/index.ts` 注册路由

### 中间件说明

- `authMiddleware`: JWT 认证中间件
- `adminMiddleware`: 管理员权限验证
- `upload`: 文件上传处理
- `errorHandler`: 全局错误处理

## 待实现功能

- [ ] RAG 检索管道实现
- [ ] Milvus 向量数据库集成
- [ ] 文档切片和向量化
- [ ] LLM 集成 (通义千问)
- [ ] ReAct Agent 实现
- [ ] MCP 工具调用
- [ ] 缓存机制
- [ ] 安全过滤
- [ ] 会话导出为 Markdown

## 许可证

MIT
