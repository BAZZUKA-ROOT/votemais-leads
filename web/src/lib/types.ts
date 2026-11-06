export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface LeadRow {
  id: string;
  eventId: string;
  eventName: string;
  eventYear: number | null;
  organizerId: string | null;
  organizerName: string | null;
  categoryId: number | null;
  categoryName: string | null;
  city: string | null;
  state: string | null;
  region: string | null;
  eventDate: string | null;
  score: number | null;
  potential: string | null;
  qualification: string;
  stage: string;
  primaryWhatsapp: string | null;
  primaryPhone: string | null;
  primaryEmail: string | null;
  primaryInstagram: string | null;
  primaryWebsite: string | null;
  isSuppressed: boolean;
  discoveredAt: string;
  lastContactAt: string | null;
  nextFollowUpAt: string | null;
  hasPopularVoting: string;
}

export interface Category {
  id: number;
  name: string;
  slug: string;
  group: string;
  description: string | null;
  keywords: string[];
  negativeKeywords: string[];
  priority: number;
  seasonMonths: number[];
  isActive: boolean;
  leads: number;
}

export interface Contact {
  id: string;
  type: string;
  value: string;
  normalizedValue: string;
  label: string | null;
  isCommercial: boolean;
  sourceUrl: string;
  sourceExcerpt: string | null;
  confidence: number;
  isValid: boolean;
  lastVerifiedAt: string | null;
}

export interface GeneratedMessage {
  id: string;
  leadId: string;
  kind: 'initial' | 'followup';
  channel: string;
  approach: string | null;
  content: string;
  editedContent: string | null;
  status: 'draft' | 'opened' | 'sent' | 'discarded';
  model: string | null;
  openedAt: string | null;
  sentAt: string | null;
  createdAt: string;
}

export interface LeadDetail {
  lead: LeadRow & { notes: string | null; justification: string | null; votingProbability: number | null; dataQuality: number | null; campaignId: number | null; stageChangedAt: string };
  event: {
    id: string; name: string; edition: string | null; year: number | null; city: string | null; state: string | null; region: string | null;
    startDate: string | null; endDate: string | null; status: string; registrationOpen: string; hasContest: string; hasParticipants: string;
    hasPopularVoting: string; votingEvidence: string | null; currentVotingMethod: string | null; description: string | null; website: string | null;
    instagramHandle: string | null; fieldSources: Record<string, string>; siteAvailable: boolean | null; lastVerifiedAt: string | null; categoryId: number | null;
  };
  organizer: null | {
    id: string; name: string; companyName: string | null; personName: string | null; type: string; city: string | null; state: string | null;
    website: string | null; instagramHandle: string | null; isRecurring: boolean; eventsCount: number; notes: string | null; fieldSources: Record<string, string>;
  };
  category: { id: number; name: string } | null;
  campaign: { id: number; name: string } | null;
  contacts: Contact[];
  sources: Array<{ id: string; url: string; domain: string; title: string | null; type: string; excerpt: string | null; createdAt: string; httpStatus: number | null }>;
  analyses: Array<{
    id: string; type: string; model: string; score: number | null; potential: string | null; votingProbability: number | null; dataQuality: number | null;
    justification: string | null; checklist: Array<{ item: string; status: string; evidence?: string | null }> | null; facts: string[] | null; hypotheses: string[] | null;
    output: Record<string, unknown> | null; costUsd: string | null; createdAt: string;
  }>;
  messages: GeneratedMessage[];
  history: Array<{ id: string; type: string; fromStage: string | null; toStage: string | null; channel: string | null; content: string | null; createdAt: string }>;
  followUps: Array<{ id: string; dueAt: string; title: string; notes: string | null; suggestedMessage: string | null; status: string }>;
  otherEvents: Array<{ id: string; name: string; year: number | null; leadId: string | null }>;
}
