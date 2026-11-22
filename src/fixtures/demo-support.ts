import type { SupportTicket } from '@/domain/support-feedback';

/** Fictional case summaries. No customer or order information is used. */
export const DEMO_SUPPORT_TICKETS: readonly SupportTicket[] = [
  { id: 'SUP-101', createdAt: '2026-08-30', sku: 'NT-TENT-RDG2', summary: 'Parcel has not arrived and tracking stopped updating.' },
  { id: 'SUP-102', createdAt: '2026-08-26', sku: 'NT-TENT-RDG2', summary: 'The carrier missed the promised delivery date.' },
  { id: 'SUP-103', createdAt: '2026-08-23', productName: 'Ridgeline 2P Backpacking Tent', summary: 'Tracking shows the parcel is still at the regional depot.' },
  { id: 'SUP-104', createdAt: '2026-08-18', sku: 'NT-TENT-RDG2', summary: 'A pole arrived broken.' },
  { id: 'SUP-105', createdAt: '2026-08-11', sku: 'NT-TENT-RDG2', summary: 'The rainfly is torn at a seam.' },
  { id: 'SUP-106', createdAt: '2026-08-25', sku: 'NT-APP-RSH1', summary: 'The shell is too tight over a midlayer.' },
  { id: 'SUP-107', createdAt: '2026-08-20', sku: 'NT-APP-RSH1', summary: 'The size chart does not make room for layers.' },
  { id: 'SUP-108', createdAt: '2026-08-08', sku: 'NT-APP-RSH1', summary: 'Asked how to start an exchange.' },
  { id: 'SUP-109', createdAt: '2026-08-31', sku: 'NT-LGT-BCN4', summary: 'The lamp arrived defective and will not power on.' },
  { id: 'SUP-110', createdAt: '2026-08-02', sku: 'NT-LGT-BCN4', summary: 'Asked for the battery specifications.' },
  { id: 'SUP-111', createdAt: '2026-08-22', productName: 'Ridgeline', summary: 'The shipment has been delayed.' },
  { id: 'SUP-112', createdAt: '2026-08-19', sku: 'UNKNOWN-SKU', summary: 'Asked for a refund because the item was damaged.' },
  { id: 'SUP-113', createdAt: '2026-07-24', sku: 'NT-TENT-RDG3', summary: 'The product page does not list the floor dimensions.' },
  { id: 'SUP-114', createdAt: '2026-06-18', sku: 'NT-BAG-SMT20', summary: 'Asked about the return process.' },
];
