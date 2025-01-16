import { Injectable } from '@nestjs/common';

@Injectable()
export class ChatService {
  getData(): { message: string } {
    return { message: 'Hello API' };
  }
}
