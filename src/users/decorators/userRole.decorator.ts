
import { SetMetadata } from "@nestjs/common";
import { userType } from "../../utils/enum";

// this is methode decorator for add metadate on function 
export const Roles =  (...roles:userType[]) => {
   return SetMetadata('roles', roles);
} 

