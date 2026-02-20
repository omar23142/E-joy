import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { CreateTranslateDto } from './dto/create-translate.dto';
import { UpdateTranslateDto } from './dto/update-translate.dto';
import { VocabularyService } from 'src/vocabulary/vocabulary.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Vocabulary } from 'src/vocabulary/entities/vocabulary.entity';
import { Repository } from 'typeorm';
import { Dictionary } from 'src/dictionary/entities/dictionary.entity';
import { DictionaryService } from 'src/dictionary/dictionary.service';
import { SubscriptionLoggable } from 'rxjs/internal/testing/SubscriptionLoggable';

@Injectable()
export class TranslateService {
  constructor(
    @InjectRepository(Vocabulary)
    private readonly vocabRepo: Repository<Vocabulary>,
    private readonly dictionaryService: DictionaryService
  ) { }

  //   public async fastTranslate(word:string, contextSentenceHashed:string, ) {
  //     let APItranslate:string[], translatedText:string | undefined= undefined, existTranslateWithoutCont:string[] | null = null,dictionaryTranslate:any[]| null= null;
  //     let sugestionTranslate:string[];
  //     let existTranslate = await this.translateWithContext(word, contextSentenceHashed);
  //   // if there translate with context
  //   if (existTranslate.length !== 0){
  //   console.log('ddddkkk', existTranslate[0].translation)
  //   console.log('with contexttttttttt', existTranslate)
  //   translatedText =  existTranslate[0].translation
  //   }
  //   // if there no translate with context
  //   else  {
  //     existTranslateWithoutCont= await this.translateWithOutContext(word);
  //     // if there translate without context
  //      if(existTranslateWithoutCont.length > 0)
  //       {
  //     console.log('without context', existTranslateWithoutCont)
  //     translatedText = existTranslateWithoutCont[0];
  //     // if no translate without context use dictionary
  //   } else {
  //     dictionaryTranslate = await this.dictionaryService.findByWord(word);

  //      if (dictionaryTranslate.length > 0){
  //       console.log('dictionaryyyyyy',dictionaryTranslate)
  //       translatedText = dictionaryTranslate[0].ara} 
  //       // if no translate in the dictionary use Api
  //       else {
  //         APItranslate = await this.translateByAPI(word);
  //         console.log('Api translate', APItranslate);
  //         translatedText = APItranslate[0];
  //   }  
  //   }
  // }
  //   return translatedText;
  //   }

  public async translate(word: string, contextSentence: string = '') {
    let APItranslate: string[];
    let sugestionTranslate: string[] = [];

    // Hash the context sentence to match database records
    const contextSentenceHashed = createHash('md5').update(contextSentence || '').digest('hex');
    console.log('contextSentenceHashed', contextSentenceHashed)

    let contextTranPromise = this.translateWithContext(word, contextSentenceHashed);
    let freqTranslatePromise = this.translateWithOutContext(word);
    let dictionaryTranslatePromise = this.dictionaryService.findByWord(word);
    let results = await Promise.all([contextTranPromise, freqTranslatePromise, dictionaryTranslatePromise]);
    // console.log('context', results[1][0]?.translation)
    // console.log('freq1', results[1][0]?.translation)
    // console.log('freq2', results[1][1]?.translation)
    // console.log('dict', results[2][0]?.ara);
    // console.log('freq', results[1])
    let contextTranArray: Vocabulary[] = results[0];
    let mostFrequnceArray: any[] = results[1];
    let dictTranArray: Dictionary[] = results[2];
    contextTranArray.forEach(item => {
      sugestionTranslate.push(item.translation);
    })
    mostFrequnceArray.forEach(item => {
      sugestionTranslate.push(item.translation);
    })
    dictTranArray.forEach(item => {
      sugestionTranslate.push(item.ara);
    })
    console.log('sugestionTranslate', sugestionTranslate)
    // let contextTran: string = results[0][0]?.translation;
    // let mostFrequnce = results[1][0]?.translation;
    // let secondFrequnce = results[1][1]?.translation;
    // let dictTran: string = results[2][0]?.ara;
    // if (contextTran)
    //   sugestionTranslate.push(contextTran);
    // if (mostFrequnce)
    //   sugestionTranslate.push(mostFrequnce);
    // if (secondFrequnce)
    //   sugestionTranslate.push(secondFrequnce);
    // if (dictTran)
    //   sugestionTranslate.push(dictTran);
    let sugestionTranslateSet = new Set(sugestionTranslate);
    console.log('setttt', sugestionTranslateSet)
    if (Array.from(sugestionTranslateSet).length <= 3) {
      APItranslate = await this.translateByAPI(word);
      console.log('in the apitranslate', APItranslate);
      sugestionTranslate = [...sugestionTranslate, ...APItranslate];
      console.log('after merg', sugestionTranslate)
      sugestionTranslateSet = new Set(sugestionTranslate);
      console.log('final setttt', sugestionTranslateSet);
    }

    let result: string[] = Array.from(sugestionTranslateSet)
    sugestionTranslate = result.map(item => { return item.split(/[,;:]+/) }).flat()
    // console.log('resultsplit', sugestionTranslate)


    console.log(' before return', sugestionTranslate);
    return sugestionTranslate;
  }

  public async translateWithContext(word: string, contextSentenceHashed: string) {
    console.log('in the withContext')
    return await this.vocabRepo.createQueryBuilder("vocab")
      .select('vocab.translation')
      //.from(Vocabulary, "translation")
      .where("vocab.word =:word", { word: word })
      .andWhere("vocab.contextSentenceHashed =:contextSentenceHashed", { contextSentenceHashed })
      .limit(5)
      //.orderBy('created_at', 'ASC')
      .getMany();
  }

  public async translateWithOutContext(word: String) {
    return await this.vocabRepo.createQueryBuilder('vocab')
      .select('vocab.translation', 'translation')
      .addSelect('COUNT(*)', 'freq')
      .where("vocab.word =:word", { word })
      .groupBy('vocab.translation')
      .orderBy('freq', 'DESC')
      .limit(10)
      .getRawMany()
  }

  public async translateByAPI(word: string) {
    const res = await fetch(`https://api.mymemory.translated.net/get?q=${word}&langpair=en|ar`);
    const data = await res.json();
    const translatedText = data.responseData.translatedText;
    console.log('split2', translatedText)
    let probletTranslate: string[] = []
    let i: number = 0;
    for (i; i < data.matches.length; i++) {
      // console.log('data', data.matches[i].translation)
      probletTranslate.push(data.matches[i].translation)
    }
    return probletTranslate;
  }
}
