/**
 * Web 检索器
 *
 * 通过搜索引擎 API 获取实时网络信息
 * 支持 Tavily API 和 SerpAPI
 */

import { Retriever, RetrievedChunk, RetrievalOptions } from './types';
import axios from 'axios';

/**
 * Web 搜索结果
 */
interface WebSearchResult {
  title: string;
  url: string;
  content: string;
  score?: number;
}

/**
 * Tavily API 响应
 */
interface TavilyResponse {
  results: Array<{
    title: string;
    url: string;
    content: string;
    score: number;
  }>;
}

export class WebRetriever implements Retriever {
  readonly name = 'web';

  private readonly apiKey: string;
  private readonly apiType: 'tavily' | 'serp';
  private readonly baseURL: string;

  constructor() {
    // 从环境变量读取配置
    this.apiKey = process.env.WEB_SEARCH_API_KEY || '';
    this.apiType = (process.env.WEB_SEARCH_API_TYPE as 'tavily' | 'serp') || 'tavily';

    this.baseURL =
      this.apiType === 'tavily'
        ? 'https://api.tavily.com/search'
        : 'https://serpapi.com/search';
  }

  /**
   * 执行 Web 检索
   * @param query 查询文本
   * @param options 检索选项
   * @returns 检索结果列表
   */
  async retrieve(query: string, options: RetrievalOptions): Promise<RetrievedChunk[]> {
    const { topK, minScore = 0 } = options;

    // 如果未配置 API Key，返回空结果
    if (!this.apiKey) {
      console.warn('[WebRetriever] API key not configured, skipping web search');
      return [];
    }

    try {
      const results =
        this.apiType === 'tavily'
          ? await this.searchWithTavily(query, topK)
          : await this.searchWithSerp(query, topK);

      return results
        .filter(item => (item.score || 0) >= minScore)
        .map((item, index) => this.convertToChunk(item, index));

    } catch (error) {
      console.error('[WebRetriever] Web search failed:', error);
      // 降级：返回空结果
      return [];
    }
  }

  /**
   * 使用 Tavily API 搜索
   */
  private async searchWithTavily(query: string, maxResults: number): Promise<WebSearchResult[]> {
    const response = await axios.post<TavilyResponse>(
      this.baseURL,
      {
        api_key: this.apiKey,
        query,
        max_results: maxResults,
        search_depth: 'basic',
        include_answer: false,
        include_raw_content: false,
      },
      {
        timeout: 10000, // 10秒超时
      }
    );

    return response.data.results.map(item => ({
      title: item.title,
      url: item.url,
      content: item.content,
      score: item.score,
    }));
  }

  /**
   * 使用 SerpAPI 搜索
   */
  private async searchWithSerp(query: string, maxResults: number): Promise<WebSearchResult[]> {
    const response = await axios.get(this.baseURL, {
      params: {
        api_key: this.apiKey,
        q: query,
        num: maxResults,
        engine: 'google',
      },
      timeout: 10000,
    });

    const organicResults = response.data.organic_results || [];

    return organicResults.map((item: any, index: number) => ({
      title: item.title || '',
      url: item.link || '',
      content: item.snippet || '',
      score: 1 - index * 0.1, // 简单的位置衰减分数
    }));
  }

  /**
   * 转换为统一格式
   */
  private convertToChunk(result: WebSearchResult, index: number): RetrievedChunk {
    return {
      id: `web_${index}`,
      content: result.content,
      source: 'web',
      score: result.score || 1 - index * 0.1,
      metadata: {
        title: result.title,
        url: result.url,
        searchRank: index + 1,
      },
    };
  }
}
