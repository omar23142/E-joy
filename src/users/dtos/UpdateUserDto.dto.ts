import { IsEmail, IsNotEmpty, IsOptional, IsString, IsUrl, Length } from "class-validator";
import { isDeepStrictEqual } from "util";



export class UpdateUserDto {
    @IsEmail()
    @IsNotEmpty()
    @Length(5,250)
    @IsOptional()
    email?:string;
    @IsString()
    @Length(2,150)
    @IsOptional()
    userName?:string;
    @IsString()
    @IsNotEmpty()
    @Length(8,250)
    @IsOptional()
    password?:string;
    @IsString()
    @IsNotEmpty()
    @Length(8,250)
    @IsOptional()
    passwordConf?:string;
    @IsUrl()
    @IsOptional()
    photo?:string;

}