import { forwardRef, Module } from '@nestjs/common';
import { VocabularyService } from './vocabulary.service';
import { VocabularyController } from './vocabulary.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Vocabulary } from './entities/vocabulary.entity';
import { JwtModule } from '@nestjs/jwt';
import { UserService } from '../users/User.Service';
import { UsersModule } from 'src/users/users.module';
import { ListsModule } from 'src/lists/lists.module';
import { VideosModule } from 'src/videos/videos.module';
import { DictionaryModule } from 'src/dictionary/dictionary.module';

@Module({
  imports: [
    ListsModule,
    VideosModule,
    UsersModule,
    DictionaryModule,
    JwtModule,
    TypeOrmModule.forFeature([
      Vocabulary,
      
    ])
  ],
  controllers: [VocabularyController],
  providers: [VocabularyService],
  exports:[VocabularyService]
})
export class VocabularyModule { }
