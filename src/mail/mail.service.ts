
import { Injectable, RequestTimeoutException } from "@nestjs/common"
import { User } from '../users/entity/User.entity';
import { MailerService } from "@nestjs-modules/mailer";


@Injectable()
export class MailService {
  constructor(
    private readonly mailerService: MailerService,
  ) { }

  private async send(
    user: User,
    template: string,
    subject: string,
    url?: string,
  ) {
    console.log('helow from send ')
    try {
      const firstName = user.userName.split(' ')[0];
      console.log(firstName)
      await this.mailerService.sendMail({
        to: user.email,
        from: `suportTeam@mail.com`,
        subject,
        template: template,
        context: {
          subject,
          firstname: firstName,
          url,
        },
      });
    } catch (err) {
      console.log(err)
      throw new RequestTimeoutException('there is a problem happen when sending email to you');
    }
  }

  public async sendWelcome(user: User, url?: string) {
    await this.send(
      user,
      'welcome',
      'WELCOME TO OUR FAMILY !!',
      url,
    );
  }

  public async sendResetPassword(user: User, resetUrl: string) {
    await this.send(
      user,
      'resetPass',
      'Your password reset token is valid for 10 min',
      resetUrl,
    );
  }
  public async sendValidationEmail(user: User, validationTokenUrl: string) {
    console.log('helow from send validate')
    await this.send(
      user,
      'validation',
      ' EMAIL VALIDATION ',
      validationTokenUrl,
    )
  }
}