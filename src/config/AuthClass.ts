import { Configuration, Value } from "@itgorillaz/configify";
import { IsNotEmpty, IsString } from 'class-validator';
@Configuration()
export class Authconfig {
    @Value('JWT_SECRET_KEY')
    @IsNotEmpty()
    @IsString()
    public readonly jwt_secret_key: string;

}


