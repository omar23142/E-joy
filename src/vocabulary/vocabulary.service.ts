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
import { TranslateService } from 'src/translate/translate.service';

@Injectable()
export class VocabularyService {

  constructor(
    @InjectRepository(Vocabulary)
    private readonly vocRepo: Repository<Vocabulary>,
    private readonly listService: ListsService,
    private readonly videoService: VideosService,
    private readonly dictionaryService: DictionaryService,
    private readonly translateService:TranslateService,) { }

  async create(dto: CreateVocabularyDto, user: User) {
    const { word, contextSentence, timeStamp, language, selectedTranslate,  listId, videoDetailes, listDetailes } = dto;
   
    const sentenceToHash = contextSentence || '';
    const contextSentenceHashed = createHash('md5').update(sentenceToHash).digest('hex');

    // let sugestionTranslate:string[] | undefined = await this.translateService.translate(word, contextSentenceHashed);
    // console.log('translatreToArray', sugestionTranslate);
    

    if (!selectedTranslate || selectedTranslate.trim() === '') {
      throw new BadRequestException('Translation cannot be empty');
    }

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
        translation: selectedTranslate,
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
      translation: selectedTranslate,
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
