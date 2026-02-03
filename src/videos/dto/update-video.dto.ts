import { PartialType } from '@nestjs/swagger';
import { CreateVideoDto } from './create-video.dto';
import { IsOptional, IsString } from 'class-validator';

export class UpdateVideoDto extends PartialType(CreateVideoDto) {

        @IsString()
        @IsOptional()
        title?: string;
        @IsString()
        @IsOptional()
        originalUrl?: string;
        @IsString()
        @IsOptional()
        platform?: string;
    
}
