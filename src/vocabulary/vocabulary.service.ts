import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import fetch from 'node-fetch';
import { CreateVocabularyDto } from './dto/create-vocabulary.dto';
import { UpdateVocabularyDto } from './dto/update-vocabulary.dto';
import { IsNull, Repository } from 'typeorm';
import { Vocabulary } from './entities/vocabulary.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from 'src/users/entity/User.entity';
import { ListsService } from 'src/lists/lists.service';
import { VideosService } from 'src/videos/videos.service'
import { createHash } from 'crypto';
import { Video } from 'src/videos/entities/video.entity';
import { Lists } from 'src/lists/entities/list.entity';
import { CreateListDto } from 'src/lists/dto/create-list.dto';
import { DictionaryService } from 'src/dictionary/dictionary.service';

@Injectable()
export class VocabularyService {

  constructor(
    @InjectRepository(Vocabulary)
    private readonly vocRepo: Repository<Vocabulary>,
    private readonly listService: ListsService,
    private readonly videoService: VideosService,
    private readonly dictionaryService: DictionaryService) { }

  async create(dto: CreateVocabularyDto, user: User) {
    const { word, contextSentence, timeStamp, language, listId, videoDetailes, listDetailes } = dto;
   
    const sentenceToHash = contextSentence || '';
    const contextSentenceHashed = createHash('md5').update(sentenceToHash).digest('hex');

    let translatedText:string | undefined = await this.translate(word, contextSentenceHashed);
    


    let videoEntity: Video | null = null;
    let listEntity: Lists | null = null;

    if (videoDetailes) {
      videoEntity = await this.videoService.getOrCreateVideo(videoDetailes);
    }

    if (listDetailes) {
      listEntity = await this.listService.getOrCreate(listDetailes, user);
    } else if(listId) {  // if the frontend add vocab to exist list (known the listid)
      listEntity = await this.listService.findOne(listId, user)
    }

    //check if the word - translation -context already exist for this user
    const existVocab = await this.vocRepo.findOne({
      where: {
        user: { id: user.id },
        word: word,
        translation: translatedText,
        contextSentenceHashed: contextSentenceHashed,
        list: listEntity ? { id: listEntity.id } : IsNull()     // IsNull() sql function , use null here is not correct
      }
    })

    if (existVocab)
      throw new ConflictException('vocabulary already exist with same translate and context sentence')

        
    const newVocab = this.vocRepo.create({
      word,
      contextSentence,
      timeStamp,
      translation: translatedText,
      contextSentenceHashed: contextSentenceHashed,
      language: language,
      user: { id: user.id },
      // list: listId ? { id: listId } : null,
      // video: videoId ? { id: videoId } : null
      list: listEntity,
      video: videoEntity
    });

    return await this.vocRepo.save(newVocab);
  }


  public async translateByAPI(word:string) {
    const res = await fetch(`https://api.mymemory.translated.net/get?q=${word}&langpair=en|ar`);
    const data = await res.json();
    const translatedText = data.responseData.translatedText;
    let probletTranslate:string[] = []
    let i:number = 0;
    for (i ; i < data.matches.length; i++){
      // console.log('data', data.matches[i].translation)
      probletTranslate.push(data.matches[i].translation)
    }
     return  probletTranslate;
    }

    public async translate(word:string, contextSentenceHashed:string, ) {
      let APItranslate:string[], translatedText:string | undefined= undefined, existTranslateWithoutCont:string[] | null = null,dictionaryTranslate:any[]| null= null;
      let existTranslate = await this.vocRepo.createQueryBuilder("vocab")
    .select('vocab.translation')
    //.from(Vocabulary, "translation")
    .where("vocab.word =:word", {word:word})
    .andWhere("vocab.contextSentenceHashed =:contextSentenceHashed", {contextSentenceHashed})
    .limit(5)
    //.orderBy('created_at', 'ASC')
    .getMany();
    // if there translate with context
    if (existTranslate.length !== 0){
    console.log('ddddkkk', existTranslate[0].translation)
    console.log('with contexttttttttt', existTranslate)
    translatedText =  existTranslate[0].translation
    }
    // if there no translate with context
    else  {
      existTranslateWithoutCont= await this.vocRepo.createQueryBuilder('vocab')
      .select('vocab.translation','translation')
      .addSelect('COUNT(*)' , 'freq')
      .where("vocab.word =:word", {word})
      .groupBy('vocab.translation')
      .orderBy('freq', 'DESC')
      .limit(10)
      .getRawMany()
      // if there translate without context
       if(existTranslateWithoutCont.length > 0)
        {
      console.log('without context', existTranslateWithoutCont)
      translatedText = existTranslateWithoutCont[0];
      // if no translate without context use dictionary
    } else {
      dictionaryTranslate = await this.dictionaryService.findByWord(word);
       
       if (dictionaryTranslate.length > 0){
        console.log('dictionaryyyyyy',dictionaryTranslate)
        translatedText = dictionaryTranslate[0].ara} 
        // if no translate in the dictionary use Api
        else {
          APItranslate = await this.translateByAPI(word);
          console.log('Api translate', APItranslate);
          translatedText = APItranslate[0];
    }  
    }
  }
    return translatedText;
    }
   
  

  async findAllForAdmin() {
    let vocab = await this.vocRepo.find();
    return vocab;
  }

  async findAllForCurrentUser(userId: number) {
    let vocab = await this.vocRepo.find({
      where: {
        user: { id: userId }
      }
    });

    return vocab;
  }

  async findOne(WordId: number, UserId: number) {
   let vocab = await this.vocRepo.findOne({ where: { id: WordId }, relations: { user: true } });
    if (!vocab) {
      throw new NotFoundException('vocabulary with id ' + WordId + ' not found');
    }
    if (vocab.user.id !== UserId)
      throw new ForbiddenException("you can't update word that not belong to you")
    return vocab;
  }

  async update(WordId: number, dto: UpdateVocabularyDto, UserId: number) {

    let vocab = await this.vocRepo.findOne({ where: { id: WordId }, relations: { user: true } });
    if (!vocab) {
      throw new NotFoundException('vocabulary with id ' + WordId + ' not found');
    }
    console.log(vocab)
    if (vocab.user.id !== UserId)
      throw new ForbiddenException("you can't update word that not belong to you")
    let updated_vocab = vocab;
    updated_vocab.word = dto.word ?? vocab.word;
    updated_vocab.language = dto.language ?? vocab.language;
    updated_vocab.contextSentence = dto.contextSentence ?? vocab.contextSentence;
    updated_vocab.translation = dto.translation ?? vocab.translation;
    updated_vocab.timeStamp = dto.timeStamp ?? vocab.timeStamp;
    return await this.vocRepo.save(updated_vocab);
  }
  // async updateByWord(dto: UpdateVocabularyDto, UserId: number, word: string) {

  //   let vocab = await this.vocRepo.findOne({ where: {
  //     word: word,
  //     user: UserId,
  //     contextSentenceHashed: dto.contextSentenceHashed,
  //     translation: dto.translation
  //   } ,
  //     relations: { user: true } }) ;
  //   if (!vocab) {
  //     throw new NotFoundException('vocabulary with word ' + word + ' not found');
  //   }
  //   if (vocab.user.id !== UserId)
  //     throw new ForbiddenException("you can't update word that not belong to you")
  //   let updated_vocab = vocab;
  //   updated_vocab.word = dto.word ?? vocab.word;
  //   updated_vocab.language = dto.language ?? vocab.language;
  //   updated_vocab.contextSentence = dto.contextSentence ?? vocab.contextSentence;
  //   updated_vocab.translation = dto.translation ?? vocab.translation;
  //   updated_vocab.timeStamp = dto.timeStamp ?? vocab.timeStamp;
  //   return await this.vocRepo.save(updated_vocab);

  // }
  async remove(wordId: number, UserId: number) {
    let vocab = await this.vocRepo.findOne({ where: { id: wordId }, relations: { user: true } });
    if (!vocab) {
      throw new NotFoundException('vocabulary with id ' + wordId + ' not found');
    }
    if (vocab.user.id !== UserId)
      throw new ForbiddenException('you are not allowed to delete word not belong to you')
    return this.vocRepo.remove(vocab);
  }

   // for remove all the vocab from spicific video
  async removeVideoActivity(videoId:number, userId:number) {
    return await this.vocRepo.delete({user:{id:userId}, video:{id:videoId}})
  }
}
