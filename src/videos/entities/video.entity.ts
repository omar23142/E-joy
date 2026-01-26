import { Lists } from "src/lists/entities/list.entity";
import { User } from "src/users/entity/User.entity";
import { Vocabulary } from "src/vocabulary/entities/vocabulary.entity";
import { Column, Entity, ManyToOne, OneToMany, PrimaryGeneratedColumn } from "typeorm";


@Entity('Videos')
export class Video {
    @PrimaryGeneratedColumn()
    id: number;
    @Column()
    title: string;
    @Column()
    url: string;
    @Column()
    platform: string;

    // @ManyToOne(() => User, (user) => user.videos, { onDelete: 'CASCADE' })
    // user: User

    @OneToMany(() => Vocabulary, (vocabulary) => vocabulary.video)
    vocabulary: Vocabulary[];

}
