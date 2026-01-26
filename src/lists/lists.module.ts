import { Module } from '@nestjs/common';
import { ListsService } from './lists.service';
import { ListsController } from './lists.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Lists } from './entities/list.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Lists])],
  controllers: [ListsController],
  providers: [ListsService],
  exports: [ListsService]
})
export class ListsModule { }
