import { AppDataSource } from '../config/database';
import { KnowledgeBase } from '../entities/KnowledgeBase';
import { TextLoader } from '@langchain/classic/document_loaders/fs/text';
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { ChunkRepository } from '../repositories/ChunkRepository';
import { addDocuments } from './vectorStoreService';
import { AiConfig } from '../entities/AiConfig';

/**
 * 依次执行以下流程
 *
 * - kb中的status 设置为 processing
 * - 使用TextLoader 获取 docs
 * - 根据类型调用， RecursiveCharacterTextSplitter 进行切块
 * - 调用 KbChunkService.save 保存切块
 * - 调用 vectorStoreService.addDocuments 进行向量处理
 * - 如果成功：kb中的status 设置为  ready
 * - 如果失败：kb中的status 设置为  error
 * @param kb kb对象
 * @param file 文件对象，filepath为地址 如uploads/1.md
 *
 */
export async function processDocument(kb: KnowledgeBase, file: Express.Multer.File) {
  const kbRepository = AppDataSource.getRepository(KnowledgeBase);
  const configRepository = AppDataSource.getRepository(AiConfig);

  try {
    // 1. 更新状态为 processing
    await kbRepository.update({ id: kb.id }, { status: 'processing' });

    // 2. 根据文件类型加载文档
    let loader;
    const filePath = file.path;

    switch (kb.file_type) {
      case 'pdf':
        loader = new PDFLoader(filePath);
        break;
      case 'txt':
      case 'md':
      case 'doc':
      case 'docx':
      default:
        loader = new TextLoader(filePath);
        break;
    }

    const docs = await loader.load();

    // 3. 获取切片配置
    const chunkSizeConfig = await configRepository.findOne({
      where: { config_key: 'rag.chunk_size' }
    });
    const chunkOverlapConfig = await configRepository.findOne({
      where: { config_key: 'rag.chunk_overlap' }
    });

    const chunkSize = chunkSizeConfig ? parseInt(chunkSizeConfig.config_value) : 512;
    const chunkOverlap = chunkOverlapConfig ? parseInt(chunkOverlapConfig.config_value) : 64;

    // 4. 根据文件类型使用 RecursiveCharacterTextSplitter 进行切块
    let textSplitter;

    switch (kb.file_type) {
      case 'md':
        textSplitter = RecursiveCharacterTextSplitter.fromLanguage('markdown', {
          chunkSize,
          chunkOverlap,
        });
        break;
      case 'js':
      case 'jsx':
        textSplitter = RecursiveCharacterTextSplitter.fromLanguage('js', {
          chunkSize,
          chunkOverlap,
        });
        break;
      case 'py':
        textSplitter = RecursiveCharacterTextSplitter.fromLanguage('python', {
          chunkSize,
          chunkOverlap,
        });
        break;
      case 'java':
        textSplitter = RecursiveCharacterTextSplitter.fromLanguage('java', {
          chunkSize,
          chunkOverlap,
        });
        break;
      case 'cpp':
      case 'cc':
      case 'cxx':
        textSplitter = RecursiveCharacterTextSplitter.fromLanguage('cpp', {
          chunkSize,
          chunkOverlap,
        });
        break;
      case 'go':
        textSplitter = RecursiveCharacterTextSplitter.fromLanguage('go', {
          chunkSize,
          chunkOverlap,
        });
        break;
      case 'rs':
        textSplitter = RecursiveCharacterTextSplitter.fromLanguage('rust', {
          chunkSize,
          chunkOverlap,
        });
        break;
      case 'html':
        textSplitter = RecursiveCharacterTextSplitter.fromLanguage('html', {
          chunkSize,
          chunkOverlap,
        });
        break;
      case 'php':
        textSplitter = RecursiveCharacterTextSplitter.fromLanguage('php', {
          chunkSize,
          chunkOverlap,
        });
        break;
      case 'rb':
        textSplitter = RecursiveCharacterTextSplitter.fromLanguage('ruby', {
          chunkSize,
          chunkOverlap,
        });
        break;
      default:
        // 对于 pdf, txt, doc, docx 等通用文本，使用默认分割器
        textSplitter = new RecursiveCharacterTextSplitter({
          chunkSize,
          chunkOverlap,
        });
        break;
    }

    const splitDocs = await textSplitter.splitDocuments(docs);

    // 5. 保存切块到数据库
    const chunkRepository = new ChunkRepository();
    const savedChunks = [];

    for (let i = 0; i < splitDocs.length; i++) {
      const doc = splitDocs[i];
      const chunk = {
        kb_id: kb.id,
        content: doc.pageContent,
        chunk_index: i,
        metadata: doc.metadata,
      };

      const savedChunk = await chunkRepository.save(chunk);
      savedChunks.push(savedChunk);
    }

    // 6. 调用向量存储服务
    await addDocuments(splitDocs, kb.id, savedChunks, kb.category || '');


    // 7. 更新知识库状态为 ready
    await kbRepository.update(
      { id: kb.id },
      {
        status: 'ready',
        chunk_count: splitDocs.length
      }
    );

    console.log(`Document processed successfully: KB ID ${kb.id}chunks created`);

  } catch (error) {
    console.error('Document processing failed:', error);

    // 更新状态为 error
    await kbRepository.update(
      { id: kb.id },
      {
        status: 'error',
        error_msg: error instanceof Error ? error.message : 'Unknown error'
      }
    );
  }
}
