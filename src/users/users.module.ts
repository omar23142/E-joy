import { BadRequestException, Controller, forwardRef, Module } from "@nestjs/common";
import { UsersController } from "./users.controller";
import { UserService } from "./User.Service";
//import { ReviewModule } from "../reviews/reviews.module";
import { User } from "./entity/User.entity";
import { TypeOrmModule } from "@nestjs/typeorm";
import { JwtModule, JwtService } from "@nestjs/jwt";
//import { ConfigService } from "@nestjs/config";
import { error } from "console";
import type { StringValue } from "ms";
import { AuthProvider } from "./providers/auth.provider";
import { MulterModule } from "@nestjs/platform-express";
import { CURENT_USER_KEY } from "../utils/constants";
import { diskStorage } from "multer";
import { MailModule } from "../mail/mail.module";


@Module({
    providers: [UserService, AuthProvider, JwtService],
    imports: [
        MailModule,
        //forwardRef(() => ReviewModule ),
        TypeOrmModule.forFeature([User]),
        MulterModule.register({
            storage: diskStorage({
                destination: './images/users',
                filename: (req: any, file, cb) => {
                    const ext = file.originalname.split('.').pop();
                    console.log(req[CURENT_USER_KEY])
                    const newName = `user-${req[CURENT_USER_KEY].userName}-${req[CURENT_USER_KEY].id}-${Date.now()}.${ext}`;
                    console.log(newName)
                    cb(null, newName)
                }

            }), fileFilter: (req, file, cb) => {
                const type = file.mimetype.split('/')[0];
                if (type === 'image')
                    cb(null, true)
                else
                    cb(new BadRequestException('only image files are allowed'), false)
            },
            limits: { fileSize: 1024 * 1024 * 2 }

        })
    ],
    controllers: [UsersController],
    exports: [UserService]

})
export class UsersModule {

}




