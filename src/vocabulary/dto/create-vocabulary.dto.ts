import { IsNotEmpty, IsNumber, IsOptional, IsString } from "class-validator";
import { CreateVideoDto } from "src/videos/dto/create-video.dto";

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
    
    @IsOptional()
    videoDetailes?: CreateVideoDto;
}
