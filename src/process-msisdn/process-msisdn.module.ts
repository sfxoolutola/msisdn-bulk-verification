import { Module } from '@nestjs/common';
import { ProcessMsisdnController } from './process-msisdn.controller';
import { ProcessMsisdnService } from './process-msisdn.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MsisdnBulkVerifications } from 'src/entities/msisdn_bulk_verifications';
import { MsisdnLookup } from 'src/entities/msisdn_lookup';
import { MsisdnRecords } from 'src/entities/msisdn_records';

@Module({
  imports: [TypeOrmModule.forFeature([
    MsisdnBulkVerifications,
    MsisdnLookup,
    MsisdnRecords
  ])],
  controllers: [ProcessMsisdnController],
  providers: [ProcessMsisdnService]
})
export class ProcessMsisdnModule {}
