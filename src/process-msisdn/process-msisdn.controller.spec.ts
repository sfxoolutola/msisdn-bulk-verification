import { Test, TestingModule } from '@nestjs/testing';
import { ProcessMsisdnController } from './process-msisdn.controller';

describe('ProcessMsisdnController', () => {
  let controller: ProcessMsisdnController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProcessMsisdnController],
    }).compile();

    controller = module.get<ProcessMsisdnController>(ProcessMsisdnController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
