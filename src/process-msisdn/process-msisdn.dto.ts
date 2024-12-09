export interface IBody {
    bulkFk: string
}

export interface IBulkVerificationUpdate {
    status: string;
    completion_date: string;
    expiry_date: string;
    modified_date: string;
  }

  export interface IBulkVerificationDetails {
    status: string;
    completion_date: string;
    expiry_date: string;
    file_name: string;
    wrapperFk: string;
    pk: string;
  }

export interface IProcessBulk {
    bulkId: number;
    mode: string;
}

export interface IRequestBody {
    uin: string;
    invocationId: string
}

export interface IInvocationUpdate {
    invocationId: string;
    status: string;
    job_status: string;
    transaction_status: string;
    search_parameter: string;
    uin: string;
    pk: string;
}