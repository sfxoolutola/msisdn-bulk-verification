import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import axios from 'axios';
import { MsisdnBulkVerifications } from 'src/entities/msisdn_bulk_verifications';
import { MsisdnLookup } from 'src/entities/msisdn_lookup';
import { MsisdnRecords } from 'src/entities/msisdn_records';
import { Not, Repository } from 'typeorm';
import { IBody, IBulkVerificationDetails, IBulkVerificationUpdate, IInvocationUpdate, IProcessBulk, IRequestBody } from './process-msisdn.dto';

@Injectable()
export class ProcessMsisdnService {
    constructor(
        @InjectRepository(MsisdnBulkVerifications)
        private readonly msisdnBulkRepository: Repository<MsisdnBulkVerifications>,
        @InjectRepository(MsisdnRecords)
        private readonly msisdnRecordsRepository: Repository<MsisdnRecords>,
        @InjectRepository(MsisdnLookup)
        private readonly msisdnLookupRepository: Repository<MsisdnLookup>,
      ) {}
    
      delay = async (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

      async initiateBulkRecordProcessing(body: IBody) {
        console.log(`Bulk request for ${body.bulkFk} started`);
        try {
            const bulkDetails = await this.msisdnBulkRepository.query(`
                select * from msisdn_bulk_verifications mbv 
                where pk = ${body.bulkFk}`
            );
              
              if (!bulkDetails[0]) {
                console.log(`Bulk with id ${body.bulkFk} not found`);
                return {
                    code: 0,
                    success: false,
                    message: `Bulk with id ${body.bulkFk} not found`,
                  };
              }
        
              if (bulkDetails[0].status?.toUpperCase() === 'COMPLETED') {
                Logger.log(`Process already completed for bulk fk ${body.bulkFk}`);
                return {
                    code: 0,
                    success: false,
                    message: `Process already completed for bulk fk ${body.bulkFk}`,
                  };
              }
        
              await this.msisdnBulkRepository.update(
                { pk: Number(body.bulkFk) },
                { status: 'IN-PROGRESS' },
              );
              console.log('Processing bulk record ID: ' + body.bulkFk);
              const payload = {
                bulkId: Number(body.bulkFk),
                mode: bulkDetails[0].service_mode,
              }
              this.processBulkRequest(payload)
              return {
                code: 0,
                success: true,
                message: `Request received successfully ${body.bulkFk} and in progress`,
              }
        } catch (error) {
            return {
                code: -1,
                success: false,
                message: error.message || 'Internal Server Error',
              }
        }
    }
    
      async processBulkRequest(body: IProcessBulk) {
    
        try {
          console.log('Processing bulk record ID: ' + body.bulkId);
    
          let isThereStilUnprocessedData = await this.isThereStillUnprocessedData(
            body.bulkId,
          );
    
          while (isThereStilUnprocessedData) {
            // Default to 500 if not set
            const batchSize = process.env.BATCH_SIZE
              ? parseInt(process.env.BATCH_SIZE, 10)
              : 500;
    
            // Select pending invocations with row locking and skip locked
            let invocationDetails = await this.getUnprocessedRecordsByBatch(
              body,
              batchSize,
            );
    
            const apiRequests: IRequestBody[] = invocationDetails?.map((invocationRecord: IInvocationUpdate) => ({
              uin: invocationRecord.search_parameter,
              invocationId: invocationRecord.pk,
            }));
    
            await Promise.allSettled(
              apiRequests.map(async request => {
                try {
                  await this.processBulkRecord(request, body.mode);
                } catch (error) {
                  console.error(
                    `Failed processing UIN ${request.uin} with invocation ID ${request.invocationId}`,
                    error,
                  );
                }
              }),
            );
            await this.delay(Number(process.env.DELAY_TIMEOUT))
            
            isThereStilUnprocessedData = await this.isThereStillUnprocessedData(
              body.bulkId,
            );
          }
          if (!isThereStilUnprocessedData) {
            console.log(`Finished processing bulk with id ${body.bulkId}`);
            await this.completeVerification(body.bulkId, body.mode);
            return;
          }
        } catch (error) {
          console.log(error.message);
        }
      }
    
      async isThereStillUnprocessedData(pk: number): Promise<boolean> {
        const total = await this.msisdnRecordsRepository.query(
          `SELECT COUNT(*) FROM msisdn_records WHERE bulk_fk = $1 AND (job_status IS NULL OR job_status = 'PENDING')`,
          [pk],
        );
    
        const totalInvocations = parseInt(total[0].count, 10);
    
        const result = !!totalInvocations;
        return result;
      }
    
      async getUnprocessedRecordsByBatch(body: IProcessBulk, batchSize: number) {
        const query = `SELECT pk, search_parameter
                FROM msisdn_records 
                WHERE (job_status IS NULL OR job_status = 'PENDING') 
                AND bulk_fk = $1
                ORDER BY created_date ASC
                LIMIT $2
                FOR UPDATE SKIP LOCKED`;
    
        let invocationDetails = await this.msisdnRecordsRepository.query(query, [
          body.bulkId,
          batchSize,
        ]);
    
        const invocationPks = invocationDetails.map(row => row.pk);
    
        const qUpdateInvocationsStatus = `UPDATE msisdn_records
                                                  SET job_status = 'IN_PROGRESS'
                                                  WHERE pk = ANY($1::int[])`;
        await this.msisdnRecordsRepository.query(qUpdateInvocationsStatus, [
          invocationPks,
        ]);
        // console.log(invocationDetails);
        return invocationDetails;
      }
    
      async processBulkRecord(record: IRequestBody, mode: string) {
        const { uin, invocationId } = record;
    
        // Check lookup table
        const lookupID = await this.findInLookupTable(uin);
        if (lookupID) {
          console.log(`UIN ${uin} found in lookup table. Skipping API call.`);
    
          // Hardcoded statuses for records found in the lookup
          await this.updateInvocationTable(
            invocationId,
            'COMPLETED', // job_status
            'SUCCESSFUL', // transaction_status
            'SEARCH_FROM_DB', // retrieval_mode
            'VERIFIED', // status
          );
          return;
        }
    
        // If not found, make API call
        console.log(`UIN ${uin} not found. Proceeding with API call.`);
        try {
            let response;
            if (mode.toLowerCase() === 'live') {
                response = await this.callThirdPartyAPI({ uin });
            } else {
                response = await this.mockResult()
            }
            
            if(!response) {
                await this.updateInvocationTable(
                    invocationId,
                    'COMPLETED', // job_status
                    'FAILED', // transaction_status
                    'THIRD_PARTY', // retrieval_mode
                    'FAILED', // status
                    'FAILED', // failure_reason
                  );
                return;
            } else if (response && response.data) {
            console.log(
              `API call successful for UIN ${uin}: ${JSON.stringify(response.data)}`,
            );
    
            // Define the query for inserting or updating the lookup table
            const updateLookupTableQuery = `
              INSERT INTO msisdn_lookup (
                "search_parameter", "first_name", "middle_name", "surname", "gender", "mobile", "date_of_birth", "nin"
              )
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
              ON CONFLICT ("search_parameter") DO UPDATE
              SET "first_name" = EXCLUDED."first_name",
                  "middle_name" = EXCLUDED."middle_name",
                  "surname" = EXCLUDED."surname",
                  "gender" = EXCLUDED."gender",
                  "mobile" = EXCLUDED."mobile",
                  "date_of_birth" = EXCLUDED."date_of_birth",
                  "nin" = EXCLUDED."nin";
            `;
    
            // Insert or update the lookup table with the API response data
            await this.msisdnLookupRepository.query(updateLookupTableQuery, [
              uin,
              response.data.fn, // Assuming the API response has 'fn' for first name
              response.data.mn, // Assuming the API response has 'mn' for middle name
              response.data.sn, // Assuming the API response has 'sn' for last name
              response.data.g, // Assuming the API response has 'g' for gender
              response.data.main, // Assuming the API response has 'main' for mobile number
              response.data.icao, // Assuming the API response has 'icao' for date of birth
              response.data.nin, // Assuming the API response has 'nin' for NIN
            ]);
    
            // Update the invocation table with success details
            await this.updateInvocationTable(
              invocationId,
              'COMPLETED', // job_status
              'SUCCESSFUL', // transaction_status
              'THIRD_PARTY', // retrieval_mode
              'VERIFIED', // status
            );
    
            return;
          } else {
            console.log(
              `API response for UIN ${uin} is missing data. Treating as failure.`,
            );
    
            // Update the invocation table with failure details
            await this.updateInvocationTable(
              invocationId,
              'COMPLETED', // job_status
              'SUCCESSFUL', // transaction_status
              'THIRD_PARTY', // retrieval_mode
              'NOT VERIFIED', // status
              response.message || 'Record not available',
            );
          }
        } catch (error) {
          console.log(
            `Failed processing UIN ${uin} with invocation ID ${invocationId}: error: ${error.message}`,
          );
    
          // Handling failures
          await this.updateInvocationTable(
            invocationId,
            'COMPLETED', // job_status
            'SUCCESSFUL', // transaction_status
            'THIRD_PARTY', // retrieval_mode
            'NOT VERIFIED', // status
            error.message, // failure_reason
          );
        }
      }
    
      async findInLookupTable(uin: string) {
        const checkUinQuery = `SELECT search_parameter FROM msisdn_lookup WHERE search_parameter = $1 LIMIT 1`;
        const result = await this.msisdnLookupRepository.query(checkUinQuery, [uin]);
        return result.length > 0 ? result[0].search_parameter : null;
      }
    
      async updateInvocationTable(
        invocationId: string,
        jobStatus: string,
        transactionStatus: string,
        retrievalMode: string,
        status: string,
        extraData = null,
      ) {
        const updateQuery = `
          UPDATE msisdn_records
          SET job_status = $1,
          transaction_status = $3,
          status = $2,
              retrieval_mode = $4,
              failure_reason = $5,
              modified_date = $7
          WHERE pk = $6
        `;
        try {
          await this.msisdnRecordsRepository.query(updateQuery, [
            jobStatus,
            status,
            transactionStatus,
            retrievalMode,
            extraData,
            invocationId,
            new Date()
          ]);
        } catch (error) {
          console.log('Error updating invocation table:', error);
        }
      }
    
      async callThirdPartyAPI(requestJsonRequest: { uin: string }) {
        try {
          const apiKey = process.env.COMMON_IDENTITY_API_KEY;
          console.log(`Using API Key: ${apiKey}`);
    
          const response = await axios.post(
            process.env.COMMON_IDENTITY_BASE_URL + '/record/msisdnLookupDPS',
            requestJsonRequest,
            {
              headers: {
                'Content-Type': 'application/json',
                'api-key': apiKey,
              },
            },
          );
          return response.data;
        } catch (err) {
          console.log(`API call error: ${err.response?.data} OR ${err.message}`);
        }
      }

      async completeVerification(bulkId: number, mode: string) {
        try {
          const incompleteCount = await this.msisdnRecordsRepository.count({
            where: { bulkFk: { bulk_id: bulkId.toString() }, job_status: Not('COMPLETED') },
          });
    
          if (incompleteCount === 0) {
            // All records have been completed, update bulk verification table
            const currentDate = new Date();
            const bulkVerificationUpdate: IBulkVerificationUpdate = {
              status: 'COMPLETED',
              completion_date: currentDate.toISOString(),
              modified_date: currentDate.toISOString(),
              expiry_date: new Date(
                currentDate.getTime() + 2 * 24 * 60 * 60 * 1000,
              ).toISOString(),
            };
    
            await this.msisdnBulkRepository.update(
              { pk: bulkId },
              bulkVerificationUpdate,
            );
    
            const bulkDetails = await this.msisdnBulkRepository.query(`
                select * from msisdn_bulk_verifications mbv 
                where pk = ${bulkId}`
            );
    
            if (mode === 'live') {
              // send email endpoint
              await this.sendEmail(`${bulkId}`);
            }
            if (bulkDetails[0]) {
                console.log(`Generating report for bulk with id ${bulkId}`);
                await this.generateReportAndUploadToS3(bulkDetails[0]);
            }
          }
    
          return incompleteCount;
        } catch (error) {
          console.error(error);
        }
      }
    
      async sendEmail(bulkId: string) {
        const payload = {
          bulkId,
        };
    
        const headersRequest = {
          Accept: 'application/json',
        };
    
        const url = `${process.env.NODE_SERVICE}/bulk-verification/bulk-notification-mail`;
    
        await axios.post(url, payload, {
          headers: headersRequest,
        });
      }
    
      async generateReportAndUploadToS3(body: IBulkVerificationDetails) {
        const payload = {
          wrapperFk: body.wrapperFk,
          pk: body.pk,
          filename: body.file_name,
        };
    
        const headersRequest = {
          Accept: 'application/json',
        };
    
        const url = `${process.env.NODE_SERVICE}/bulk-verification/upload-bulk-job-result`;
    
        await axios.post(url, payload, {
          headers: headersRequest,
        });
      }
    
      successResponse = {
        success: true,
        data: {
          fn: "OKEOGHENE",
          mn: "PUREHEART",
          sn: "GHARORO",
          g: "M",
          n: "NGA",
          main: "2348144618246",
          icao: "15 JUN 1970",
          nin: "12345678901"
        }
      };
    
      
      failureResponse = {
        success: false,
        message: "Record not available"
      };
    
      noResponse = undefined;
      
      mockResult = async (): Promise<any> => {
        const randomNumber = Math.random()
        const randomResponse = randomNumber > 0.9 ? this.noResponse : randomNumber > 0.5 ? this.successResponse : this.failureResponse;
      
        const delay = Math.floor(Math.random() * (100 - 10 + 1)) + 10; // Random delay between 10ms and 100ms
      
        // Return the response after the delay
        await new Promise((resolve) => setTimeout(resolve, delay));
      
        return randomResponse;
      };
}
