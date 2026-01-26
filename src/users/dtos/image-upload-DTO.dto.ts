
import { ApiProperty } from "@nestjs/swagger";
import type { Express } from "express";

export class imageUploadDto {
    
    @ApiProperty( { 
        type:'string',
        format:'binary',
        required:true,
        name:'userImage'
     })
    file:Express.Multer.File

}