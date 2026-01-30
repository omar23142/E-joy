import { IsNotEmpty, IsNumber, IsOptional, IsString } from "class-validator";

export class CreateVocabularyDto {
    @IsString()
    @IsNotEmpty()
    word: string;
    @IsString()
    @IsOptional()
    translation?: string;
    @IsString()
    @IsNotEmpty()
    language: string;
    @IsString()
    @IsNotEmpty()
    @IsOptional()
    contextSentence?: string;
    @IsNumber()
    @IsNotEmpty()
    @IsOptional()
    timeStamp?: number;
    @IsNumber()
    @IsNotEmpty()
    @IsOptional()
    listId?: number;
    @IsNumber()
    @IsNotEmpty()
    @IsOptional()
    videoId?: number;
}
