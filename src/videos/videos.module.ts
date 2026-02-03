import { Module } from '@nestjs/common';
import { VideosService } from './videos.service';
import { VideosController } from './videos.controller';
import { Video } from './entities/video.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { UsersModule } from 'src/users/users.module';

@Module({
  imports: [
    JwtModule,
    UsersModule,
    TypeOrmModule.forFeature([Video])],
  controllers: [VideosController],
  providers: [VideosService],
  exports: [VideosService]
})
export class VideosModule { }
