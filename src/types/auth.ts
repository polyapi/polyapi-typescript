export interface AuthData {
  tenant: {
    id: string;
  };
  environment: {
    id: string;
  };

  permissions?: Record<string, boolean>;
}

export interface SignUpDto {
  name: string | null;
  email: string;
  id: string;
}

export interface SignUpVerificationResultDto {
  apiBaseUrl: string;
  apiKey: string;
}

export interface TosDto {
  id: string;
  content: string;
  createdAt: Date;
  version: string;
}
