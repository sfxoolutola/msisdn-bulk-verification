import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    ManyToOne,
    JoinColumn,
  } from 'typeorm';
import { MsisdnBulkVerifications } from './msisdn_bulk_verifications';
  
  @Entity('msisdn_records')
  export class MsisdnRecords {
    @PrimaryGeneratedColumn()
    pk: number;
  
    @CreateDateColumn({ type: 'timestamp' })
    created_date: Date;
  
    @UpdateDateColumn({ type: 'timestamp' })
    modified_date: Date;
  
    @Column({
      type: 'enum',
      enum: ['VERIFIED', 'NOT_VERIFIED', 'FAILED'],
      nullable: true,
    })
    status: string;
  
    @Column({ type: 'varchar', nullable: true })
    failure_reason: string;
  
    @Column({
      type: 'enum',
      enum: ['SUCCESSFUL', 'FAILED'],
      nullable: true,
    })
    transaction_status: string;
  
    @ManyToOne(() => MsisdnBulkVerifications, (bulk) => bulk.records)
    @JoinColumn([{ name: 'bulk_fk', referencedColumnName: 'pk' }])
    bulkFk: MsisdnBulkVerifications;
  
    @Column({ type: 'varchar' })
    search_parameter: string;
  
    @Column({ type: 'varchar' })
    retrieval_mode: string;
  
    @Column({
      type: 'enum',
      enum: ['PENDING', 'IN_PROGRESS', 'COMPLETED'],
    })
    job_status: string;
  }
  