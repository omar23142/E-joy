
import { Configuration, Value } from "@itgorillaz/configify";
import { IsNotEmpty, IsString, IsNumber } from 'class-validator';
@Configuration()
export class DatabaseConfig {
    @Value('DB_database')
    @IsNotEmpty()
    @IsString()
    public readonly DB_database: string;
    @Value('DB_type')
    @IsNotEmpty()
    @IsString()
    public readonly DB_type: string;
    @Value('DB_host')
    @IsNotEmpty()
    @IsString()
    public readonly DB_host: string;
    @Value('DB_port')
    @IsNotEmpty()
    //@IsNumber()
    public readonly DB_port: number;
    @Value('DB_username')
    @IsNotEmpty()
    @IsString()
    public readonly DB_username: string;
    @Value('DB_password')
    @IsNotEmpty()
    @IsString()
    public readonly DB_password: string;

}
