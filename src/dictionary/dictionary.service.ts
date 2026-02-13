import { Injectable } from '@nestjs/common';
import { CreateDictionaryDto } from './dto/create-dictionary.dto';
import { UpdateDictionaryDto } from './dto/update-dictionary.dto';
import { Dictionary } from './entities/dictionary.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

@Injectable()
export class DictionaryService {

  constructor(
    @InjectRepository(Dictionary)
    private readonly dictionaryRepo: Repository<Dictionary>,
  ) {}

  async findByWord(word: string) {
    word.toLocaleUpperCase()
    console.log('toLocaleUpperCase',word);
    return this.dictionaryRepo.createQueryBuilder('dict')
    .select('dict.ara')
    .where('dict.eng =:word', {word})
    .getMany();
    // .find({
      // where: { eng: word },
    //});
  }

  create(createDictionaryDto: CreateDictionaryDto) {
    return 'This action adds a new dictionary';
  }

  findAll() {
    return `This action returns all dictionary`;
  }

  findOne(id: number) {
    return `This action returns a #${id} dictionary`;
  }

  update(id: number, updateDictionaryDto: UpdateDictionaryDto) {
    return `This action updates a #${id} dictionary`;
  }

  remove(id: number) {
    return `This action removes a #${id} dictionary`;
  }
}
