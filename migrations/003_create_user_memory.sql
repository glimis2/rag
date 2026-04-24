-- 创建用户记忆表
CREATE TABLE IF NOT EXISTS `user_memory` (
  `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
  `user_id` BIGINT NOT NULL COMMENT '用户ID',
  `topic` VARCHAR(255) NOT NULL COMMENT '记忆主题',
  `content` TEXT NOT NULL COMMENT '记忆内容',
  `importance` ENUM('low', 'medium', 'high') DEFAULT 'medium' COMMENT '重要性级别',
  `embedding` TEXT NULL COMMENT '向量表示（JSON格式）',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  INDEX `idx_user_topic` (`user_id`, `topic`),
  INDEX `idx_user_importance` (`user_id`, `importance`),
  INDEX `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户记忆表';
