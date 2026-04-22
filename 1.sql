CREATE DATABASE IF NOT EXISTS docmind;
use docmind;
SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------
-- Table structure for kb_chunk
-- ----------------------------
DROP TABLE IF EXISTS `kb_chunk`;
CREATE TABLE `kb_chunk`  (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `kb_id` bigint NOT NULL COMMENT '所属知识库ID',
  `content` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '切片文本内容',
  `chunk_index` int NULL DEFAULT NULL COMMENT '切片顺序索引',
  `metadata` json NULL COMMENT '元数据(页码、章节标题等)',
  `vector_id` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT 'Milvus中对应的向量ID',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`) USING BTREE,
  INDEX `idx_kb_id`(`kb_id` ASC) USING BTREE,
  FULLTEXT INDEX `ft_kb_chunk_content_ngram`(`content`) WITH PARSER `ngram`
) ENGINE = InnoDB AUTO_INCREMENT = 25 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = '文档切片表' ROW_FORMAT = DYNAMIC;

-- ----------------------------
-- Table structure for kb_knowledge_base
-- ----------------------------
DROP TABLE IF EXISTS `kb_knowledge_base`;
CREATE TABLE `kb_knowledge_base`  (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `name` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '知识库/文档名称',
  `category` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT '分类(技术/法律/医疗/通用等)',
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL COMMENT '描述',
  `file_url` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT '原始文件存储路径(MinIO)',
  `file_type` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT '文件类型: pdf/docx/md/txt',
  `file_size` bigint NULL DEFAULT NULL COMMENT '文件大小(字节)',
  `chunk_count` int NOT NULL DEFAULT 0 COMMENT '切片数量',
  `status` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'uploading' COMMENT '状态: uploading/processing/ready/error',
  `error_msg` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL COMMENT '错误信息',
  `user_id` bigint NOT NULL COMMENT '创建者用户ID',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` tinyint NOT NULL DEFAULT 0 COMMENT '逻辑删除: 0正常 1删除',
  PRIMARY KEY (`id`) USING BTREE,
  INDEX `idx_category`(`category` ASC) USING BTREE,
  INDEX `idx_user_id`(`user_id` ASC) USING BTREE,
  INDEX `idx_status`(`status` ASC) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 10 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = '知识库文档表' ROW_FORMAT = DYNAMIC;

-- ----------------------------
-- Table structure for mcp_tool_registry
-- ----------------------------
DROP TABLE IF EXISTS `mcp_tool_registry`;
CREATE TABLE `mcp_tool_registry`  (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '工具名称',
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL COMMENT '工具描述',
  `mode` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'embedded' COMMENT '模式: embedded/remote',
  `call_count` bigint NOT NULL DEFAULT 0 COMMENT '调用次数',
  `avg_latency_ms` int NOT NULL DEFAULT 0 COMMENT '平均延迟(ms)',
  `status` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active' COMMENT '状态: active/disabled',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE INDEX `uk_name`(`name` ASC) USING BTREE,
  INDEX `idx_status`(`status` ASC) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 10 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = 'MCP工具注册表' ROW_FORMAT = DYNAMIC;

-- ----------------------------
-- Table structure for qa_conversation
-- ----------------------------
DROP TABLE IF EXISTS `qa_conversation`;
CREATE TABLE `qa_conversation`  (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `user_id` bigint NOT NULL COMMENT '关联用户ID',
  `title` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT '会话标题(首次提问自动生成)',
  `kb_ids` json NULL COMMENT '关联的知识库ID列表',
  `message_count` int NOT NULL DEFAULT 0 COMMENT '消息条数',
  `last_active` datetime NULL DEFAULT NULL COMMENT '最后活跃时间',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` tinyint NOT NULL DEFAULT 0 COMMENT '逻辑删除: 0正常 1删除',
  PRIMARY KEY (`id`) USING BTREE,
  INDEX `idx_user_id`(`user_id` ASC) USING BTREE,
  INDEX `idx_last_active`(`last_active` ASC) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 15 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = '对话会话表' ROW_FORMAT = DYNAMIC;

-- ----------------------------
-- Table structure for qa_message
-- ----------------------------
DROP TABLE IF EXISTS `qa_message`;
CREATE TABLE `qa_message`  (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `conversation_id` bigint NOT NULL COMMENT '关联会话ID',
  `role` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '角色: user/assistant',
  `content` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '消息内容(支持Markdown)',
  `sources` json NULL COMMENT '文档来源(文档名、页码、片段)',
  `agent_trace` json NULL COMMENT 'ReAct推理链(思考→行动→观察)',
  `mcp_calls` json NULL COMMENT 'Tool调用记录',
  `reflection_log` json NULL COMMENT '自纠错审查日志',
  `feedback` tinyint NOT NULL DEFAULT 0 COMMENT '反馈: 1有用 -1无用 0未评',
  `tokens_used` int NULL DEFAULT NULL COMMENT 'Token消耗',
  `response_time` int NULL DEFAULT NULL COMMENT '响应时间(毫秒)',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`) USING BTREE,
  INDEX `idx_conversation_id`(`conversation_id` ASC) USING BTREE,
  INDEX `idx_create_time`(`create_time` ASC) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 29 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = '对话消息表' ROW_FORMAT = DYNAMIC;

-- ----------------------------
-- Table structure for sys_ai_config
-- ----------------------------
DROP TABLE IF EXISTS `sys_ai_config`;
CREATE TABLE `sys_ai_config`  (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `config_key` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '配置键(全局唯一)',
  `config_value` varchar(512) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '当前配置值',
  `value_type` varchar(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL DEFAULT 'string' COMMENT '值类型: string/integer/float',
  `group_name` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '分组: rag/llm/cache/safety',
  `label` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '前端展示名称',
  `description` varchar(256) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '配置说明',
  `default_value` varchar(512) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '出厂默认值',
  `min_value` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '最小值约束',
  `max_value` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '最大值约束',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` tinyint(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除',
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE INDEX `uk_config_key`(`config_key` ASC) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 23 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci COMMENT = 'AI动态配置表' ROW_FORMAT = DYNAMIC;

-- ----------------------------
-- Records of sys_ai_config
-- ----------------------------
INSERT INTO `sys_ai_config` VALUES (1, 'rag.vector_top_k', '10', 'integer', 'rag', '向量召回 Top-K', '向量检索返回的最大文档数', '10', '1', '50', '2026-03-30 10:36:10', '2026-03-30 10:36:10', 0);
INSERT INTO `sys_ai_config` VALUES (2, 'rag.bm25_top_k', '10', 'integer', 'rag', 'BM25 召回 Top-K', 'BM25 检索返回的最大文档数', '10', '1', '50', '2026-03-30 10:36:10', '2026-03-30 10:36:10', 0);
INSERT INTO `sys_ai_config` VALUES (3, 'rag.rerank_top_n', '5', 'integer', 'rag', '重排序 Top-N', '重排序后保留的文档数', '5', '1', '20', '2026-03-30 10:36:10', '2026-03-30 10:36:10', 0);
INSERT INTO `sys_ai_config` VALUES (4, 'rag.chunk_size', '512', 'integer', 'rag', '切片大小', '文档切片的最大字符数', '512', '128', '2048', '2026-03-30 10:36:10', '2026-03-30 10:36:10', 0);
INSERT INTO `sys_ai_config` VALUES (5, 'rag.chunk_overlap', '64', 'integer', 'rag', '切片重叠', '相邻切片的重叠字符数', '64', '0', '512', '2026-03-30 10:36:10', '2026-03-30 10:36:10', 0);
INSERT INTO `sys_ai_config` VALUES (6, 'llm.model', 'qwen-plus', 'string', 'llm', '模型名称', '当前使用的 LLM 模型名称', 'qwen-plus', NULL, NULL, '2026-03-30 10:36:10', '2026-03-30 10:36:10', 0);
INSERT INTO `sys_ai_config` VALUES (7, 'llm.temperature', '0.7', 'float', 'llm', 'Temperature', 'LLM 生成多样性参数（兼容旧配置）', '0.7', '0', '2', '2026-03-30 10:36:10', '2026-03-30 10:36:10', 0);
INSERT INTO `sys_ai_config` VALUES (8, 'llm.chat_temperature', '0.7', 'float', 'llm', '对话模型 Temperature', '普通对话模型的温度参数', '0.7', '0', '2', '2026-03-30 10:36:10', '2026-03-30 10:36:10', 0);
INSERT INTO `sys_ai_config` VALUES (9, 'llm.streaming_temperature', '0.7', 'float', 'llm', '流式模型 Temperature', 'SSE 流式对话模型的温度参数', '0.7', '0', '2', '2026-03-30 10:36:10', '2026-03-30 10:36:10', 0);
INSERT INTO `sys_ai_config` VALUES (10, 'llm.timeout_seconds', '60', 'integer', 'llm', '请求超时(秒)', 'LLM 请求超时时间（秒）', '60', '10', '300', '2026-03-30 10:36:10', '2026-03-30 10:36:10', 0);
INSERT INTO `sys_ai_config` VALUES (11, 'llm.max_tokens', '2048', 'integer', 'llm', '最大输出Token', 'LLM 单次最大输出 Token 数', '2048', '256', '8192', '2026-03-30 10:36:10', '2026-03-30 10:36:10', 0);
INSERT INTO `sys_ai_config` VALUES (12, 'cache.enable', 'true', 'string', 'cache', '启用缓存', '是否启用 RAG 结果缓存', 'true', NULL, NULL, '2026-03-30 10:36:10', '2026-03-30 10:36:10', 0);
INSERT INTO `sys_ai_config` VALUES (13, 'cache.ttl_seconds', '3600', 'integer', 'cache', '缓存TTL(秒)', 'RAG 缓存有效期（秒）', '3600', '60', '86400', '2026-03-30 10:36:10', '2026-03-30 10:36:10', 0);
INSERT INTO `sys_ai_config` VALUES (14, 'cache.ttl_hours', '1', 'integer', 'cache', '缓存TTL(小时)', 'RAG 缓存有效期（小时）', '1', '1', '720', '2026-03-30 10:36:10', '2026-03-30 10:36:10', 0);
INSERT INTO `sys_ai_config` VALUES (15, 'cache.freq_threshold', '2', 'integer', 'cache', '缓存频次阈值', '同一问题达到该频次后才检查缓存', '2', '1', '100', '2026-03-30 10:36:10', '2026-03-30 10:36:10', 0);
INSERT INTO `sys_ai_config` VALUES (16, 'safety.enable_guard', 'true', 'string', 'safety', '启用安全过滤', '是否开启内容安全审查', 'true', NULL, NULL, '2026-03-30 10:36:10', '2026-03-30 10:36:10', 0);
INSERT INTO `sys_ai_config` VALUES (17, 'safety.max_retries', '2', 'integer', 'safety', '最大自纠错次数', 'ReAct 自纠错最大重试轮数', '2', '0', '5', '2026-03-30 10:36:10', '2026-03-30 10:36:10', 0);
INSERT INTO `sys_ai_config` VALUES (18, 'safety.confidence_threshold', '0.6', 'float', 'safety', '置信度阈值', '低于此分数触发兜底回答', '0.6', '0', '1', '2026-03-30 10:36:10', '2026-03-30 10:36:10', 0);
INSERT INTO `sys_ai_config` VALUES (19, 'safety.fallback_msg', '抱歉，我暂时无法回答该问题，请联系管理员。', 'string', 'safety', '兜底话术', '无法回答时的默认提示语', '抱歉，我暂时无法回答该问题，请联系管理员。', NULL, NULL, '2026-03-30 10:36:10', '2026-03-30 10:36:10', 0);
INSERT INTO `sys_ai_config` VALUES (20, 'rag.rrf_top_n', '20', 'integer', 'rag', 'RRF融合 Top-N', 'RRF 融合后保留的候选文档数', '20', '5', '100', '2026-03-30 10:36:10', '2026-03-30 10:36:10', 0);
INSERT INTO `sys_ai_config` VALUES (21, 'rag.rerank_top_k', '6', 'integer', 'rag', '重排序 Top-K', '重排序后最终保留的文档数', '5', '1', '20', '2026-03-30 10:36:10', '2026-03-30 10:36:10', 0);
INSERT INTO `sys_ai_config` VALUES (22, 'rag.rrf_k_constant', '60', 'integer', 'rag', 'RRF K常数', 'RRF 算法平滑常数，标准值为60', '60', '1', '200', '2026-03-30 10:36:10', '2026-03-30 10:36:10', 0);

-- ----------------------------
-- Table structure for sys_user
-- ----------------------------
DROP TABLE IF EXISTS `sys_user`;
CREATE TABLE `sys_user`  (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `username` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '用户名（唯一）',
  `password` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '密码(BCrypt加密)',
  `nickname` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT '昵称',
  `avatar` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT '头像URL',
  `role` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'user' COMMENT '角色: admin/user',
  `preference` json NULL COMMENT '用户偏好(领域、语言风格等)',
  `status` tinyint NOT NULL DEFAULT 1 COMMENT '状态: 0禁用 1正常',
  `last_login` datetime NULL DEFAULT NULL COMMENT '最后登录时间',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted` tinyint NOT NULL DEFAULT 0 COMMENT '逻辑删除: 0正常 1删除',
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE INDEX `uk_username`(`username` ASC) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 4 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = '系统用户表' ROW_FORMAT = DYNAMIC;

-- ----------------------------
-- Records of sys_user
-- ----------------------------
INSERT INTO `sys_user` VALUES (1, 'admin', '$2a$10$yTs1cG5twvTjCp1uFzO20uFuC77vdAYNkqspfcMNr8owiTuBk77/u', '管理员', NULL, 'admin', NULL, 1, '2026-04-02 16:11:32', '2026-03-30 10:36:10', '2026-03-30 10:37:51', 0);
INSERT INTO `sys_user` VALUES (2, 'simon', '$2a$10$yTs1cG5twvTjCp1uFzO20uFuC77vdAYNkqspfcMNr8owiTuBk77/u', 'sss', NULL, 'user', NULL, 1, '2026-03-30 10:37:01', '2026-03-30 10:36:58', '2026-03-30 10:36:58', 0);
INSERT INTO `sys_user` VALUES (3, 'codex0331201014', '$2a$10$SJLJSE5uNRIT2BoWVnTwI.x0I7X/NCkwDrWUd0BotIi/2UTb8VNiO', 'Codex Smoke', NULL, 'user', NULL, 1, '2026-03-31 20:10:24', '2026-03-31 20:10:15', '2026-03-31 20:10:15', 0);

SET FOREIGN_KEY_CHECKS = 1;
