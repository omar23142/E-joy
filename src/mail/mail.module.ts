
import { Module } from "@nestjs/common";
//import { ConfigService } from "@nestjs/config";
import { MaileConfig } from '../config/MailConfig'
import { MailerModule } from "@nestjs-modules/mailer";
import { EjsAdapter } from "@nestjs-modules/mailer/dist/adapters/ejs.adapter";
import SMTPTransport from "nodemailer/lib/smtp-transport";
import { MailService } from "./mail.service";
import { join } from "path";

@Module({
    imports: [MailerModule.forRootAsync({
        inject: [MaileConfig],
        useFactory: (config: MaileConfig) => {
            // const host = config.get<string>('SMTP_HOST');
            // const portt =  config.get<number>('SMTP_PORT');
            // console.log(host,portt)
            if (process.env.NODE_ENV === 'development' || 'test') {
                return {
                    transport: {
                        // host:config.get<string>('SMTP_HOST'),
                        // port:config.get<number>('SMTP_PORT'),
                        host: config.SMTP_HOST,
                        port: config.SMTP_PORT,
                        secure: false,
                        auth: {
                            user: config.SMTP_USERNAME,
                            pass: config.SMTP_PASSWORD
                        }
                    } as SMTPTransport.Options,
                    template: {
                        dir: join(__dirname, 'template'),
                        adapter: new EjsAdapter(),

                    }
                }
            } else {
                return {

                    transport: {
                        service: 'SendGrid',
                        auth: {
                            //   user: config.get('SENDGRID_USERNAME'),
                            //   pass: config.get('SENDGRID_PASSWORD'),
                            user: config.SENDGRID_USERNAME,
                            pass: config.SENDGRID_PASSWORD,
                        },
                    }
                }
            }
        }
    },
    )],
    exports: [MailService],
    controllers: [],
    providers: [MailService]
})

export class MailModule {

}
