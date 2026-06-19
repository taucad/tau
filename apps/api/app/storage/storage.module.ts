import { Global, Module } from '@nestjs/common';
import { ObjectStorageService } from '#storage/object-storage.service.js';

@Global()
@Module({
  providers: [ObjectStorageService],
  exports: [ObjectStorageService],
})
export class StorageModule {}
