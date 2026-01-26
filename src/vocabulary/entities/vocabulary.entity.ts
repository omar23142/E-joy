import { Video } from "src/videos/entities/video.entity";
import { Lists } from "src/lists/entities/list.entity";
import { User } from "src/users/entity/User.entity";
import { Column, Entity, ManyToOne, PrimaryGeneratedColumn, Unique } from "typeorm";

@Entity('Vocabulary')
@Unique(['word', 'translation', 'user', 'contextSentenceHashed'])
export class Vocabulary {
    @PrimaryGeneratedColumn()
    id: number;
    @Column()
    word: string;
    @Column()
    translation: string;
    @Column({ nullable: true })
    contextSentence: string;
    @Column({ default: '' })
    contextSentenceHashed: string;
    @Column({ nullable: true })
    timeStamp: number;
    @Column({ default: 'en' })
    language: string;

    @ManyToOne(() => User, (user) => user.vocabulary, { onDelete: 'CASCADE' })
    user: User;
    @ManyToOne(() => Video, (video) => video.vocabulary, { onDelete: 'CASCADE' })
    video: Video | null;
    @ManyToOne(() => Lists, (list) => list.vocabulary, { onDelete: 'CASCADE' })
    list: Lists | null;
}
