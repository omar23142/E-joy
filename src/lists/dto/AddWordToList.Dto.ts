import { Vocabulary } from "src/vocabulary/entities/vocabulary.entity";
import { Lists } from "../entities/list.entity";
import { IsNotEmpty, IsNumber } from "class-validator";



export class AddWordToListDto {
    // @IsNotEmpty()
    // @IsNumber()
    // listId:number;
    @IsNotEmpty()
    @IsNumber()
    vocabId:number;
}