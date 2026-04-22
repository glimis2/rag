/**
 * 向量数据块模型
 */
export interface VChunk {
  id?: string;
  embedding: number[];
  knowledge_base_id: number;
  category: string;
  content_type: string;
  content: string;
  chapter: string;
  page_number: string;
}

/**
 * 向量检索结果
 */
export interface VChunkSearchResult {
  id: string;
  score: number;
  knowledge_base_id: number;
  category: string;
  content_type: string;
  content: string;
  chapter: string;
  page_number: string;
}
