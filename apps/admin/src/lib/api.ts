import { createNetflyClient } from "@netfly/api-client";

/** Browser API client. Same-origin: Next rewrites /api/* to the backend. */
export const api = createNetflyClient({ baseUrl: "", app: "admin" });
