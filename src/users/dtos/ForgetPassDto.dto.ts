import { IsEmail, IsNotEmpty, Length, IsString, IsOptional } from "class-validator";




export class ForgetPassDto {
    @IsEmail()
    @IsNotEmpty()
    @Length(5,250)
    @IsOptional()
    email?:string;
    @IsString()
    @Length(2,150)
    @IsOptional()
    userName?:string;
    
  

}