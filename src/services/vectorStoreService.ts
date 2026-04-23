import { MilvusClient, DataType } from '@zilliz/milvus2-sdk-node';
import { OllamaEmbeddings } from '@langchain/ollama';
import { Document } from '@langchain/core/documents';
import { AppDataSource } from '../config/database';
import { Chunk } from '../entities/Chunk';
import { VChunk, VChunkSearchResult } from '../models/VChunk';

const COLLECTION_NAME = 'docmind_vectors';
const VECTOR_DIM = 1024; // bge-m3 embedding dimension

let milvusClient: MilvusClient | null = null;

/**
 * 获取 Milvus 客户端实例
 */
export async function getMilvusClient(): Promise<MilvusClient> {
  if (!milvusClient) {
    milvusClient = new MilvusClient({
      address: process.env.MILVUS_ADDRESS || 'localhost:19530',
    });

    // 检查集合是否存在，不存在则创建
    const hasCollection = await milvusClient.hasCollection({
      collection_name: COLLECTION_NAME,
    });

    // if (hasCollection.value) {
    //   // 如果存在则删除
    //   await milvusClient.dropCollection({
    //     collection_name: COLLECTION_NAME,
    //   });
    //   console.log(`Dropped existing collection '${COLLECTION_NAME}'`);
    // }
    if(!hasCollection.value){
      // 创建新集合
      await createCollection();
    }
  }

  return milvusClient;
}

/**
 * 创建 Milvus 集合
 */
async function createCollection(): Promise<void> {
  const client = await getMilvusClient();

  await client.createCollection({
    collection_name: COLLECTION_NAME,
    fields: [
      {
        name: 'id',
        data_type: DataType.Int64,
        is_primary_key: true,
        autoID: true,
      },
      {
        name: 'embedding',
        data_type: DataType.FloatVector,
        dim: VECTOR_DIM,
      },
      {
        name: 'knowledge_base_id',
        data_type: DataType.Int64,
      },
      {
        name: 'category',
        data_type: DataType.VarChar,
        max_length: 50,
      },
      {
        name: 'content_type',
        data_type: DataType.VarChar,
        max_length: 50,
      },
      {
        name: 'content',
        data_type: DataType.VarChar,
        max_length: 65535,
      },
      {
        name: 'chapter',
        data_type: DataType.VarChar,
        max_length: 200,
      },
      {
        name: 'page_number',
        data_type: DataType.VarChar,
        max_length: 50,
      },
    ],
  });

  // 创建索引
  await client.createIndex({
    collection_name: COLLECTION_NAME,
    field_name: 'embedding',
    index_type: 'IVF_FLAT',
    metric_type: 'L2',
    params: { nlist: 128 },
  });

  // 加载集合到内存
  await client.loadCollection({
    collection_name: COLLECTION_NAME,
  });

  console.log(`Milvus collection '${COLLECTION_NAME}' created successfully`);
}

/**
 * 将docs 存储 Milvus中
 *
 * 使用Ollama 中的 bge-m3 进行 Embedding
 * @param docs langchain.js 的document集合
 * @param kbId 知识库ID
 * @param savedChunks 已保存的切片记录
 * @param category 知识库分类
 */
export async function addDocuments(
  docs: Document[],
  kbId: number,
  savedChunks: Chunk[],
  category: string = ''
): Promise<void> {
  try {
    const client = await getMilvusClient();

    // 初始化 Ollama Embeddings
    const embeddings = new OllamaEmbeddings({
      model: 'bge-m3',
      baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
    });

    // 提取文本内容
    const texts = docs.map(doc => doc.pageContent);

    // 生成向量
    const vectors = await embeddings.embedDocuments(texts);

    // 准备插入数据 - 使用 VChunk 模型
    const insertData: VChunk[] = vectors.map((vector, index) => {
      const doc = docs[index];
      const chunk = savedChunks[index];
      const metadata = chunk.metadata || {};

      return {
        embedding: vector,
        knowledge_base_id: kbId,
        category: category || '',
        content_type: metadata.contentType || 'text',
        content: doc.pageContent,
        chapter: metadata.chapter || '',
        page_number: metadata.pageNumber?.toString() || metadata.page?.toString() || '',
      };
    });

    // 插入向量到 Milvus
    await client.insert({
      collection_name: COLLECTION_NAME,
      data: insertData,
    });

    // 更新数据库中的 vector_id
    const chunkRepository = AppDataSource.getRepository(Chunk);
    for (let i = 0; i < savedChunks.length; i++) {
      await chunkRepository.update(
        { id: savedChunks[i].id },
        { vector_id: `${kbId}_${savedChunks[i].id}` }
      );
    }

    console.log(`Successfully added ${vectors.length} vectors to Milvus for KB ${kbId}`);

  } catch (error) {
    console.error('Failed to add documents to Milvus:', error);
    throw error;
  }
}



/**
 * 向量检索
 * @param query 查询文本
 * @param kbIds 知识库ID列表
 * @param topK 返回结果数量
 */
export async function searchVectors(
  query: string,
  kbIds: number[],
  topK: number = 10
): Promise<VChunkSearchResult[]> {
  try {
    const client = await getMilvusClient();

    // 初始化 Ollama Embeddings
    const embeddings = new OllamaEmbeddings({
      model: 'bge-m3',
      baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
    });

    // 生成查询向量
    const queryVector = await embeddings.embedQuery(query);

    // 构建过滤表达式
    const expr = kbIds.length > 0 ? `knowledge_base_id in [${kbIds.join(',')}]` : '';

    // 执行向量检索
    const searchResult = await client.search({
      collection_name: COLLECTION_NAME,
      vector: queryVector,
      filter: expr,
      limit: topK,
      output_fields: ['knowledge_base_id', 'category', 'content_type', 'content', 'chapter', 'page_number'],
    });

    return searchResult.results as VChunkSearchResult[];

  } catch (error) {
    console.error('Vector search failed:', error);
    throw error;
  }
}

/**
 * 删除知识库的所有向量
 * @param kbId 知识库ID
 */
export async function deleteVectorsByKbId(kbId: number): Promise<void> {
  try {
    const client = await getMilvusClient();

    await client.delete({
      collection_name: COLLECTION_NAME,
      filter: `knowledge_base_id == ${kbId}`,
    });

    console.log(`Deleted all vectors for KB ${kbId}`);

  } catch (error) {
    console.error('Failed to delete vectors:', error);
    throw error;
  }
}
