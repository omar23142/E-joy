import { PartialType } from '@nestjs/swagger';
import { CreateVocabularyDto } from './create-vocabulary.dto';
import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class UpdateVocabularyDto extends PartialType(CreateVocabularyDto) {
    @IsString()
    @IsNotEmpty()
    @IsOptional()
    word?: string;

    @IsString()
    @IsNotEmpty()
    @IsOptional()
    translation?: string;

    @IsString()
    @IsNotEmpty()
    @IsOptional()
    language?: string;

    @IsString()
    @IsNotEmpty()
    @IsOptional()
    contextSentence?: string;

    @IsNumber()
    @IsNotEmpty()
    @IsOptional()
    timeStamp?: number;
}
