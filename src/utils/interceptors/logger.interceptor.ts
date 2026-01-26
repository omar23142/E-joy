import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { map, Observable, tap } from "rxjs";

@Injectable()
export class LoggerInterceptor implements NestInterceptor {
    intercept(context: ExecutionContext, next: CallHandler<any>): Observable<any> | Promise<Observable<any>> {
      console.log('before route handler')

      return next.handle().pipe( map((res)=> {
        const  {password, ...otherData} = res
        console.log('after route handler', otherData);
        return otherData;
    }
    ))
    }
    
}