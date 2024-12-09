import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
  } from 'typeorm';
  
  @Entity('msisdn_lookup')
  export class MsisdnLookup {
    @PrimaryGeneratedColumn()
    pk: number;
  
    @Column({ type: 'varchar' })
    search_parameter: string;
  
    @Column({ type: 'varchar', nullable: true })
    first_name: string;
  
    @Column({ type: 'varchar', nullable: true })
    middle_name: string;
  
    @Column({ type: 'varchar', nullable: true })
    surname: string;
  
    @Column({ type: 'varchar', nullable: true })
    gender: string;
  
    @Column({ type: 'date', nullable: true })
    date_of_birth: Date;
  
    @Column({ type: 'varchar', nullable: true })
    mobile: string;
  
    @Column({ type: 'varchar', nullable: true })
    nin: string;
  
    @CreateDateColumn({ type: 'timestamp' })
    created_date: Date;
  
    @UpdateDateColumn({ type: 'timestamp' })
    modified_date: Date;
  }
  