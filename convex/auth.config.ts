import type { AuthConfig } from "convex/server";

export default {
  providers: [
    {
      type: "customJwt",
      applicationID: "tidepost",
      issuer: "https://tidepost.app",
      jwks: "data:application/json;base64,eyJrZXlzIjpbeyJrdHkiOiJFQyIsIngiOiJxaVhTcjRsZ1VZbzNqYlhoaXJHcjRjcGQ3Sm5RUml4cnhDMjRvVnlHSTZZIiwieSI6ImZZZHdWcDNCdXhCdmpkdjhCXzRqaDQ2X1ZjTExNZnJSZTBBRHhMQ1VaV0kiLCJjcnYiOiJQLTI1NiIsInVzZSI6InNpZyIsImtpZCI6InRpZGVwb3N0LWVzMjU2LTEiLCJhbGciOiJFUzI1NiJ9XX0=",
      algorithm: "ES256",
    },
  ],
} satisfies AuthConfig;
