import type { RequestClientConfig, RequestClientOptions } from '@vben/request';

export interface MFARetryOptions {
  _mfaRetried?: boolean;
  mfaRetryCredential?: () => Promise<{
    challenge_id: string;
    credential: string;
  }>;
}

export type ServiceRequestConfig<T = unknown> = MFARetryOptions &
  RequestClientConfig<T>;

export type ServiceClientOptions = RequestClientOptions & {
  authentication?: 'none' | 'refresh';
  errorMessage?: 'gateway' | boolean;
  mfaChallenge?: 'inline' | 'prompt';
};
