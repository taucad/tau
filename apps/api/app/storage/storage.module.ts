import { Global, Module } from '@nestjs/common';
import { FileLinksService } from '#storage/file-links.service.js';
import { ObjectStorageService } from '#storage/object-storage.service.js';

@Global()
@Module({
  providers: [ObjectStorageService, FileLinksService],
  exports: [ObjectStorageService, FileLinksService],
})
export class StorageModule {}
