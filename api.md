# DocMind API 文档

## 目录
- [1. 用户管理接口](#1-用户管理接口)
- [2. 对话接口](#2-对话接口)
- [3. AI配置接口](#3-ai配置接口)
- [4. 知识库管理接口](#4-知识库管理接口)
- [5. MCP工具管理接口](#5-mcp工具管理接口)
- [6. 数据统计接口](#6-数据统计接口)
- [7. 知识库切片接口](#7-知识库切片接口)

---

## 1. 用户管理接口

**Base URL:** `/api/user`

### 1.1 找回密码

#### 发送找回密码验证码
- **接口:** `POST /api/user/forgot-password/send-code`
- **权限:** 无需登录
- **请求体:**
```json
{
  "username": "string"
}
```
- **响应:**
```json
{
  "code": 200,
  "message": "验证码已发送",
  "data": null
}
```

#### 验证码校验并重置密码
- **接口:** `POST /api/user/forgot-password/reset`
- **权限:** 无需登录
- **请求体:**
```json
{
  "username": "string",
  "code": "string",
  "newPassword": "string"
}
```
- **响应:**
```json
{
  "code": 200,
  "message": "密码重置成功",
  "data": null
}
```

### 1.2 登录注册

#### 用户登录
- **接口:** `POST /api/user/login`
- **权限:** 无需登录
- **请求体:**
```json
{
  "username": "string",
  "password": "string"
}
```
- **响应:**
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "token": "string",
    "userId": 1,
    "username": "string",
    "role": "string"
  }
}
```

#### 用户注册
- **接口:** `POST /api/user/register`
- **权限:** 无需登录
- **请求体:**
```json
{
  "username": "string",
  "password": "string",
  "email": "string"
}
```
- **响应:**
```json
{
  "code": 200,
  "message": "success",
  "data": null
}
```

### 1.3 用户信息管理

#### 获取当前用户信息
- **接口:** `GET /api/user/info`
- **权限:** 需要登录
- **响应:**
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "id": 1,
    "username": "string",
    "email": "string",
    "avatar": "string",
    "role": "string",
    "preference": "string"
  }
}
```

#### 更新用户信息
- **接口:** `PUT /api/user/info`
- **权限:** 需要登录
- **请求体:**
```json
{
  "email": "string",
  "avatar": "string"
}
```
- **响应:**
```json
{
  "code": 200,
  "message": "success",
  "data": null
}
```

#### 上传头像
- **接口:** `POST /api/user/avatar`
- **权限:** 需要登录
- **请求参数:** `file` (MultipartFile)
- **响应:**
```json
{
  "code": 200,
  "message": "头像更新成功",
  "data": "https://example.com/avatar.jpg"
}
```

#### 更新用户偏好
- **接口:** `PUT /api/user/preference`
- **权限:** 需要登录
- **请求体:** `string` (JSON格式的偏好设置)
- **响应:**
```json
{
  "code": 200,
  "message": "success",
  "data": null
}
```

### 1.4 管理员接口

#### 分页查询用户列表
- **接口:** `GET /api/user/list`
- **权限:** ADMIN
- **请求参数:**
  - `current` (默认: 1)
  - `size` (默认: 10)
  - `keyword` (可选)
- **响应:**
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "records": [],
    "total": 100,
    "current": 1,
    "size": 10
  }
}
```

#### 修改用户状态
- **接口:** `PUT /api/user/{userId}/status`
- **权限:** ADMIN
- **请求参数:** `status` (Integer)
- **响应:**
```json
{
  "code": 200,
  "message": "success",
  "data": null
}
```

#### 修改用户角色
- **接口:** `PUT /api/user/{userId}/role`
- **权限:** ADMIN
- **请求参数:** `role` (String)
- **响应:**
```json
{
  "code": 200,
  "message": "success",
  "data": null
}
```

---

## 2. 对话接口

### 2.1 旧版对话接口 (v1)

**Base URL:** `/api/chat`

#### SSE流式对话
- **接口:** `GET /api/chat/stream`
- **权限:** 需要登录
- **请求参数:**
  - `conversationId` (可选): 会话ID
  - `message`: 用户消息
- **响应:** Server-Sent Events (SSE) 流式返回

#### 获取会话列表
- **接口:** `GET /api/chat/conversations`
- **权限:** 需要登录
- **请求参数:**
  - `current` (默认: 1)
  - `size` (默认: 20)
- **响应:**
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "records": [
      {
        "id": 1,
        "title": "string",
        "userId": 1,
        "createTime": "2024-01-01T00:00:00",
        "lastActive": "2024-01-01T00:00:00"
      }
    ],
    "total": 100
  }
}
```

#### 获取会话消息历史
- **接口:** `GET /api/chat/history/{conversationId}`
- **权限:** 需要登录
- **请求参数:**
  - `current` (默认: 1)
  - `size` (默认: 50)
- **响应:**
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "records": [
      {
        "id": 1,
        "conversationId": 1,
        "role": "user",
        "content": "string",
        "sources": "string",
        "feedback": 1,
        "responseTime": 1000,
        "createTime": "2024-01-01T00:00:00"
      }
    ],
    "total": 50
  }
}
```

#### 获取检索过程详情
- **接口:** `GET /api/chat/retrieval-log/{messageId}`
- **权限:** 需要登录
- **响应:**
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "retrievalSteps": []
  }
}
```

#### 删除会话
- **接口:** `DELETE /api/chat/conversations/{conversationId}`
- **权限:** 需要登录
- **响应:**
```json
{
  "code": 200,
  "message": "success",
  "data": null
}
```

#### 提交消息反馈
- **接口:** `POST /api/chat/feedback`
- **权限:** 需要登录
- **请求体:**
```json
{
  "messageId": 1,
  "rating": 1
}
```
- **响应:**
```json
{
  "code": 200,
  "message": "success",
  "data": null
}
```

#### 导出会话为Markdown
- **接口:** `GET /api/chat/export/{conversationId}`
- **权限:** 需要登录
- **响应:** 下载Markdown文件

### 2.2 新版对话接口 (v2)

**Base URL:** `/api/v2/chat`

#### SSE流式问答
- **接口:** `GET /api/v2/chat/stream`
- **权限:** 需要登录
- **请求参数:**
  - `conversationId` (可选): 会话ID
  - `message`: 用户消息
  - `kbIds` (可选): 知识库ID列表，逗号分隔，如 "1,2,3"
- **响应:** Server-Sent Events (SSE) 流式返回

#### 获取会话列表
- **接口:** `GET /api/v2/chat/conversations`
- **权限:** 需要登录
- **请求参数:**
  - `current` (默认: 1)
  - `size` (默认: 20)
- **响应:** 同v1

#### 获取会话消息历史
- **接口:** `GET /api/v2/chat/history/{conversationId}`
- **权限:** 需要登录
- **请求参数:**
  - `current` (默认: 1)
  - `size` (默认: 50)
- **响应:** 同v1

#### 删除会话
- **接口:** `DELETE /api/v2/chat/conversations/{conversationId}`
- **权限:** 需要登录
- **响应:** 同v1

#### 提交消息反馈
- **接口:** `POST /api/v2/chat/feedback`
- **权限:** 需要登录
- **请求体:**
```json
{
  "messageId": 1,
  "rating": 1
}
```
- **响应:** 同v1

#### 导出会话为Markdown
- **接口:** `GET /api/v2/chat/export/{conversationId}`
- **权限:** 需要登录
- **响应:** 下载Markdown文件

#### 获取Agent推理链
- **接口:** `GET /api/v2/chat/agent-trace/{messageId}`
- **权限:** 需要登录
- **响应:**
```json
{
  "code": 200,
  "message": "success",
  "data": [
    {
      "step": 1,
      "thought": "string",
      "action": "string",
      "observation": "string"
    }
  ]
}
```

---

## 3. AI配置接口

**Base URL:** `/api/admin/ai-config`

**权限:** 仅管理员可访问

#### 查询全部配置
- **接口:** `GET /api/admin/ai-config/list`
- **响应:**
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "rag": [
      {
        "id": 1,
        "groupName": "rag",
        "configKey": "vector_top_k",
        "configValue": "10",
        "description": "向量检索Top K"
      }
    ],
    "llm": []
  }
}
```

#### 批量更新配置
- **接口:** `PUT /api/admin/ai-config/batch`
- **请求体:**
```json
{
  "rag.vector_top_k": "15",
  "llm.model": "qwen-max"
}
```
- **响应:**
```json
{
  "code": 200,
  "message": "success",
  "data": null
}
```

#### 重置指定分组为默认值
- **接口:** `POST /api/admin/ai-config/reset/{groupName}`
- **响应:**
```json
{
  "code": 200,
  "message": "success",
  "data": null
}
```

#### 重置全部配置为默认值
- **接口:** `POST /api/admin/ai-config/reset-all`
- **响应:**
```json
{
  "code": 200,
  "message": "success",
  "data": null
}
```

#### 获取可选模型列表
- **接口:** `GET /api/admin/ai-config/models`
- **响应:**
```json
{
  "code": 200,
  "message": "success",
  "data": ["qwen-turbo", "qwen-plus", "qwen-max", "qwen-max-longcontext"]
}
```

---

## 4. 知识库管理接口

### 4.1 旧版知识库接口 (v1)

**Base URL:** `/api/knowledge`

#### 上传文档
- **接口:** `POST /api/knowledge/upload`
- **权限:** ADMIN
- **请求参数:**
  - `file`: MultipartFile
  - `category`: String
  - `description`: String (可选)
- **响应:**
```json
{
  "code": 200,
  "message": "上传成功，正在后台处理...",
  "data": 1
}
```

#### 分页查询知识库列表
- **接口:** `GET /api/knowledge/list`
- **权限:** 需要登录
- **请求参数:**
  - `current` (默认: 1)
  - `size` (默认: 10)
  - `category` (可选)
  - `status` (可选)
- **响应:**
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "records": [
      {
        "id": 1,
        "name": "string",
        "category": "string",
        "status": "completed",
        "fileUrl": "string",
        "createTime": "2024-01-01T00:00:00"
      }
    ],
    "total": 100
  }
}
```

#### 获取知识库详情
- **接口:** `GET /api/knowledge/{id}`
- **权限:** 需要登录
- **响应:**
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "id": 1,
    "name": "string",
    "category": "string",
    "description": "string",
    "fileUrl": "string",
    "status": "completed"
  }
}
```

#### 删除知识库
- **接口:** `DELETE /api/knowledge/{id}`
- **权限:** ADMIN
- **响应:**
```json
{
  "code": 200,
  "message": "success",
  "data": null
}
```

#### 重新处理
- **接口:** `POST /api/knowledge/{id}/reprocess`
- **权限:** ADMIN
- **响应:**
```json
{
  "code": 200,
  "message": "已重新提交处理",
  "data": null
}
```

#### 获取所有分类
- **接口:** `GET /api/knowledge/categories`
- **权限:** 需要登录
- **响应:**
```json
{
  "code": 200,
  "message": "success",
  "data": ["医学", "法律", "技术"]
}
```

### 4.2 新版知识库接口 (v2)

**Base URL:** `/api/v2/kb`

#### 分页获取知识库列表
- **接口:** `GET /api/v2/kb/list`
- **权限:** 需要登录
- **请求参数:**
  - `page` (默认: 1)
  - `size` (默认: 10)
  - `category` (可选)
- **响应:** 同v1

#### 获取知识库详情
- **接口:** `GET /api/v2/kb/{id}`
- **权限:** 需要登录
- **响应:**
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "id": 1,
    "name": "string",
    "category": "string",
    "description": "string",
    "fileUrl": "string",
    "fileType": "pdf",
    "fileSize": 1024000,
    "chunkCount": 100,
    "status": "completed",
    "errorMsg": null,
    "userId": 1,
    "createTime": "2024-01-01T00:00:00",
    "updateTime": "2024-01-01T00:00:00"
  }
}
```

#### 删除知识库
- **接口:** `DELETE /api/v2/kb/{id}`
- **权限:** ADMIN
- **响应:** 同v1

#### 获取所有分类列表
- **接口:** `GET /api/v2/kb/categories`
- **权限:** 需要登录
- **响应:** 同v1

#### 更新知识库信息
- **接口:** `PUT /api/v2/kb/{id}`
- **权限:** ADMIN
- **请求体:**
```json
{
  "name": "string",
  "description": "string",
  "category": "string"
}
```
- **响应:**
```json
{
  "code": 200,
  "message": "success",
  "data": null
}
```

#### 上传文件并创建知识库
- **接口:** `POST /api/v2/kb/upload`
- **权限:** ADMIN
- **请求参数:**
  - `file`: MultipartFile
  - `name`: String (可选)
  - `category`: String
  - `description`: String (可选)
- **响应:**
```json
{
  "code": 200,
  "message": "上传成功，正在后台处理...",
  "data": 1
}
```

---

## 5. MCP工具管理接口

**Base URL:** `/api/mcp`

#### 获取所有工具列表
- **接口:** `GET /api/mcp/tools`
- **权限:** 需要登录
- **响应:**
```json
{
  "code": 200,
  "message": "success",
  "data": [
    {
      "id": 1,
      "name": "doc_search",
      "description": "文档搜索工具",
      "mode": "builtin",
      "status": "active",
      "callCount": 100,
      "avgLatencyMs": 500
    }
  ]
}
```

#### 获取单个工具详情
- **接口:** `GET /api/mcp/tools/{id}`
- **权限:** 需要登录
- **响应:**
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "id": 1,
    "name": "doc_search",
    "description": "文档搜索工具",
    "mode": "builtin",
    "status": "active",
    "callCount": 100,
    "avgLatencyMs": 500
  }
}
```

#### 更新工具状态
- **接口:** `PUT /api/mcp/tools/{id}/status`
- **权限:** 需要登录
- **请求体:**
```json
{
  "status": "active"
}
```
- **说明:** status 可选值: "active" 或 "disabled"
- **响应:**
```json
{
  "code": 200,
  "message": "success",
  "data": null
}
```

#### 工具调用统计汇总
- **接口:** `GET /api/mcp/stats`
- **权限:** 需要登录
- **响应:**
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "totalTools": 5,
    "activeTools": 4,
    "disabledTools": 1,
    "totalCallCount": 1000,
    "avgLatencyMs": 450,
    "topTool": "doc_search",
    "toolDetails": [
      {
        "id": 1,
        "name": "doc_search",
        "callCount": 500,
        "avgLatencyMs": 400,
        "status": "active"
      }
    ]
  }
}
```

#### 测试工具连通性
- **接口:** `POST /api/mcp/tools/{id}/test`
- **权限:** 需要登录
- **响应:**
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "toolId": 1,
    "toolName": "doc_search",
    "mode": "builtin",
    "status": "active",
    "testResult": "SUCCESS",
    "message": "工具调用正常",
    "latencyMs": 123,
    "timestamp": 1704067200000,
    "sampleOutput": {}
  }
}
```

---

## 6. 数据统计接口

**Base URL:** `/api/v2/stats`

#### 总览数据
- **接口:** `GET /api/v2/stats/overview`
- **权限:** 需要登录
- **响应:**
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "totalQuestions": 1000,
    "totalKb": 50,
    "totalUsers": 100,
    "totalConversations": 500,
    "todayQuestions": 50
  }
}
```

#### 近N天问答趋势
- **接口:** `GET /api/v2/stats/trend`
- **权限:** 需要登录
- **请求参数:**
  - `days` (默认: 7, 范围: 1-90)
- **响应:**
```json
{
  "code": 200,
  "message": "success",
  "data": [
    {
      "date": "2024-01-01",
      "count": 50
    },
    {
      "date": "2024-01-02",
      "count": 60
    }
  ]
}
```

#### Tool调用分布
- **接口:** `GET /api/v2/stats/tool-distribution`
- **权限:** 需要登录
- **响应:**
```json
{
  "code": 200,
  "message": "success",
  "data": [
    {
      "toolName": "doc_search",
      "callCount": 500,
      "percentage": 50.0,
      "status": "active"
    }
  ]
}
```

#### 热门知识库排行
- **接口:** `GET /api/v2/stats/hot-kb`
- **权限:** 需要登录
- **响应:**
```json
{
  "code": 200,
  "message": "success",
  "data": [
    {
      "kbId": 1,
      "kbName": "医学知识库",
      "queryCount": 200,
      "status": "completed"
    }
  ]
}
```

#### 平均响应时间统计
- **接口:** `GET /api/v2/stats/response-time`
- **权限:** 需要登录
- **响应:**
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "avgResponseTimeMs": 1500,
    "minResponseTimeMs": 500,
    "maxResponseTimeMs": 5000,
    "sampleCount": 1000,
    "dailyTrend": [
      {
        "date": "2024-01-01",
        "avgMs": 1400
      }
    ]
  }
}
```

---

## 7. 知识库切片接口

**Base URL:** `/api/kb/chunks`

#### 分页获取切片列表
- **接口:** `GET /api/kb/chunks`
- **权限:** 需要登录
- **请求参数:**
  - `kbId`: Long (必填)
  - `page` (默认: 1)
  - `size` (默认: 20)
- **响应:**
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "records": [
      {
        "id": 1,
        "kbId": 1,
        "content": "string",
        "chunkIndex": 0,
        "metadata": "string"
      }
    ],
    "total": 100
  }
}
```

#### 获取单个切片详情
- **接口:** `GET /api/kb/chunks/{id}`
- **权限:** 需要登录
- **响应:**
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "id": 1,
    "kbId": 1,
    "content": "string",
    "chunkIndex": 0,
    "metadata": "string"
  }
}
```

#### 关键词搜索切片
- **接口:** `GET /api/kb/chunks/search`
- **权限:** 需要登录
- **请求参数:**
  - `kbId`: Long (必填)
  - `keyword`: String (必填)
- **说明:** 使用中文分词 + BM25算法进行搜索
- **响应:**
```json
{
  "code": 200,
  "message": "success",
  "data": [
    {
      "id": 1,
      "kbId": 1,
      "content": "string",
      "metadata": "contentType=text, chapter=第一章, pageNumber=1"
    }
  ]
}
```

---

## 通用响应格式

所有接口统一使用以下响应格式：

```json
{
  "code": 200,
  "message": "success",
  "data": {}
}
```

### 状态码说明

- `200`: 成功
- `400`: 请求参数错误
- `401`: 未授权（未登录）
- `403`: 权限不足
- `404`: 资源不存在
- `500`: 服务器内部错误

### 分页响应格式

```json
{
  "records": [],
  "total": 100,
  "current": 1,
  "size": 10
}
```

---

## 认证说明

大部分接口需要在请求头中携带JWT Token：

```
Authorization: Bearer {token}
```

Token通过登录接口获取，有效期根据系统配置而定。

---

## 权限说明

- **无需登录**: 可直接访问
- **需要登录**: 需要携带有效Token
- **ADMIN**: 需要管理员角色权限

---

## 附录

### SSE (Server-Sent Events) 说明

流式对话接口使用SSE协议，客户端需要：
1. 设置 `Accept: text/event-stream`
2. 监听 `message` 事件接收数据
3. 处理连接关闭和错误

### 文件上传说明

文件上传接口使用 `multipart/form-data` 格式，支持的文件类型：
- PDF (.pdf)
- Word (.doc, .docx)
- Text (.txt)
- Markdown (.md)

文件大小限制根据系统配置而定。
