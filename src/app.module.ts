import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigifyModule } from '@itgorillaz/configify';
import { join } from 'path';
import { DatabaseConfig } from './config/DatabaseConfig';
import { User } from './users/entity/User.entity';
import { TypeOrmModule, TypeOrmModuleAsyncOptions } from '@nestjs/typeorm';
import { Vocabulary } from './vocabulary/entities/vocabulary.entity';
import { Lists } from './lists/entities/list.entity';
import { Video } from './videos/entities/video.entity';
import { VocabularyModule } from './vocabulary/vocabulary.module';
import { ListsModule } from './lists/lists.module';
import { VideosModule } from './videos/videos.module';
import { UsersModule } from './users/users.module';
import { JwtModule, JwtModuleAsyncOptions } from '@nestjs/jwt';
import { Authconfig } from './config/AuthClass';

//console.log('from app.module', process.env.NODE_ENV)
@Module({
  imports: [VocabularyModule, ListsModule, VideosModule, UsersModule,
    ConfigifyModule.forRootAsync({
      configFilePath: process.env.NODE_ENV !== 'production' ? join(__dirname, '../.env.development/.env') : '.env',
    }),
    JwtModule.registerAsync({
      inject: [Authconfig],
      useFactory: (config: Authconfig): JwtModuleAsyncOptions => {
        console.log('this is test', config.jwt_secret_key)
        return {
          global: true,
          secret: config.jwt_secret_key,
          signOptions: { expiresIn: config.jwt_secret_key }
        } as JwtModuleAsyncOptions
      }
    }),
    // local Data Base 
    TypeOrmModule.forRootAsync(
      {
        inject: [DatabaseConfig],
        useFactory: (config: DatabaseConfig) => {
          const dbUsername = config.DB_username;
          const dbpass = config.DB_password;
          const database = config.DB_database;
          const type = config.DB_type;
          const port = config.DB_port;
          //console.log(typeof port);
          return {
            database: database,
            type: type,
            username: dbUsername,
            password: dbpass,
            host: 'localhost',
            synchronize: process.env.NODE_ENV !== 'production',
            //dropSchema: true,
            entities: [User, Video, Lists, Vocabulary],
            port: config.DB_port
          } as TypeOrmModuleAsyncOptions
        }
      }
    )
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {

}
