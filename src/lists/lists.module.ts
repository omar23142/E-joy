import { forwardRef, Module } from '@nestjs/common';
import { ListsService } from './lists.service';
import { ListsController } from './lists.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Lists } from './entities/list.entity';
import { JwtModule } from '@nestjs/jwt';
import { UsersModule } from 'src/users/users.module';
import { VocabularyModule } from 'src/vocabulary/vocabulary.module';
import { Vocabulary } from 'src/vocabulary/entities/vocabulary.entity';

@Module({
  imports: [
    JwtModule,
    UsersModule,
    forwardRef(()=>VocabularyModule),
    TypeOrmModule.forFeature([
      Lists,
      Vocabulary
    ])],
  controllers: [ListsController],
  providers: [ListsService],
  exports: [ListsService]
})
export class ListsModule { }
