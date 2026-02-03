import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, ParseIntPipe } from '@nestjs/common';
import { VideosService } from './videos.service';
import { CreateVideoDto } from './dto/create-video.dto';
import { UpdateVideoDto } from './dto/update-video.dto';
import { GetCurrentUser } from 'src/users/decorators/current-user.decorator';
import { ProtectGard } from 'src/users/guards/Protect.guard';
import { User } from 'src/users/entity/User.entity';
import { userType } from 'src/utils/enum';

@Controller('/api/v1/videos')
export class VideosController {
  constructor(private readonly videosService: VideosService) {}

  @Post()
  create(@Body() createVideoDto: CreateVideoDto) {
    return this.videosService.create(createVideoDto);
  }

  @UseGuards(ProtectGard)
  @Get()
  findAllForCurrentUser(@GetCurrentUser() user:User) {
     if(user.role === userType.ADMIN)
       return this.videosService.findAll();
    return this.videosService.findAllForCurrentUser(user.id);
  }

  @UseGuards(ProtectGard)
  @Get('/:videoId')
  findOne(@Param('videoId',ParseIntPipe) videoId: number, @GetCurrentUser() user:User) {
    return this.videosService.findOne(videoId, user);
  }

  @UseGuards(ProtectGard)
  @Patch(':videoId')
  update(@Param('videoId',ParseIntPipe) videoId: number, @Body() updateVideoDto: UpdateVideoDto,@GetCurrentUser() user:User) {
    return this.videosService.update(+videoId, updateVideoDto, user);
  }

  @UseGuards(ProtectGard)
  @Delete(':videoId')
  remove(@Param('videoId',ParseIntPipe) videoId: number, @GetCurrentUser() user:User) {
    return this.videosService.remove(videoId, user);
  }
}
