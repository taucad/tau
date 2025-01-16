import { Test } from '@nestjs/testing';

import { ChatService } from './chat.service';

describe('AppService', () => {
  let service: ChatService;

  beforeAll(async () => {
    const app = await Test.createTestingModule({
      providers: [ChatService],
    }).compile();

    service = app.get<ChatService>(ChatService);
  });

  describe('getData', () => {
    it('should return "Hello API"', () => {
      expect(service.getData()).toEqual({ message: 'Hello API' });
    });
  });
});
