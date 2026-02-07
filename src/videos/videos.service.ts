import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateVideoDto } from './dto/create-video.dto';
import { UpdateVideoDto } from './dto/update-video.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Video } from './entities/video.entity';
import {  Repository } from 'typeorm';
import { Vocabulary } from 'src/vocabulary/entities/vocabulary.entity';
import { User } from 'src/users/entity/User.entity';
import { createHash } from 'crypto';


@Injectable()
export class VideosService {
  constructor(
    @InjectRepository(Video)
    private readonly videoRepo: Repository<Video>,
    @InjectRepository(Vocabulary)
    private readonly vocabRepo: Repository<Vocabulary>
  ) { }

  async getOrCreateVideo(originalUrl:string, platform:string, title:string) {
      //  let result :string | urlObject =  this.extractPlatformId(originalUrl, platform);
      //  let video;
      //  if ( typeof result !== 'string' && result.isUrlHashed )
      //  {
      //    video = await this.videoRepo.findOneBy( { platformId: result.urlhashed , platform: platform})
      //  } else if(typeof result === 'string' ) {
      //  video = await this.videoRepo.findOneBy({ platformId: result}) 
      // }

      // if(!video) {
      //   const dto = new CreateVideoDto(originalUrl, platform, title)
      //     return this.create(dto)
      // }
      // return video;

       let platformId :string  =  this.extractPlatformId(originalUrl, platform);
        const video = await this.videoRepo.findOneBy({ platformId, platform }) 

      if(video) 
        return video;
       const dto = new CreateVideoDto(originalUrl, platform, title)
       // try for dealing with race condtion
      try {
       let newVideo = this.videoRepo.create(
      {
      originalUrl:dto.originalUrl,
      title:dto.title,
      platform:dto.platform,
      platformId:platformId,
      });
      console.log(newVideo);
    return this.videoRepo.save(newVideo);
    }catch (err:unknown) {
      if(err instanceof Error && (err.message.includes('unique') || (err as any).code === '23505'))
        return await this.videoRepo.findOneBy({platform, platformId});
      throw err;
    }
       

  
}
  // async create(dto: CreateVideoDto) {
  //   const {originalUrl, platform, title} = dto;
  //   let platformId: urlObject | string = this.extractPlatformId(originalUrl, platform);
  //   console.log(platformId)
  //   if(typeof platformId !== 'string')
  //     platformId = platformId.urlhashed
  //   let existVideo;
  //   if (platformId === originalUrl) {
  //     console.log(platformId, originalUrl)
  //     existVideo = await this.videoRepo.findOne( {
  //     where:{
  //       originalUrl:originalUrl
  //   }
  // });
  // console.log(existVideo)
  // // platformId = ''
  // } else { 
  //   console.log('in else ',platformId)
  //   existVideo = await this.videoRepo.findOne( {
  //     where:{
  //       platform:platform,
  //       platformId:platformId }
  //     });
  //     console.log('in else ',existVideo)
  //   }
  //   if (existVideo)
  //     throw new BadRequestException('this video with this url and  platform is already exist ');
  //   console.log(platformId)
  //   let newVideo = await  this.videoRepo.create(
  //     {
  //     originalUrl:dto.originalUrl,
  //     title:dto.title,
  //     platform:dto.platform,
  //     platformId:platformId,
  //     });
  //   console.log(newVideo);
  //   return this.videoRepo.save(newVideo);
  // }

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


  // for remove vocab from spicific video
  async unlinkVideoFromVocab(userId:number, videoId:number){
    return await this.vocabRepo.update({user:{id:userId}, video:{id:videoId}}, 
      {video : null}
    )

  }

 
  async removeForAdmin(videoId:number) {
    const video = await this.videoRepo.findOneBy({id:videoId});
    if (!video)
      throw new BadRequestException('this video is not exist be sure from the id ');
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

 
    private extractPlatformId(originalUrl: string, platform: string) {
  // 1. دالة مساعدة بسيطة: تعطيها النمط (Regex) وتعطيك الـ ID أو null
  const findId = (regex: RegExp) => {
    const match = originalUrl.match(regex);
    return match ? match[1] : null;
  };

  // 2. التحقق بناءً على المنصة
  switch (platform.toLowerCase()) {
    
    case 'youtube':
      // يدعم: watch, embed, shorts, youtu.be
      return findId(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/) 
             || originalUrl;

    case 'vimeo':
      return findId(/(?:vimeo\.com\/|player\.vimeo\.com\/video\/)([0-9]+)/) 
             || originalUrl;

    case 'coursera':
      return findId(/coursera\.org\/learn\/[^\/]+\/lecture\/([^\/?#]+)/) 
             || originalUrl;

    case 'udemy':
      return findId(/udemy\.com\/course\/[^\/]+\/learn\/lecture\/(\d+)/) 
             || originalUrl;

    case 'facebook':
      // نجرب الرابط العادي أولاً، إذا لم ينجح نجرب رابط video.php
      return findId(/facebook\.com\/.+\/videos\/(\d+)/) 
             || findId(/facebook\.com\/video\.php\?v=(\d+)/) 
             || originalUrl;

    case 'instagram':
      // يدعم: posts (p), reels, tv
      return findId(/instagram\.com\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/) 
             || originalUrl;

    case 'tiktok':
      // نجرب الرابط الطويل أولاً، ثم الرابط القصير (vm.tiktok)
      return findId(/tiktok\.com\/@[^\/]+\/video\/(\d+)/) 
             || findId(/vm\.tiktok\.com\/([A-Za-z0-9]+)/) 
             || originalUrl;

    default:
      let urlhashed =  createHash('md5').update(originalUrl).digest('hex') ;
      return urlhashed;
  }
}
  
}
