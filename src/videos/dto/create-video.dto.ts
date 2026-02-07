import { IsNotEmpty, IsString } from "class-validator";



export class CreateVideoDto {
    // private readonly originalUrl:string;
    // private readonly platform:string;
    // private readonly title:string;
constructor(originalUrl:string,platform:string, title:string ){
    this.originalUrl = originalUrl;
    this.platform = platform;
    this.title = title;
}
    @IsString()
    @IsNotEmpty()
    title: string;
    @IsString()
    @IsNotEmpty()
    originalUrl: string;
    @IsString()
    @IsNotEmpty()
    platform: string;

}
