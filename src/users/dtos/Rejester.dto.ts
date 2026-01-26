import { IsEmail, IsNotEmpty, IsOptional, IsString, IsUrl, Length } from "class-validator";
import { isDeepStrictEqual } from "util";



export class RejesterDto {
    @IsEmail()
    @IsNotEmpty()
    @Length(5, 250)
    email: string;
    @IsString()
    @Length(2, 150)
    @IsOptional()
    userName?: string;
    @IsString()
    @IsNotEmpty()
    @Length(8, 250)
    password: string;
    @IsString()
    @IsNotEmpty()
    @Length(8, 250)

    passwordConf: string;
    @IsUrl()
    @IsOptional()
    photo?: string;
    @IsString()
    @IsNotEmpty()
    @Length(2, 150)
    nativeLanguage: string;
    @IsString()
    @IsNotEmpty()
    @Length(2, 150)
    targetLanguage: string;
}

