import {  IsNotEmpty, IsOptional, IsString,  } from "class-validator";

export class CreateTranslateDto {
    @IsString()
    @IsNotEmpty()
    word:string;
    @IsString()
    @IsOptional()
    contextSentence:string;
    @IsString()
    @IsNotEmpty()
    language:string;
}
