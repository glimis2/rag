import { AppDataSource } from '../config/database';
import { Chunk } from '../entities/Chunk';

export class KbChunkService {
  private chunkRepository = AppDataSource.getRepository(Chunk);

  /**
   * 根据 entities/Chunk 进行保存
   *
   * @param chunk
   */
  async save(chunk: Partial<Chunk>): Promise<Chunk> {
    try {
      const newChunk = this.chunkRepository.create(chunk);
      const savedChunk = await this.chunkRepository.save(newChunk);
      return savedChunk;
    } catch (error) {
      console.error('Failed to save chunk:', error);
      throw error;
    }
  }

  /**
   * 根据知识库ID获取所有切片
   */
  async findByKbId(kbId: number): Promise<Chunk[]> {
    return await this.chunkRepository.find({
      where: { kb_id: kbId },
      order: { chunk_index: 'ASC' }
    });
  }

  /**
   * 根据知识库ID删除所有切片
   */
  async deleteByKbId(kbId: number): Promise<void> {
    await this.chunkRepository.delete({ kb_id: kbId });
  }

  /**
   * 根据ID获取单个切片
   */
  async findById(id: number): Promise<Chunk | null> {
    return await this.chunkRepository.findOne({ where: { id } });
  }

  /**
   * 批量保存切片
   */
  async saveBatch(chunks: Partial<Chunk>[]): Promise<Chunk[]> {
    try {
      const newChunks = chunks.map(chunk => this.chunkRepository.create(chunk));
      return await this.chunkRepository.save(newChunks);
    } catch (error) {
      console.error('Failed to save chunks in batch:', error);
      throw error;
    }
  }
}
