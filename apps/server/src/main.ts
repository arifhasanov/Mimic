import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { existsSync } from 'fs';
import { networkInterfaces } from 'os';
import { AppModule } from './app.module';

const PORT = Number(process.env.PORT ?? 3000);
const webBuild = join(__dirname, '..', '..', 'web', 'build');

function lanAddress(): string | null {
  for (const list of Object.values(networkInterfaces())) {
    for (const net of list ?? []) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return null;
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { cors: true });

  // init() first: it installs ServeStaticModule's middleware, which must get first refusal
  // on every request so real files (the JS bundles, the ship art) are served as themselves.
  // Only then does the SPA fallback go on the end of the chain.
  await app.init();

  if (existsSync(webBuild)) {
    const express = app.getHttpAdapter().getInstance();
    express.use((req: any, res: any, next: any) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return next();
      if (req.path.startsWith('/socket.io')) return next();
      if (res.headersSent) return next();
      // Anything that is not a real file is a client route: /play, /host/ABCD, and so on.
      res.sendFile(join(webBuild, 'index.html'));
    });
  }

  await app.listen(PORT, '0.0.0.0');
  const log = new Logger('MIMIC');
  log.log(`TV and phones: http://localhost:${PORT}/`);
  const lan = lanAddress();
  if (lan) log.log(`On this network:  http://${lan}:${PORT}/`);
}
bootstrap();
