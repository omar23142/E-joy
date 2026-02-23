import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CreateTranslateDto } from './dto/create-translate.dto';
import { ProtectGard } from 'src/users/guards/Protect.guard';
import { GetCurrentUser } from 'src/users/decorators/current-user.decorator';
import { User } from 'src/users/entity/User.entity';
import { TranslateService } from './translate.service';
import { IsArray, IsString } from 'class-validator';

class BatchTranslateDto {
  @IsArray()
  sentences: string[];
}

@Controller()
export class TranslateController {
  constructor(private readonly translateService: TranslateService) { }
  @UseGuards(ProtectGard)
  @HttpCode(HttpStatus.OK)
  @Post('/api/v1/translate')
  create(
    @Body() translateDto: CreateTranslateDto,
    @GetCurrentUser() user: User,
  ) {
    return this.translateService.translate(
      translateDto.word,
      translateDto.contextSentence,
    );
  }

  // Batch subtitle translation — no auth needed, translates array of sentences
  @HttpCode(HttpStatus.OK)
  @Post('/api/v1/translate/batch')
  async batchTranslate(@Body() dto: BatchTranslateDto) {
    return this.translateService.batchTranslate(dto.sentences);
  }

  //   @Roles(userType.ADMIN)
  //   @UseGuards(ProtectGard, RestrictToGuard)
  //   @Get('/api/v1/admin/vocabulary')
  //   findAllForAdmin() {
  //     return this.vocabularyService.findAllForAdmin();
  //   }

  //   @UseGuards(ProtectGard)
  //   @Get('/api/v1/vocabulary')
  //   findAll(@GetCurrentUser() user: User) {
  //     return this.vocabularyService.findAllForCurrentUser(user.id);
  //   }

  //   @UseGuards(ProtectGard)
  //   @Get('/api/v1/vocabulary/:wordId')
  //   findOne(@Param('wordId', ParseIntPipe) wordId: number, @GetCurrentUser() user: User) {
  //     return this.vocabularyService.findOne(+wordId, user.id);
  //   }

  //   @UseGuards(ProtectGard)
  //   @Patch('/api/v1/vocabulary/:wordId')
  //   update(@Param('wordId', ParseIntPipe) wordId: number, @Body() updateVocabularyDto: UpdateVocabularyDto, @GetCurrentUser() user: User) {
  //     return this.vocabularyService.update(+wordId, updateVocabularyDto, user.id);
  //   }

  //   @UseGuards(ProtectGard)
  //   @Delete('/api/v1/vocabulary/:wordId')
  //   remove(@Param('wordId', ParseIntPipe) wordId: number, @GetCurrentUser() user: User) {
  //     return this.vocabularyService.remove(+wordId, user.id);
  //   }

  //   @UseGuards(ProtectGard)
  //   @Delete('/api/v1/vocabulary/video/:videoId')
  //   deleteAllVocabForSpicificVideo(@Param('videoId', ParseIntPipe) videoId: number, @GetCurrentUser() user: User) {
  //     return this.vocabularyService.removeVideoActivity(videoId, user.id);
  //   }
}
