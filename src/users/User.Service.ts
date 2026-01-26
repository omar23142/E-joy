import { BadRequestException, Body, ForbiddenException, Inject, Injectable, NotFoundException, ParseDatePipe, Request, Res, forwardRef } from "@nestjs/common";
//import { ReviewsService } from "../reviews/reviews.service";
import { RejesterDto } from "./dtos/Rejester.dto";
import { LoginDto } from "./dtos/LoginDto.dto";
import { InjectRepository } from "@nestjs/typeorm";
import { User } from "./entity/User.entity";
import { Repository } from "typeorm";
import * as bcrypt from "bcryptjs";
//import { ConfigService } from "@nestjs/config";
import { UpdateUserDto } from "./dtos/UpdateUserDto.dto";
import { AuthProvider } from "./providers/auth.provider";
import { join } from "path";
import fs from "fs";
import type { Request as ExpressRequest, Response } from "express";
import { randomBytes, createHash } from "crypto";
import { userType } from "../utils/enum";
import { MailService } from "../mail/mail.service";
import { ResetPassDtoDto } from "./dtos/RessetPassDto.dto";
//import type { Request as ExpressRequest } from "express";


@Injectable()
export class UserService {
    // private readonly ReviewsService:ReviewsService;
    constructor(
        //@Inject(forwardRef( () => ReviewsService)) 
        //private readonly ReviewsService:ReviewsService,
        @InjectRepository(User)
        private readonly userRepo: Repository<User>,
        private readonly authProvider: AuthProvider,
        //private readonly config:ConfigService,
        private readonly MailService: MailService) { }
    public getAll() {
        return this.userRepo.find();
    }

    /**
     * creat new users
     * @param RejesterDto the body that send from users
     * @returns Promise<string>
     */
    public async sigup(RejesterDto: RejesterDto, @Request() req: ExpressRequest) {
        return this.authProvider.sigup(RejesterDto, req)
    }
    /**
     *  log in the user
     * @param LoginDto body object that user give 
     * @returns Promise<string>
     */
    public async login(LoginDto: LoginDto, req: ExpressRequest): Promise<{
        message: string;
        accessToken?: undefined;
    } | {
        accessToken: string;
        message?: undefined;
    }> {
        return this.authProvider.login(LoginDto, req);
    }


    public async getOne(id: number, email?: string | null) {

        let current_user = await this.userRepo.findOneBy({ id });

        if (!current_user)
            throw new NotFoundException('user not found')
        return current_user;
    }

    public async updateOne(body: UpdateUserDto, id: number) {
        let current_user = await this.userRepo.findOne({ where: { id: id } });
        if (!current_user)
            throw new ForbiddenException('the user is no longer exist')
        let updated_user = current_user;
        updated_user.userName = body.userName ?? current_user.userName
        updated_user.email = body.email ?? current_user.email;
        updated_user.photo = body.photo ?? current_user.photo;
        if (body.password) {
            if (body.password !== body.passwordConf)
                throw new BadRequestException('the password confirm do not equal to password');
            const salt = await bcrypt.genSalt(10);
            const hashedPass = await bcrypt.hash(body.password, salt)
            updated_user.password = hashedPass;
            updated_user.passwordUpdatedAt = new Date(Date.now());
            console.log('date tesssst : ', new Date(Date.now()))
        }
        await this.userRepo.save(updated_user);
        return updated_user

    }

    public async deleteMe(id: number) {
        const current_user = await this.userRepo.findOneBy({ id });
        if (!current_user)
            throw new ForbiddenException('you are not allowed to do this(user does not exist) ')
        await this.userRepo.remove(current_user);
        return 'user is deleted successfuly'
    }
    public async IsUserExist(UserId: number) {
        const user = await this.userRepo.findOne(
            {
                where: { id: UserId },
                select: ['id']
            });
        if (!user)
            throw new NotFoundException('this user is no longer exist')
        return user;
    }

    // public async setUserImage(user:user, ImageName:string) {
    //     await this.IsUserExist(user.id)
    //     if (user.photo === null)
    //         user.photo = ImageName;
    //     else {
    //         await this.deleteImageFile(user.photo);
    //          user.photo = ImageName;
    //     }

    //     await this.userRepo.save(user);
    //     return  user;
    // }

    // use coludinary for save the image , not on server
    public async setUserImage(user: User, ImageUrl: string) {
        await this.IsUserExist(user.id)
        user.photo = ImageUrl;
        await this.userRepo.save(user);
        return user;
    }



    public async RemoveUserImage(userId: number) {
        const user = await this.getOne(userId);
        if (user.photo === null)
            throw new BadRequestException('there is no photo for this user')
        await this.deleteImageFile(user.photo)
        return this.userRepo.update(userId, { photo: null })

    }





    public getUserImage(user: User, res: Response) {
        if (!user.photo)
            throw new BadRequestException('this user do not have photo')

        return res.sendFile(user.photo, { root: 'images/users' });
    }


    private async deleteImageFile(fileName: string) {
        const imagePath = join(process.cwd(), `./images/users/${fileName}`);

        try {
            await fs.promises.unlink(imagePath);
        } catch (err) {
            console.warn('Image not found while deleting:', err);
        }
    }

    public async VerifyEmail(userId: number, verifycationEmail: string) {
        const user = await this.getOne(userId);
        if (user.verificationToken === null)
            throw new NotFoundException('there is no verification token for this user');
        // console.log('from email',verifycationEmail)
        // console.log('from database', user.verificationToken)
        if (verifycationEmail !== user.verificationToken)
            throw new BadRequestException('the verification token is not valid ')
        user.verificationToken = null;
        user.isVerified = true;
        await this.userRepo.save(user);
        return { message: ' your acount has been verified succussfuly and you can log in ' }
    }
    public async ForgetPassword(@Request() req: ExpressRequest, email?: string, userName?: string) {
        let user: User | null = null;
        if (email)
            user = await this.userRepo.findOne({ where: { email: email } });
        else if (userName)
            user = await this.userRepo.findOne({ where: { userName } });
        if (!user)
            throw new BadRequestException('user with given email is not exist');
        const ResetPassToken: string = randomBytes(32).toString('hex');
        const URL = `${req.protocol}://${req.get('host')}/api/v1/users/reset-password/${ResetPassToken}`;
        const hashedtoken = createHash('sha256').update(ResetPassToken).digest('hex')
        user.ResetPassToken = hashedtoken;
        user.ResetPassTokenExpires = new Date(Date.now() + 10 * 60 * 1000);
        let resault = await this.userRepo.save(user);
        await this.MailService.sendResetPassword(user, URL);

        return { message: 'your reset link was sent to your email, plais use the link in it to reset your password' }

    }
    public async GetResetPassword(token: string, @Res() res: Response) {
        const hashedtoken = createHash('sha256').update(token).digest('hex');
        console.log(token);
        const user = await this.userRepo.findOne({ where: { ResetPassToken: hashedtoken } });
        console.log(user);
        if (!user) {
            // throw new BadRequestException('invalid link pleas make shure you are use the link from the email we send to you')
            return res.redirect(`http://localhost:3001/invalid-link`);
        }
        if (!user?.ResetPassTokenExpires || user.ResetPassTokenExpires.getTime() < Date.now())
            return res.redirect(`http://localhost:3001/invalid-link`);
        return res.redirect(`http://localhost:3001/reset-password?token=${token}`);
    }
    public async PostResetPassword(dto: ResetPassDtoDto) {
        const { newPassword, passwordConf, ResetPassToken } = dto;
        const hashedToken = createHash('sha256').update(ResetPassToken).digest('hex');
        let user = await this.userRepo.findOne({ where: { ResetPassToken: hashedToken } });
        if (!user)
            throw new BadRequestException('invalid token or the token has been expired');
        if (!user?.ResetPassTokenExpires || user.ResetPassTokenExpires.getTime() < Date.now()) {
            user.ResetPassToken = null;
            user.ResetPassTokenExpires = null;
            await this.userRepo.save(user);
            throw new BadRequestException('invalid token or the token has been expired');
        }
        if (newPassword !== passwordConf)
            throw new BadRequestException('the newPass is not equal passwordConf');
        const salt = await bcrypt.genSalt(12);
        const hashedPass = await bcrypt.hash(newPassword, salt);

        user.password = hashedPass;

        user.ResetPassToken = null;
        user.ResetPassTokenExpires = null;
        user.passwordUpdatedAt = new Date();
        const resault = await this.userRepo.save(user);
        return 'your password has changed succussfuly, and you can login'
    }
}