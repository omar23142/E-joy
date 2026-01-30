import { PartialType } from '@nestjs/swagger';
import { CreateListDto } from './create-list.dto';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdateListDto extends PartialType(CreateListDto) {
    @IsString()
    @IsOptional()
    name?: string;
    //     @IsOptional()
    //     @IsString()
    //     description?: string;
    //     @IsOptional()
    //     @IsString()
    //     Vocabulary?:string;
}
