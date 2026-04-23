import { BaseRetriever, BaseRetrieverInput } from "@langchain/core/retrievers";  
import { Document } from "@langchain/core/documents";  
import { VectorStoreInterface } from "@langchain/core/vectorstores";  
import { Embeddings } from "@langchain/core/embeddings";  
import {getMilvusClient} from '../services/vectorStoreService'
import { OllamaEmbeddings } from '@langchain/ollama';
import { Milvus } from "@langchain/community/vectorstores/milvus";

interface VectorRetrieverInput extends BaseRetrieverInput {  
  vectorStore: VectorStoreInterface;  
  embeddings: Embeddings;  
  k?: number;  
  sse:any;
  filter:any;
}  

/**
 * 自定义检索结构
 * 
 * 
 */
export class CustomVectorRetriever extends BaseRetriever {  
  lc_namespace = ["custom", "vector", "retriever"];  
    
  private vectorStore: VectorStoreInterface;  
  private embeddings: Embeddings;  
  private k: number;  
  private filter?: any; 
  private sse: any;  
  
  constructor(fields: VectorRetrieverInput) {  
    super(fields);  
    this.vectorStore = fields.vectorStore;  
    this.embeddings = fields.embeddings;  
    this.k = fields.k ?? 4;  
    this.sse = fields.sse
  }  
  
  /**
   * 调用
   * @param query 
   * @returns 
   */
  async _getRelevantDocuments(query: string): Promise<Document[]> {  
    // 首先进行向量搜索  
    const vectorResults = await this.vectorStore.similaritySearch(  
      query,   
      this.k * 2, // 获取更多结果用于重排序  
      this.filter  
    );  
  
    // 自定义重排序逻辑  
    const rerankedResults = await this.rerankDocuments(query, vectorResults);  
      
    return rerankedResults.slice(0, this.k);  
  }  
  
  private async rerankDocuments(query: string, documents: Document[]): Promise<Document[]> {  
    // 实现自定义重排序逻辑  
    // 例如：基于关键词密度、文档长度等  
    return documents.sort((a, b) => {  
      const scoreA = this.calculateRelevanceScore(query, a);  
      const scoreB = this.calculateRelevanceScore(query, b);  
      return scoreB - scoreA;  
    });  
  }  
  
  private calculateRelevanceScore(query: string, doc: Document): number {  
    const queryWords = query.toLowerCase().split(' ');  
    const content = doc.pageContent.toLowerCase();  
      
    let score = 0;  
    queryWords.forEach(word => {  
      const occurrences = (content.match(new RegExp(word, 'g')) || []).length;  
      score += occurrences;  
    });  
      
    return score;  
  }  
}


export async function createRetriever(sse, kbIds?: string[]){

    const embeddings = new OllamaEmbeddings({
        model: 'bge-m3',
        baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
    });
    const vectorStore = await Milvus.fromExistingCollection(
        embeddings,
        {
            url: process.env.MILVUS_ADDRESS || 'localhost:19530',
            collectionName: "docmind_vectors",
            textField: 'content',  // 指定文本字段映射到 pageContent
            primaryField: 'id',
            vectorField: 'embedding',
        }
    );

    // 构建过滤条件
    let filter = {};
    if (kbIds && kbIds.length > 0) {
        const ids = kbIds.map(id => parseInt(id));
        filter = { knowledge_base_id: { $in: ids } };
    }

    return new CustomVectorRetriever({
        vectorStore,
        embeddings,
        k: 10,
        filter,
        sse
    })
}