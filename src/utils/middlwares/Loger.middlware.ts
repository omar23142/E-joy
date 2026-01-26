import { NestMiddleware } from "@nestjs/common";
import { Request, Response, NextFunction } from "express";



export class LoggerMiddlware implements NestMiddleware {
    use(req: Request, res: Response, next:NextFunction) {
        console.log( {
            host:req.host,
            url:req.url,
           // headers:req.headers,
            methode:req.method
        })
        next();
    }
    
}