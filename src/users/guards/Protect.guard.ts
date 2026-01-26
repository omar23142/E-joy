import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
//import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { Request } from "express";
import { CURENT_USER_KEY } from "../../utils/constants";
import { UserService } from "../User.Service";
import { Authconfig } from "src/config/AuthClass";


@Injectable()
export class ProtectGard implements CanActivate {
    constructor(
        private readonly jwtService: JwtService,
        private readonly config: Authconfig,
        private readonly userService: UserService
    ) { }
    async canActivate(context: ExecutionContext) {
        const req: Request = context.switchToHttp().getRequest();
        console.log('req.headers', req.headers.authorization)
        // exam the req.cookie have a token 
        const [type, jwtToken] = req.headers.authorization?.split(" ") ?? [];
        console.log(type)
        console.log('this is jwt test: ', jwtToken)
        console.log(`Authorization: ${JSON.stringify(req.headers.authorization, null, 2)}`);
        const authHeader = req.headers.authorization; // "Bearer eyJhbGci..."
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.split(' ')[1];
            console.log('The Token is:', JSON.stringify(token, null, 2));
        }
        let payload;
        try {

            if (type === 'Bearer' && jwtToken) {
                console.log('in jwt verify')
                payload = await this.jwtService.verifyAsync(jwtToken, {
                    secret: this.config.jwt_secret_key,
                    //ignoreExpiration:true
                });
                console.log(payload)

            } else {
                throw new UnauthorizedException('access denied , no token provided   ')
            }
        } catch (error) {
            throw new UnauthorizedException('access denied , invalid token or expired')
        }
        // exam if the user still exist in db and not deleted 
        const currentUser = await this.userService.getOne(payload.id);
        if (!currentUser)
            throw new ForbiddenException('the user is no longer exist')
        // exam if the password not modyfied after the jwt token is issued 
        if (currentUser.passwordUpdatedAt) {
            const jwtIat = payload.iat * 1000; // seconds
            const pwdChanged = currentUser.passwordUpdatedAt.getTime();
            if (jwtIat < pwdChanged) {
                throw new UnauthorizedException('Token invalid due to password change');
            }
        }
        req[CURENT_USER_KEY] = currentUser;
        //  console.log('current user in guard', currentUser)
        return true;
    }


}