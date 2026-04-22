import { AppDataSource } from '../config/database';
import { Chunk } from '../entities/Chunk';

export class ChunkRepository {
  private repository = AppDataSource.getRepository(Chunk);

  /**
   * 保存单个切片
   */
  async save(chunk: Partial<Chunk>): Promise<Chunk> {
    try {
      const newChunk = this.repository.create(chunk);
      return await this.repository.save(newChunk);
    } catch (error) {
      console.error('Failed to save chunk:', error);
      throw error;
    }
  }

  /**
   * 批量保存切片
   */
  async saveBatch(chunks: Partial<Chunk>[]): Promise<Chunk[]> {
    try {
      const newChunks = chunks.map(chunk => this.repository.create(chunk));
      return await this.repository.save(newChunks);
    } catch (error) {
      console.error('Failed to save chunks in batch:', error);
      throw error;
    }
  }

  /**
   * 根据知识库ID获取所有切片
   */
  async findByKbId(kbId: number): Promise<Chunk[]> {
    return await this.repository.find({
      where: { kb_id: kbId },
      order: { chunk_index: 'ASC' }
    });
  }

  /**
   * 根据ID获取单个切片
   */
  async findById(id: number): Promise<Chunk | null> {
    return await this.repository.findOne({ where: { id } });
  }

  /**
   * 根据知识库ID删除所有切片
   */
  async deleteByKbId(kbId: number): Promise<void> {
    await this.repository.delete({ kb_id: kbId });
  }

  /**
   * 根据知识库ID统计切片数量
   */
  async countByKbId(kbId: number): Promise<number> {
    return await this.repository.count({ where: { kb_id: kbId } });
  }

  /**
   * 分页查询切片
   */
  async findByKbIdWithPagination(
    kbId: number,
    page: number = 1,
    size: number = 20
  ): Promise<{ records: Chunk[]; total: number }> {
    const skip = (page - 1) * size;
    const [records, total] = await this.repository.findAndCount({
      where: { kb_id: kbId },
      order: { chunk_index: 'ASC' },
      skip,
      take: size
    });
    return { records, total };
  }

  /**
   * 关键词搜索切片（使用全文索引）
   */
  async searchByKeyword(kbId: number, keyword: string): Promise<Chunk[]> {
    return await this.repository
      .createQueryBuilder('chunk')
      .where('chunk.kb_id = :kbId', { kbId })
      .andWhere('MATCH(chunk.content) AGAINST(:keyword IN NATURAL LANGUAGE MODE)', { keyword })
      .orderBy('MATCH(chunk.content) AGAINST(:keyword IN NATURAL LANGUAGE MODE)', 'DESC')
      .getMany();
  }
}
