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
    console.log(word)
    let first = word.charAt(0).toUpperCase();
    word = first + word.slice(1)
    console.log('toLocaleUpperCase',word);
    return this.dictionaryRepo.createQueryBuilder('dict')
    .select('dict.ara')
    .where('dict.eng =:word', {word})
    .getMany();
    // .find({
      // where: { eng: word },
    //});
  }

 
}
