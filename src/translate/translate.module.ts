import { Module } from '@nestjs/common';
import { TranslateService } from './translate.service';

import { DictionaryModule } from 'src/dictionary/dictionary.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Vocabulary } from 'src/vocabulary/entities/vocabulary.entity';
import { TranslateController } from './translate.controller';
import { JwtModule } from '@nestjs/jwt';
import { UsersModule } from 'src/users/users.module';

@Module({
  imports: [
    DictionaryModule,
    JwtModule,
    UsersModule,
    TypeOrmModule.forFeature([Vocabulary])
  ],
  controllers: [TranslateController],
  providers: [TranslateService],
  exports: [TranslateService]
})
export class TranslateModule {}
