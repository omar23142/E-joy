import { Configuration, Value } from "@itgorillaz/configify";
import { IsNumber, IsNotEmpty, IsString } from "class-validator";


@Configuration()
export class MaileConfig {
    @Value('SMTP_HOST')
    @IsNotEmpty()
    @IsString()
    public SMTP_HOST: string;

    @Value('SMTP_PORT')
    @IsNotEmpty()
    @IsString()

    public SMTP_PORT: string;
    @Value('SMTP_PASSWORD')
    @IsNotEmpty()
    @IsString()
    public SMTP_PASSWORD: string;

    @Value('SMTP_USERNAME')
    @IsNotEmpty()
    @IsString()
    public SMTP_USERNAME: string;


    public SENDGRID_PASSWORD: string;

    public SENDGRID_USERNAME: string;
}