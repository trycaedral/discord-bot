export const TICKET_OPEN_BUTTON = "caedral:ticket:open";
export const TICKET_CATEGORY_SELECT = "caedral:ticket:category";
export const TICKET_CLOSE_BUTTON = "caedral:ticket:close";

export const TICKET_CATEGORIES = {
  bug_report: "Bug Report",
  billing: "Billing Question",
  general: "General Question",
  feature: "Feature Request",
} as const;

export type TicketCategoryKey = keyof typeof TICKET_CATEGORIES;
