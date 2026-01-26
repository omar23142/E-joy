import { Authconfig } from './config/AuthClass';
import { Injectable } from '@nestjs/common';
const NLPCloudClient = require('nlpcloud');

@Injectable()
export class AppService {
  constructor(private readonly config: Authconfig) { }
  getHello(): string {
    console.log(process.env.NODE_ENV)
    console.log(this.config.jwt_secret_key)
    // const res = await fetch("https://libretranslate.com/translate", {
    //   method: "POST",
    //   body: JSON.stringify({
    //     q: "Hello!",
    //     source: "en",
    //     target: "ar",
    //     //api_key: "xxxxxx" // can be optional with self-hosting
    //   }),
    //   headers: { "Content-Type": "application/json" },
    // });

    // console.log(await res.json());


    //     const fetch = require("node-fetch");
    //     const url = require("url");

    //     const params = new url.URLSearchParams();
    //     params.append("to", "es");
    //     params.append("to", "de");
    //     params.append("from", "en");
    //     params.append(
    //       "texts",
    //       `"Just try it mate. "
    //   "What are you waiting for?
    // `
    //     );
    //     params.append(
    //       "texts",
    //       `“Never memorize something that you can look up.”
    // ― Albert Einstein
    // `
    //     );

    //     const options = {
    //       method: "POST",
    //       headers: {
    //         "content-type": "application/x-www-form-urlencoded",
    //         "x-rapidapi-host": "lecto-translation.p.rapidapi.com",
    //         "x-rapidapi-key": process.env.RAPIDAPI_API_KEY,
    //       },
    //       body: params,
    //     };

    //     fetch("https://lecto-translation.p.rapidapi.com/v1/translate/text", options)
    //       .then((response) => response.json())
    //       .then((json) => console.log(JSON.stringify(json)))
    //       .catch(function (error) {
    //         console.error('error', error);
    //       });

    //     /*
    //     Output:

    //     {
    //       "translations": [
    //         {
    //           "to": "es",
    //           "translated": [
    //             "\"Pruébalo, amigo.\"\n  \"¿Que estas esperando?",
    //             "\"Nunca memorices algo que puedas buscar\".\n- Albert Einstein"
    //           ]
    //         },
    //         {
    //           "to": "de",
    //           "translated": [
    //             "\"Versuch es einfach, Kumpel.\"\n  \"Worauf wartest du?",
    //             "„Merke nie etwas aus, was du nachschlagen kannst.“\n- Albert Einstein"
    //           ]
    //         }
    //       ],
    //       "from": "en",
    //       "translated_characters": 234
    //     }
    //     */
    const NLPCloudClient = require('nlpcloud');
    console.log(process.env.NLPCLOUD_API_KEY);

    const client = new NLPCloudClient({ model: 'nllb-200-3-3b', token: process.env.NLPCLOUD_API_KEY })
    // Returns an Axios promise with the results.
    // In case of success, results are contained in `response.data`. 
    // In case of failure, you can retrieve the status code in `err.response.status` 
    // and the error message in `err.response.data.detail`.
    client.translation({
      text: `John Doe has been working for Microsoft in Seattle since 1999.`
      , source: 'eng_Latn', target: 'arb_Arab'
    }).then(function (response) {
      console.log(response.data);
    })
      .catch(function (err) {
        console.error(err.response.status);
        console.error(err.response.data.detail);
      });
    return 'Hello World!';
  }
}
