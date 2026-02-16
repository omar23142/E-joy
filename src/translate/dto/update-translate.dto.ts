import { PartialType } from '@nestjs/swagger';
import { CreateTranslateDto } from './create-translate.dto';

export class UpdateTranslateDto extends PartialType(CreateTranslateDto) {}
