import { createParamDecorator } from "@nestjs/common";
import { ExecutionContext } from "@nestjs/common"
import { CURENT_USER_KEY } from "../../utils/constants";
import { JwtPayloadType } from "../../utils/types";
import { User } from "../entity/User.entity";



export const GetCurrentUser = createParamDecorator((data, context: ExecutionContext) => {
   const req: Request = context.switchToHttp().getRequest();
   const current_user: User = req[CURENT_USER_KEY];
   return current_user;
})