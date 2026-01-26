import { BadRequestException, Body, ClassSerializerInterceptor, Controller, Delete, Get, HttpCode, HttpStatus, Logger, Param, Patch, Post, Request, Req, Res, UploadedFile, UseGuards, UseInterceptors, ParseIntPipe } from "@nestjs/common";
import { UserService } from "./User.Service";
import { RejesterDto } from "./dtos/Rejester.dto";
import { LoginDto } from "./dtos/LoginDto.dto";
import { RestrictToGuard } from "./guards/RestrictTo.guard";
import { ProtectGard } from './guards/Protect.guard';
import { CURENT_USER_KEY } from "../utils/constants";
import { GetCurrentUser } from "./decorators/current-user.decorator";
import * as types from "../utils/types";
import { Roles } from "./decorators/userRole.decorator";
import { userType } from "../utils/enum";
import { UpdateUserDto } from "./dtos/UpdateUserDto.dto";
import { User } from "./entity/User.entity";
import { LoggerInterceptor } from "../utils/interceptors/logger.interceptor";
import type { Response, Express } from "express";
import { FileInterceptor } from "@nestjs/platform-express";

import type { Request as ExpressRequest } from "express";
import { ForgetPassDto } from "./dtos/ForgetPassDto.dto";
import { ResetPassDtoDto } from "./dtos/RessetPassDto.dto";
import { imageUploadDto } from "./dtos/image-upload-DTO.dto";
import { ApiSecurity, ApiConsumes, ApiBody } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { throttle } from "rxjs";


@Controller()
export class UsersController {
    private readonly UserService: UserService;
    private readonly loger;

    constructor(userService: UserService,

    ) {
        this.UserService = userService;
        this.loger = new Logger(UsersController.name);
    }
    @Get('/api/v1/users')
    @Roles(userType.ADMIN, userType.NORMAL_USER)
    @UseGuards(ProtectGard, RestrictToGuard)
    @UseInterceptors(ClassSerializerInterceptor)
    public getAllUsers() {
        return this.UserService.getAll();
    }
    @Get('/api/v1/users/me')
    @UseInterceptors(LoggerInterceptor)
    @UseGuards(ProtectGard)
    public getMe(@GetCurrentUser() payload: User) {
        console.log('in the routeHandler')
        return this.UserService.getOne(payload.id)
    }
    @UseGuards(ProtectGard)
    @Patch('/api/v1/users/updateMe')

    public updateLogedInUser(@Body() body: UpdateUserDto, @GetCurrentUser() current_user: User) {
        console.log('this is current user: ', current_user)
        return this.UserService.updateOne(body, current_user.id);
    }

    @Post('/api/v1/users/auth/signup')
    @Throttle({ default: { limit: 3, ttl: 10000 } })
    public register(@Body() body: RejesterDto, @Request() req: ExpressRequest) {
        return this.UserService.sigup(body, req);
    }
    @Post('/api/v1/users/auth/signin')
    @Throttle({ default: { limit: 3, ttl: 10000 } })
    @HttpCode(HttpStatus.OK)
    public async signin(@Body() body: LoginDto, req: ExpressRequest) {
        const result = await this.UserService.login(body, req);
        console.log('Result in Controller:', result);
        return result;
    }

    @Delete('/api/v1/users/deletMe')
    @UseGuards(ProtectGard)
    public deleteMe(@GetCurrentUser() user) {
        return this.UserService.deleteMe(user.id)
    }

    @Post('api/v1/users/profileImage')
    @UseGuards(ProtectGard)
    @ApiSecurity('bearer')
    @ApiConsumes('multipart/form-data')
    @ApiBody({ type: imageUploadDto, description: 'profile  image' })
    @UseInterceptors(FileInterceptor('userImage'))


    public uploadFile(@UploadedFile() file: Express.Multer.File, @GetCurrentUser() user: User) {
        this.loger.debug(file)
        if (!file) {
            throw new BadRequestException('File is required');
        }
        console.log(file);
        // return {message: 'file uploaded successfully', filePath: file.path};
        return this.UserService.setUserImage(user, file.filename)
    }



    @Delete('api/v1/users/profileImage')
    @UseGuards(ProtectGard)
    public RemoveProfileImage(@GetCurrentUser() user: User) {
        return this.UserService.RemoveUserImage(user.id);
    }

    @Get('api/v1/users/profileImage')
    @UseGuards(ProtectGard)
    public getUserImage(@GetCurrentUser() user, @Res() res: Response) {
        return this.UserService.getUserImage(user, res)
    }

    @Get('/api/v1/users/verify-email/:userId/:verifecationToken')
    public verifyEmail(
        @Param('userId', ParseIntPipe) userId: number,
        @Param('verifecationToken') verificationToken: string,
    ) {
        return this.UserService.VerifyEmail(userId, verificationToken);
    }
    @Post('/api/v1/users/forget-password')
    @HttpCode(HttpStatus.OK)
    public ForgetPass(
        // @Param('userId',ParseIntPipe) userId:number, @Param('ResetPassToken') token:string,
        @Req() req: ExpressRequest, @Body() dto: ForgetPassDto) {
        return this.UserService.ForgetPassword(req, dto.email, dto.userName);
    }
    @Get('api/v1/users/reset-password/:ResetPassToken')
    public GetResetPass(
        @Param('ResetPassToken') token: string,
        @Res() res: Response
    ) {
        return this.UserService.GetResetPassword(token, res);
    }
    @Post('/api/v1/users/reset-password')
    @Throttle({ short: {} })
    @HttpCode(HttpStatus.OK)
    public ResetPass(
        @Body() dto: ResetPassDtoDto) {
        return this.UserService.PostResetPassword(dto);
    }

}