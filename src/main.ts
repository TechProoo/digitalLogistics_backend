import 'dotenv/config';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import * as cookieParser from 'cookie-parser';
import { join } from 'path';
import { ResponseInterceptor } from './auth/interceptors/response.interceptors';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Serve uploaded files (driver documents, etc.)
  app.useStaticAssets(join(process.cwd(), 'uploads'), {
    prefix: '/uploads',
  });

  // If behind a proxy/LB (Render, Nginx, Cloudflare), this is required so req.ip is correct.
  // It also ensures throttling behaves as expected.
  app.set('trust proxy', 1);

  // Request size limits to prevent huge payload crashes.
  const bodyLimit = (process.env.REQUEST_BODY_LIMIT || '1mb').trim();
  app.useBodyParser('json', { limit: bodyLimit });
  app.useBodyParser('urlencoded', { extended: true, limit: bodyLimit });

  const defaultAllowedOrigins = [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:3000',
    'https://digitaldelivery.org',
    'https://www.digitaldelivery.org',
    'https://digital-delivery.netlify.app',
    'https://digital-logistics-admin.netlify.app',
  ];

  const envAllowedOriginsRaw = [
    process.env.CORS_ORIGINS,
    process.env.FRONTEND_URL,
  ]
    .filter(Boolean)
    .join(',');

  const envAllowedOrigins = envAllowedOriginsRaw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  const allowedOrigins = Array.from(
    new Set([...defaultAllowedOrigins, ...envAllowedOrigins]),
  );

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error(`CORS blocked for origin: ${origin}`), false);
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  app.use(cookieParser());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalInterceptors(new ResponseInterceptor());
  const PORT = process.env.PORT || 3000;

  await app.listen(process.env.PORT ? Number(process.env.PORT) : 3000);

  // Compute a public-facing ws/wss URL for logs when possible.
  const backendPublicRaw =
    process.env.BACKEND_PUBLIC_URL || process.env.BACKEND_PUBLIC_HOST;
  let wsUrl: string;
  if (backendPublicRaw) {
    // If the provided value contains a scheme, prefer it; otherwise assume https in production.
    if (/^https?:\/\//i.test(backendPublicRaw)) {
      wsUrl = backendPublicRaw.replace(
        /^https?:/i,
        backendPublicRaw.startsWith('https') ? 'wss' : 'ws',
      );
      // ensure path ends with /chat
      if (!wsUrl.endsWith('/chat')) wsUrl = wsUrl.replace(/\/+$/, '') + '/chat';
    } else {
      // no scheme provided
      const scheme = process.env.NODE_ENV === 'production' ? 'wss' : 'ws';
      wsUrl = `${scheme}://${backendPublicRaw.replace(/\/+$/, '')}/chat`;
    }
  } else {
    wsUrl = `ws://localhost:${PORT}/chat`;
  }
}
bootstrap();
