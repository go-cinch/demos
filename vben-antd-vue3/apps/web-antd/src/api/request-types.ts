import type { RequestClientConfig, RequestClientOptions } from '@vben/request';

export interface VerificationRetryOptions {
  _verificationRetried?: boolean;
  verificationRetryCredential?: () => Promise<{
    challenge_id: string;
    credential: string;
  }>;
}

export type ServiceRequestConfig<T = unknown> = RequestClientConfig<T> &
  VerificationRetryOptions & {
    /** The originating form already presents feedback for this request. */
    suppressErrorMessage?: boolean;
  };

/** For requests whose caller owns feedback, including background refreshes. */
export const quietRequest: ServiceRequestConfig = {
  suppressErrorMessage: true,
};

export type RequestErrorFeedback = Pick<
  ServiceRequestConfig,
  'suppressErrorMessage'
>;

export type ServiceClientOptions = RequestClientOptions & {
  authentication?: 'none' | 'refresh';
  errorMessage?: 'gateway' | boolean;
  verificationChallenge?: 'inline' | 'prompt';
};
