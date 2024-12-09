import { Body, Controller, Post, Response } from '@nestjs/common';
import { Response as ExpressResponse} from 'express'
import { IBody } from './process-msisdn.dto';
import { ProcessMsisdnService } from './process-msisdn.service';

@Controller('start')
export class ProcessMsisdnController {
    constructor(private readonly processMsisdnService: ProcessMsisdnService) {}
    @Post()
    async processMsisdn(@Body() body: IBody, @Response() res: ExpressResponse) {
        const response = await this.processMsisdnService.initiateBulkRecordProcessing(body)
        if (response?.code === 0) {
            res.status(200).json({ ...response })
        } else {
            res.status(500).json({ ...response })
        }
    }
}
