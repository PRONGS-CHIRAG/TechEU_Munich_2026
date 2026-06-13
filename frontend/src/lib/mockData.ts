import type { BuyerRequest } from "./types";

export const BUYER_COMPANY = {
  name: "NovaCompute GmbH",
  industry: "AI infrastructure",
};

export const defaultRequest: BuyerRequest = {
  request_id: "REQ-001",
  raw_request:
    "We need a GPU for an AI workstation. It should fit inside our compact case, not consume too much power, stay under €650, arrive within a week, and include warranty.",
  region: "Germany",
  priority: "technical_fit",
};
