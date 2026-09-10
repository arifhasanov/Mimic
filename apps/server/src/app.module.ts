import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { existsSync } from 'fs';
import { GamesService } from './games.service';
import { GameGateway } from './game.gateway';

// dist/main.js -> apps/server/dist -> apps/server -> apps -> <root>
const webBuild = join(__dirname, '..', '..', 'web', 'build');

@Module({
  imports: existsSync(webBuild)
    ? [
        ServeStaticModule.forRoot({
          rootPath: webBuild,
          // SPA fallback: any path that is not a real file gets index.html, so /play and
          // /host/ABCD survive a refresh and a cold open on a phone.
          serveStaticOptions: { fallthrough: true, index: ['index.html'] },
          exclude: ['/socket.io*'],
        }),
      ]
    : [],
  providers: [GamesService, GameGateway],
})
export class AppModule {}
