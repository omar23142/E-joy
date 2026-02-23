import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  registerDecorator,
  ValidateNested,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';
import { CreateListDto } from 'src/lists/dto/create-list.dto';

export class CreatelistDto {
  @IsNotEmpty()
  @IsString()
  listName: string;
  @IsOptional()
  @IsString()
  description?: string;
}
export class CreateVideoDto {
  @IsString()
  @IsNotEmpty()
  originalUrl: string;
  @IsNotEmpty()
  @IsString()
  platform: string;
  @IsNotEmpty()
  @IsString()
  title: string;
}

export class CreateVocabularyDto {
  @IsString()
  @IsNotEmpty()
  word: string;
  @IsString()
  @IsNotEmpty()
  selectedTranslate: string;
  @IsString()
  @IsNotEmpty()
  language: string;
  @IsString()
  @IsOptional()
  contextSentence?: string;
  @IsNumber()
  @IsNotEmpty()
  @IsOptional()
  timeStamp?: number;

  @IsOptional()
  @IsNumber()
  @IsNotEmpty()
  listId?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => CreateVideoDto)
  videoDetailes?: CreateVideoDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => CreateListDto)
  listDetailes?: CreateListDto;
}
