import { Module } from '@nestjs/common';
import { DictionaryService } from './dictionary.service';

import { TypeOrmModule } from '@nestjs/typeorm';
import { Dictionary } from './entities/dictionary.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Dictionary])],
  controllers: [],
  providers: [DictionaryService],
  exports: [DictionaryService]
})
export class DictionaryModule {}
