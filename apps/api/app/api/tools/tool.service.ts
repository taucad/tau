import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { StructuredTool } from '@langchain/core/tools';
import type { ToolName, ToolMode, ToolSelection } from '@taucad/chat';
import { toolName, toolMode } from '@taucad/chat/constants';
import type { Environment } from '#config/environment.config.js';
import { createWebBrowserTool } from '#api/tools/tools/tool-web-browser.js';
import { editFileTool } from '#api/tools/tools/tool-edit-file.js';
import { testModelTool } from '#api/tools/tools/tool-test-model.js';
import { editTestsTool } from '#api/tools/tools/tool-edit-tests.js';
import { createWebSearchTool } from '#api/tools/tools/tool-web-search.js';
import { readFileTool } from '#api/tools/tools/tool-read-file.js';
import { listDirectoryTool } from '#api/tools/tools/tool-list-directory.js';
import { createFileTool } from '#api/tools/tools/tool-create-file.js';
import { deleteFileTool } from '#api/tools/tools/tool-delete-file.js';
import { grepTool } from '#api/tools/tools/tool-grep.js';
import { globSearchTool } from '#api/tools/tools/tool-glob-search.js';
import { getKernelResultTool } from '#api/tools/tools/tool-get-kernel-result.js';
import { screenshotTool } from '#api/tools/tools/tool-screenshot.js';

export const toolChoiceFromToolName = {
  // eslint-disable-next-line @typescript-eslint/naming-convention -- Tavily search tool name
  tavily_search: toolName.webSearch,
} as const satisfies Record<string, ToolName>;

@Injectable()
export class ToolService {
  private webSearchTool: StructuredTool | undefined;
  private webBrowserTool: StructuredTool | undefined;

  public constructor(private readonly configService: ConfigService<Environment, true>) {}

  public getTools(selectedToolChoice: ToolSelection): {
    tools: Partial<Record<ToolName, StructuredTool>>;
    resolvedToolChoice: string;
  } {
    // Define the tools for the agent to use
    const toolCategoryToTool = {
      [toolName.webSearch]: this.getWebSearchTool(),
      [toolName.webBrowser]: this.getWebBrowserTool(),
      [toolName.editFile]: editFileTool,
      [toolName.testModel]: testModelTool,
      [toolName.editTests]: editTestsTool,
      [toolName.readFile]: readFileTool,
      [toolName.listDirectory]: listDirectoryTool,
      [toolName.createFile]: createFileTool,
      [toolName.deleteFile]: deleteFileTool,
      [toolName.grep]: grepTool,
      [toolName.globSearch]: globSearchTool,
      [toolName.getKernelResult]: getKernelResultTool,
      [toolName.screenshot]: screenshotTool,
    } as const satisfies Partial<Record<ToolName, StructuredTool>>;

    const toolNameFromToolCategory = {
      [toolName.webSearch]: toolCategoryToTool[toolName.webSearch].name,
      [toolName.webBrowser]: toolCategoryToTool[toolName.webBrowser].name,
      [toolName.editFile]: toolCategoryToTool[toolName.editFile].name,
      [toolName.testModel]: toolCategoryToTool[toolName.testModel].name,
      [toolName.editTests]: toolCategoryToTool[toolName.editTests].name,
      [toolName.readFile]: toolCategoryToTool[toolName.readFile].name,
      [toolName.listDirectory]: toolCategoryToTool[toolName.listDirectory].name,
      [toolName.createFile]: toolCategoryToTool[toolName.createFile].name,
      [toolName.deleteFile]: toolCategoryToTool[toolName.deleteFile].name,
      [toolName.grep]: toolCategoryToTool[toolName.grep].name,
      [toolName.globSearch]: toolCategoryToTool[toolName.globSearch].name,
      [toolName.getKernelResult]: toolCategoryToTool[toolName.getKernelResult].name,
      [toolName.screenshot]: toolCategoryToTool[toolName.screenshot].name,
    } as const satisfies Partial<Record<ToolName, string>>;

    const toolNameFromToolChoice = {
      ...toolNameFromToolCategory,
      ...toolMode,
    } as const satisfies Partial<Record<ToolName | ToolMode, string>>;

    // Handle array of specific tools
    if (Array.isArray(selectedToolChoice)) {
      const filteredTools: Partial<Record<ToolName, StructuredTool>> = {};
      for (const toolChoiceItem of selectedToolChoice) {
        if (toolChoiceItem in toolCategoryToTool) {
          filteredTools[toolChoiceItem] = toolCategoryToTool[toolChoiceItem as keyof typeof toolCategoryToTool];
        }
      }

      return { tools: filteredTools, resolvedToolChoice: 'required' };
    }

    const resolvedToolChoice = toolNameFromToolChoice[selectedToolChoice];

    return { tools: toolCategoryToTool, resolvedToolChoice };
  }

  private getTavilyApiKey(): string {
    const tavilyApiKey = this.configService.get('TAVILY_API_KEY', { infer: true });
    if (!tavilyApiKey) {
      throw new Error('Tried to create Tavily tool without TAVILY_API_KEY in the environment variables');
    }

    return tavilyApiKey;
  }

  private getWebSearchTool(): StructuredTool {
    this.webSearchTool ??= createWebSearchTool({ tavilyApiKey: this.getTavilyApiKey() });

    return this.webSearchTool;
  }

  private getWebBrowserTool(): StructuredTool {
    this.webBrowserTool ??= createWebBrowserTool({ tavilyApiKey: this.getTavilyApiKey() });

    return this.webBrowserTool;
  }
}
