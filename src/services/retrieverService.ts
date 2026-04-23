
import { MemoryVectorStore } from "@langchain/classic/vectorstores/memory";
import { MultiVectorRetriever } from "@langchain/classic/retrievers/multi_vector";
import { InMemoryStore } from "@langchain/core/stores";
import { Document } from "@langchain/core/documents";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { OllamaEmbeddings } from '@langchain/ollama';





const embeddings = new OllamaEmbeddings({
  model: process.env.OLLAMA_EMBEDDING_MODEL || 'bge-m3',
  baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
});






export const retriever = new MultiVectorRetriever({
    vectorstore:new MemoryVectorStore(embeddings),
    byteStore: new InMemoryStore<Uint8Array>(),
    idKey:"doc_id",
    childK: 20,
    parentK: 5,
});


/**
 * 
 * @param docs langchain.js 的document集合，没有切分
 */

export async function addDocuments(docs){
    const splitter = RecursiveCharacterTextSplitter.fromLanguage("markdown",{
        chunkSize: 1000,
        chunkOverlap: 200,
    }); // 18个

    let  count = 0
    for(const doc of docs){
        doc.metadata.doc_id = Math.random().toString(36).substring(2);
        const splits = await splitter.splitDocuments([doc]);
        splits.forEach((split)=>{
            split.metadata.doc_id = doc.metadata.doc_id;
        })
        await retriever.vectorstore.addDocuments(splits); // 直接写入向量
        await retriever.docstore.mset([
            [doc.metadata.doc_id, doc]
        ]);
        count += splits.length
    }

    return count
}