import { expose } from 'comlink';
import { fileManager } from '#machines/file-manager.js';
import type { FileManager } from '#machines/file-manager.js';

expose(fileManager); // Expose the FileWorker API to the main thread

export type FileWorker = FileManager;
