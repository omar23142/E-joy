import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateVideoDto } from './dto/create-video.dto';
import { UpdateVideoDto } from './dto/update-video.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Video } from './entities/video.entity';
import {  Repository } from 'typeorm';
import { platform } from 'os';
import { Vocabulary } from 'src/vocabulary/entities/vocabulary.entity';
import { User } from 'src/users/entity/User.entity';

@Injectable()
export class VideosService {
  constructor(
    @InjectRepository(Video)
    private readonly videoRepo: Repository<Video>,
  ) { }
  async create(dto: CreateVideoDto) {
    const {originalUrl, platform, title} = dto;
    let platformId:string = this.extractPlatformId(originalUrl, platform);
    let existVideo;
    if (platformId === originalUrl) {
      existVideo = await this.videoRepo.findOne( {
      where:{
        originalUrl:originalUrl
    }
  });
  platformId = ''
  } else { 
    console.log(platformId)
    existVideo = await this.videoRepo.findOne( {
      where:{
        platform:platform,
        platformId:platformId }
      });
    }
    if (existVideo)
      throw new BadRequestException('this video with this url and  platform is already exist ');
    console.log(platformId)
    let newVideo = await  this.videoRepo.create({
      originalUrl:dto.originalUrl
      ,title:dto.title,
      platform:dto.platform
      ,platformId:platformId});
    console.log(newVideo);
    return this.videoRepo.save(newVideo);
  }

  public async findAllForCurrentUser(userId:number) {
//    SELECT DISTINCT v.*
//    FROM videos v
//    INNER JOIN vocabulary voc ON voc.video_id = v.id
//    WHERE voc.user_id = 1;

    const videos = await this.videoRepo
    .createQueryBuilder("video")
    .innerJoin("video.vocabulary", "voc")
    .where("voc.userId =:userId", {userId: userId} )
    .groupBy('video.id')
    .getRawMany()

    return videos;
    
  }
  public async findAll() {
   const videos = await this.videoRepo.find();
   return videos;
  }

  async findOne(videoId: number, user:User) {
//     SELECT video.*
// FROM videos video
// INNER JOIN vocabulary voc
//   ON voc.video_id = video.id
//  AND voc.user_id = :userId
// WHERE video.id = :videoId;
    const video = await this.videoRepo
    .createQueryBuilder("video")
    .innerJoin("video.vocabulary", "voc", "voc.userId =:userId",{userId: user.id})
    .where("video.id=:videoId", {videoId: videoId} )
    .getOne();
    if (!video)
      throw new NotFoundException('this video with this id: '+videoId + ' and for this user not exist')
    return video;
    
  }

  async update(videoId: number, dto: UpdateVideoDto, user:User) {
    const video = await this.findOne(videoId, user)
    let updatedVideo = video;
    updatedVideo.title = dto.title ?? video.title;
    updatedVideo.platform = dto.platform ?? video.platform;
    updatedVideo.originalUrl = dto.originalUrl ?? video.originalUrl;
    //console.log(updatedVideo)
    
    return this.videoRepo.save(updatedVideo);
  }

  async remove(videoId:number, user:User) {
    const video = await this.findOne(videoId, user);
    return this.videoRepo.remove(video);
  }


  public async IsVideoExist(VideoId: number) {
    const video = await this.videoRepo.findOne(
      {
        where: { id: VideoId },
        select: ['id']
      });
    if (!video)
      throw new NotFoundException('this video is no longer exist')
    return video;
  }

  private extractPlatformId(originalUrl:string, platform:string): string {
    switch (platform.toLocaleLowerCase()) {
      case 'youtube':
        const ytRegex = /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
        //const ytRegex2 = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
        const match1 =  originalUrl.match(ytRegex);
        console.log('match1', match1);
        //const match2 = originalUrl.match(ytRegex2);
        //console.log('match2', match2);
        return match1 ? match1[1] : originalUrl;

      case 'vimeo':
        const vimoRegex  =   /(?:vimeo\.com\/|player\.vimeo\.com\/video\/)([0-9]+)/;
        const match = originalUrl.match(vimoRegex);
        console.log(match);
        return match ? match[1] : originalUrl;

      case 'coursera':
          const courseraRegex = /coursera\.org\/learn\/[^\/]+\/lecture\/([^\/?#]+)/
          const courseraMatch = originalUrl.match(courseraRegex);
          console.log(courseraMatch)
          return courseraMatch? courseraMatch[1] : originalUrl;

      case 'udemy':
        const udemyRegex = /udemy\.com\/course\/[^\/]+\/learn\/lecture\/(\d+)/;
        const udemyMatch = originalUrl.match(udemyRegex);
        console.log(udemyMatch);
        return udemyMatch ? udemyMatch[1] : originalUrl;

      case 'facebook':
        const fbRegex1 = /facebook\.com\/.+\/videos\/(\d+)/;      // /{user}/videos/{id}
        const fbRegex2 = /facebook\.com\/video\.php\?v=(\d+)/;   // video.php?v=ID
        const faceMatch1 = originalUrl.match(fbRegex1);
        const faceMatch2 = originalUrl.match(fbRegex2);
        console.log(faceMatch1, faceMatch2);
        return faceMatch1 ? faceMatch1[1] : faceMatch2 ? faceMatch2[1] : originalUrl;

      case 'instagram':
        const instagramRegex =/instagram\.com\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/;
        const instaMatch = originalUrl.match(instagramRegex);
        console.log(instaMatch);
        return instaMatch ? instaMatch[1] : originalUrl;

      case 'tiktok': 
      const tiktokRegex =/tiktok\.com\/@[^\/]+\/video\/(\d+)/;
      const tiktokMatch = originalUrl.match(tiktokRegex);
      console.log(tiktokMatch);

      const tiktokshort = /vm\.tiktok\.com\/([A-Za-z0-9]+)/;
      const shortMatch = originalUrl.match(tiktokshort)
      console.log(shortMatch)

      return shortMatch ? shortMatch[1] : tiktokMatch? tiktokMatch[1] : originalUrl;

      default:
        return originalUrl;
  
  

      

    }
  }
}
