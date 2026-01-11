import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, map } from 'rxjs';

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  private readonly reflector: Reflector;

  constructor(reflector?: Reflector) {
    this.reflector = reflector ?? new Reflector();
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((data) => {
        const metaMessage = this.reflector.getAllAndOverride<string>(
          'response_message',
          [context.getHandler(), context.getClass()],
        );

        const payloadMessage =
          data &&
          typeof data === 'object' &&
          'message' in (data as any) &&
          typeof (data as any).message === 'string'
            ? ((data as any).message as string)
            : '';

        const method = context.switchToHttp().getRequest()?.method as
          | string
          | undefined;
        const defaultMessage =
          method === 'POST'
            ? 'Created successfully.'
            : method === 'PATCH' || method === 'PUT'
              ? 'Updated successfully.'
              : method === 'DELETE'
                ? 'Deleted successfully.'
                : 'OK.';

        const message = metaMessage || payloadMessage || defaultMessage;

        return {
          success: true,
          data,
          message,
        };
      }),
    );
  }
}
