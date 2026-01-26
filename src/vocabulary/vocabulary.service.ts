import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import fetch from 'node-fetch';
import { CreateVocabularyDto } from './dto/create-vocabulary.dto';
import { UpdateVocabularyDto } from './dto/update-vocabulary.dto';
import { Repository } from 'typeorm';
import { Vocabulary } from './entities/vocabulary.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from 'src/users/entity/User.entity';
import { ListsService } from 'src/lists/lists.service';
import { VideosService } from 'src/videos/videos.service'
import { createHash } from 'crypto';

@Injectable()
export class VocabularyService {

  constructor(
    @InjectRepository(Vocabulary)
    private readonly vocRepo: Repository<Vocabulary>,
    private readonly listService: ListsService,
    private readonly videoService: VideosService) { }
  async create(dto: CreateVocabularyDto, user: User) {
    const { word, contextSentence, timeStamp, language, listId, videoId } = dto;

    const res = await fetch(`https://api.mymemory.translated.net/get?q=${word}&langpair=en|ar`);

    const data = await res.json();
    const translatedText = data.responseData.translatedText;
    const sentenceToHash = contextSentence || '';
    const contextSentenceHashed = createHash('md5').update(sentenceToHash).digest('hex');
    const newVocab = this.vocRepo.create({
      word,
      contextSentence,
      timeStamp,
      translation: translatedText,
      contextSentenceHashed: contextSentenceHashed,
      language: language,
      user: { id: user.id },
      list: listId ? { id: listId } : null,
      video: videoId ? { id: videoId } : null
    });

    //check if list and video exist before saving
    if (listId)
      await this.listService.IsListExist(listId)
    if (videoId)
      await this.videoService.IsVideoExist(videoId)
    //check if the word - translation already exist for this user
    const existVocab = await this.vocRepo.findOne({
      where: {
        user: { id: user.id },
        word: word,
        translation: translatedText,
        contextSentenceHashed: contextSentenceHashed
      }
    })
    if (existVocab)
      throw new ConflictException('vocabulary already exist with same translate and context sentence')
    return await this.vocRepo.save(newVocab);
  }

  async findAllForAdmin() {
    let vocab = await this.vocRepo.find();

    return vocab;
  }

  async findAllForCurrentUser(userId: number) {
    let vocab = await this.vocRepo.find({ where: { id: userId } });

    return vocab;
  }

  async findOne(id: number) {
    let vocab = await this.vocRepo.findOneBy({ id });
    if (!vocab) {
      throw new NotFoundException('vocabulary with id ' + id + ' not found');
    }
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
}
