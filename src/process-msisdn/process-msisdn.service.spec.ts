import { Test, TestingModule } from '@nestjs/testing';
import { ProcessMsisdnService } from './process-msisdn.service';

describe('ProcessMsisdnService', () => {
  let service: ProcessMsisdnService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ProcessMsisdnService],
    }).compile();

    service = module.get<ProcessMsisdnService>(ProcessMsisdnService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
