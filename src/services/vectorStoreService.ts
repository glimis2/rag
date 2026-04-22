import { MilvusClient, DataType } from '@milvus-io/milvus2-sdk-node';
import { OllamaEmbeddings } from '@langchain/ollama';
import { Document } from '@langchain/core/documents';
import { AppDataSource } from '../config/database';
import { Chunk } from '../entities/Chunk';

const COLLECTION_NAME = 'docmind_vectors';
const VECTOR_DIM = 1024; // bge-m3 embedding dimension

let milvusClient: MilvusClient | null = null;

/**
 * 获取 Milvus 客户端实例
 */
async function getMilvusClient(): Promise<MilvusClient> {
  if (!milvusClient) {
    milvusClient = new MilvusClient({
      address: process.env.MILVUS_ADDRESS || 'localhost:19530',
    });

    // 检查集合是否存在，不存在则创建
    const hasCollection = await milvusClient.hasCollection({
      collection_name: COLLECTION_NAME,
    });

    if (!hasCollection.value) {
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
        name: 'kb_id',
        data_type: DataType.Int64,
      },
      {
        name: 'chunk_id',
        data_type: DataType.Int64,
      },
      {
        name: 'vector',
        data_type: DataType.FloatVector,
        dim: VECTOR_DIM,
      },
    ],
  });

  // 创建索引
  await client.createIndex({
    collection_name: COLLECTION_NAME,
    field_name: 'vector',
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
 */
export async function addDocuments(
  docs: Document[],
  kbId: number,
  savedChunks: Chunk[]
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

    // 准备插入数据
    const insertData = vectors.map((vector, index) => ({
      kb_id: kbId,
      chunk_id: savedChunks[index].id,
      vector,
    }));

    // 插入向量到 Milvus
    const insertResult = await client.insert({
      collection_name: COLLECTION_NAME,
      data: insertData,
    });

    // 更新数据库中的 vector_id
    const chunkRepository = AppDataSource.getRepository(Chunk);
    for (let i = 0; i < savedChunks.length; i++) {
      await chunkRepository.update(
        { id: savedChunks[i].id },
        { vector_id: insertResult.insert_cnt.toString() + '_' + i }
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
): Promise<any[]> {
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
    const expr = kbIds.length > 0 ? `kb_id in [${kbIds.join(',')}]` : '';

    // 执行向量检索
    const searchResult = await client.search({
      collection_name: COLLECTION_NAME,
      vector: queryVector,
      filter: expr,
      limit: topK,
      output_fields: ['kb_id', 'chunk_id'],
    });

    return searchResult.results;

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
      filter: `kb_id == ${kbId}`,
    });

    console.log(`Deleted all vectors for KB ${kbId}`);

  } catch (error) {
    console.error('Failed to delete vectors:', error);
    throw error;
  }
}
