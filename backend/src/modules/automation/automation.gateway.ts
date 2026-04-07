import {
  WebSocketGateway, WebSocketServer, SubscribeMessage,
  MessageBody, ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
  cors: { origin: process.env.FRONTEND_URL || 'http://localhost:3000', credentials: true },
  namespace: '/automation',
})
export class AutomationGateway {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(AutomationGateway.name);

  @SubscribeMessage('subscribe')
  handleSubscribe(
    @MessageBody() data: { searchRequestId: string },
    @ConnectedSocket() client: Socket,
  ) {
    client.join(`search:${data.searchRequestId}`);
    this.logger.log(`Client ${client.id} subscribed to search ${data.searchRequestId}`);
    return { event: 'subscribed', data: { searchRequestId: data.searchRequestId } };
  }

  emitStatusUpdate(searchRequestId: string, status: string, message: string) {
    this.server.to(`search:${searchRequestId}`).emit('status_update', {
      searchRequestId,
      status,
      message,
      timestamp: new Date().toISOString(),
    });
  }

  emitCaptchaRequired(
    searchRequestId: string,
    screenshotBase64: string,
    sessionToken: string,
  ) {
    this.server.to(`search:${searchRequestId}`).emit('captcha_required', {
      searchRequestId,
      screenshot: screenshotBase64,
      sessionToken,
      message: 'CAPTCHA detected. Please solve to continue.',
      timestamp: new Date().toISOString(),
    });
  }

  emitProgress(searchRequestId: string, step: string, percentage: number) {
    this.server.to(`search:${searchRequestId}`).emit('progress', {
      searchRequestId,
      step,
      percentage,
      timestamp: new Date().toISOString(),
    });
  }

  emitCompleted(searchRequestId: string, reportId: string) {
    this.server.to(`search:${searchRequestId}`).emit('completed', {
      searchRequestId,
      reportId,
      message: 'Land verification complete',
      timestamp: new Date().toISOString(),
    });
  }

  emitFailed(searchRequestId: string, reason: string, fallback: string) {
    this.server.to(`search:${searchRequestId}`).emit('failed', {
      searchRequestId,
      reason,
      fallback,
      timestamp: new Date().toISOString(),
    });
  }
}
