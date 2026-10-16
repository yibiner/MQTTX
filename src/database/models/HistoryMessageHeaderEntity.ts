import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm'

type QoS = 0 | 1 | 2

@Entity('historyMessageHeaderEntity')
export default class HistoryMessageHeaderEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ type: 'boolean' })
  retain!: boolean

  @Column({ type: 'varchar' })
  topic!: string

  @Column({ type: 'simple-enum', enum: [0, 1, 2], default: 0 })
  qos!: QoS

  // The message published with this topic (empty for legacy records or when the user disabled
  // "save message with topic").
  @Column({ type: 'varchar', nullable: true })
  payload?: string | null

  @Column({ type: 'varchar', nullable: true })
  payloadType?: string | null

  @Column({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  createAt?: string
}
