import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, ParseIntPipe } from '@nestjs/common';
import { VocabularyService } from './vocabulary.service';
import { CreateVocabularyDto } from './dto/create-vocabulary.dto';
import { UpdateVocabularyDto } from './dto/update-vocabulary.dto';
import { ProtectGard } from 'src/users/guards/Protect.guard';
import { GetCurrentUser } from 'src/users/decorators/current-user.decorator';
import { User } from 'src/users/entity/User.entity';
import { RestrictToGuard } from 'src/users/guards/RestrictTo.guard';
import { Roles } from 'src/users/decorators/userRole.decorator';
import { userType } from 'src/utils/enum';

@Controller()
export class VocabularyController {
  constructor(private readonly vocabularyService: VocabularyService) { }

  @UseGuards(ProtectGard)
  @Post('/api/v1/vocabulary/addword')
  create(@Body() createVocabularyDto: CreateVocabularyDto, @GetCurrentUser() user: User) {
    return this.vocabularyService.create(createVocabularyDto, user);
  }

  @Roles(userType.ADMIN)
  @UseGuards(ProtectGard, RestrictToGuard)
  @Get('/api/v1/admin/vocabulary')
  findAllForAdmin() {
    return this.vocabularyService.findAllForAdmin();
  }


  @UseGuards(ProtectGard)
  @Get('/api/v1/vocabulary')
  findAll(@GetCurrentUser() user: User) {
    return this.vocabularyService.findAllForCurrentUser(user.id);
  }

  //@UseGuards(ProtectGard)
  @Get('/api/v1/vocabulary/:wordId')
  findOne(@Param('wordId', ParseIntPipe) wordId: number) {
    return this.vocabularyService.findOne(+wordId);
  }

  @UseGuards(ProtectGard)
  @Patch('/api/v1/vocabulary/:wordId')
  update(@Param('wordId', ParseIntPipe) wordId: number, @Body() updateVocabularyDto: UpdateVocabularyDto, @GetCurrentUser() user: User) {
    return this.vocabularyService.update(+wordId, updateVocabularyDto, user.id);
  }



  @UseGuards(ProtectGard)
  @Delete('/api/v1/vocabulary/:wordId')
  remove(@Param('wordId', ParseIntPipe) wordId: number, @GetCurrentUser() user: User) {
    return this.vocabularyService.remove(+wordId, user.id);
  }
}
