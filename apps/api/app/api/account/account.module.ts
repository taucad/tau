import { Module } from '@nestjs/common';
import { DatabaseModule } from '@taucad/api-database';
import { AccountController } from '#api/account/account.controller.js';
import { AccountService } from '#api/account/account.service.js';

@Module({
  imports: [DatabaseModule],
  controllers: [AccountController],
  providers: [AccountService],
})
export class AccountModule {}
