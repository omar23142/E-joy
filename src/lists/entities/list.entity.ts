import { User } from "src/users/entity/User.entity";
import { Video } from "src/videos/entities/video.entity";
import { Vocabulary } from "src/vocabulary/entities/vocabulary.entity";
import { Column, Entity, ManyToOne, OneToMany, PrimaryGeneratedColumn } from "typeorm";

@Entity('Lists')
export class Lists {
    @PrimaryGeneratedColumn()
    id: number;
    @Column()
    name: string;
    @Column()
    description: string;

    @OneToMany(() => Vocabulary, (vocabulary) => vocabulary.list)
    vocabulary: Vocabulary[];
    @ManyToOne(() => User, (user) => user.lists)
    user: User;
}
