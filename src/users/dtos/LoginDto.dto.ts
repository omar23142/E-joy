import { IsEmail, IsNotEmpty, IsOptional, IsString, IsUrl, Length } from "class-validator";




export class LoginDto {
    @IsEmail()
    @IsNotEmpty()
    @Length(5,250)
    email:string;
    @IsString()
    @Length(2,150)
    @IsOptional()
    userName?:string;
    @IsString()
    @IsNotEmpty()
    @Length(8,250)
    password:string;
  

}

