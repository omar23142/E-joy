import { BadRequestException, ConflictException, forwardRef, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { CreateListDto } from './dto/create-list.dto';
import { UpdateListDto } from './dto/update-list.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Lists } from './entities/list.entity';
import { Repository } from 'typeorm';
import { User } from 'src/users/entity/User.entity';
import { VocabularyService } from 'src/vocabulary/vocabulary.service';
import { Vocabulary } from 'src/vocabulary/entities/vocabulary.entity';
import { AddWordToListDto } from './dto/AddWordToList.Dto';

@Injectable()
export class ListsService {
  constructor(
    @InjectRepository(Lists)
    private readonly listRepo: Repository<Lists>,
    @InjectRepository(Vocabulary)
    private readonly vocabRibo: Repository<Vocabulary>,
    @Inject(forwardRef(() => VocabularyService))
    private readonly vocabService: VocabularyService,
  ) { }
  async create(dto: CreateListDto, user: User) {
    const { name, description } = dto;

    // check if this list already exist for thsi user
    const existList = await this.listRepo.findOne({
      where: {
        name: name,
        user: { id: user.id }
      }
    })
    if (existList)
      throw new ConflictException(`this list with this name: ${name} is already exist for this user`)

    let newList = this.listRepo.create({
      name: name,
      description: description,
      user: user
    });
    return this.listRepo.save(newList);
  }


  async findAllForCurrentUser(user: User) {
    let lists = await this.listRepo.find({
      where:
      {
        user: { id: user.id }
      }
    })
    return lists;
  }

  async findAllForAdmin() {
    let lists = await this.listRepo.find()
    console.log('in findforadmin')
    return lists;
  }

  async findOne(listId: number, user: User) {
    let list = await this.listRepo.findOne({
      where:
      {
        user: { id: user.id },
        id: listId
      }
    })
    if (!list)
      throw new NotFoundException('there is no list with this id :' + listId)
    return list;
  }

  async update(listId: number, dto: UpdateListDto, user: User) {
    let list = await this.findOne(listId, user)
    const { name, description } = dto;
    let updated_list = list;
    updated_list.name = dto.name ?? list.name;
    updated_list.description = dto.description ?? list.description;
    await this.listRepo.save(updated_list);
    return updated_list;
  }

  async remove(listId: number, user: User) {
    let list = await this.findOne(listId, user);
    return await this.listRepo.remove(list);;
  }

  public async AddWordToList(dto:AddWordToListDto,listId:number, user:User) {
    const existList:Lists | null = await this.findOne(listId, user);
    const existVocab:Vocabulary | null =  await this.vocabService.findOne(dto.vocabId, user.id);
    if (existList && existVocab ) {
        if(existVocab.list === null) {
          existVocab.list = existList;
          return this.vocabRibo.save(existVocab)
        }
        else  {
          const newVocab = this.vocabRibo.create({
          word: existVocab.word,
          translation: existVocab.translation,
          contextSentence: existVocab.contextSentence,
          contextSentenceHashed: existVocab.contextSentenceHashed,
          timeStamp: existVocab.timeStamp,
          language: existVocab.language,
          user: user,
          list: existList,
          video: existVocab.video,
        });
          console.log('yyyyyyyy', newVocab)
           return this.vocabRibo.save(newVocab);
        }
          
    }
   
    
  }

  public async RemoveWordFromList(listId:number, vocabId:number, user:User) {
    const existList:Lists | null = await this.findOne(listId, user);
    if (!existList)
      throw new BadRequestException('there is no list with this id to remove word from it ')
    const existVocab:Vocabulary | null =  await this.vocabService.findOne(vocabId, user.id);
    if (!existVocab)
      throw new BadRequestException('there is no word with this id to remove it from list')
     if (existList && existVocab) {
      existVocab.list = null;
    }
    return this.vocabRibo.save(existVocab);
    
  }

  public async IsListExist(ListId: number) {
    const list = await this.listRepo.findOne(
      {
        where: { id: ListId },
        select: ['id']
      });
    if (!list)
      throw new NotFoundException('this list is no longer exist')
    return list;
  }
}
