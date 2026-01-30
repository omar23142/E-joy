import { IsNotEmpty, IsOptional, IsString } from "class-validator";



export class CreateListDto {
    @IsString()
    @IsNotEmpty()
    name: string;
    @IsOptional()
    @IsString()
    description?: string;
    // @IsOptional()
    // @IsString()
    // Vocabulary?: string;


}
