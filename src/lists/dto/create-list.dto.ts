import { IsNotEmpty, IsOptional, IsString } from "class-validator";



export class CreateListDto {
    constructor(name:string, description:string){
        this.name = name;
        this.description = description;
    }
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
