import { IsEmail, IsNotEmpty, Length, IsString, IsOptional } from "class-validator";



export class ResetPassDtoDto {
    
    @IsString()
    @IsNotEmpty()
    @Length(8,250)
    newPassword:string;
    @IsString()
    @IsNotEmpty()
    @Length(10,250)
    ResetPassToken:string
    @IsString()
    @IsNotEmpty()
    @Length(8,250)
    passwordConf:string;
}