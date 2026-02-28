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
  ) { }

  async findByWord(word: string) {
    console.log(word);
    const first = word.charAt(0).toUpperCase();
    word = first + word.slice(1);
    console.log('toLocaleUpperCase', word);
    let result = await this.dictionaryRepo
      .createQueryBuilder('dict')
      .select('dict.ara')
      .where('dict.eng =:word', { word })
      .getMany();
    console.log('dictionary result🤷‍♂️🤷‍♂️🤷‍♂️🤷‍♂️🤷‍♂️🤷‍♂️🤷‍♂️', result)
    return result;
  }

  async saveWord(eng: string, ara: string) {
    eng = eng.charAt(0).toUpperCase() + eng.slice(1);
    try {
      const newDict = this.dictionaryRepo.create({ eng, ara });
      await this.dictionaryRepo.save(newDict);
    } catch (e) {
      // Ignore if it already exists (e.g., duplicate unique key)
      console.log(`Word already exists or error saving: ${eng}`);
    }
  }
}
