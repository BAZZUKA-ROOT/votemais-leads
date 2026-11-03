export const STAGES = [
  { id: 'novo', label: 'Novo lead', short: 'Novo', color: 'bg-slate-400' },
  { id: 'qualificado', label: 'Qualificado', short: 'Qualif.', color: 'bg-violet-500' },
  { id: 'aguardando_contato', label: 'Aguardando contato', short: 'Ag. contato', color: 'bg-indigo-500' },
  { id: 'contatado', label: 'Contatado', short: 'Contatado', color: 'bg-sky-500' },
  { id: 'aguardando_resposta', label: 'Aguardando resposta', short: 'Ag. resposta', color: 'bg-cyan-500' },
  { id: 'interessado', label: 'Interessado', short: 'Interessado', color: 'bg-amber-500' },
  { id: 'negociacao', label: 'Negociação', short: 'Negociação', color: 'bg-orange-500' },
  { id: 'cliente', label: 'Cliente convertido', short: 'Cliente', color: 'bg-emerald-500' },
  { id: 'sem_interesse', label: 'Sem interesse', short: 'Sem interesse', color: 'bg-rose-400' },
] as const;
export type Stage = (typeof STAGES)[number]['id'];
export const stageLabel = (s: string) => STAGES.find((x) => x.id === s)?.label ?? s;
export const stageColor = (s: string) => STAGES.find((x) => x.id === s)?.color ?? 'bg-slate-400';

export const UFS = [
  ['AC', 'Acre', 'Norte'], ['AL', 'Alagoas', 'Nordeste'], ['AP', 'Amapá', 'Norte'], ['AM', 'Amazonas', 'Norte'], ['BA', 'Bahia', 'Nordeste'],
  ['CE', 'Ceará', 'Nordeste'], ['DF', 'Distrito Federal', 'Centro-Oeste'], ['ES', 'Espírito Santo', 'Sudeste'], ['GO', 'Goiás', 'Centro-Oeste'],
  ['MA', 'Maranhão', 'Nordeste'], ['MT', 'Mato Grosso', 'Centro-Oeste'], ['MS', 'Mato Grosso do Sul', 'Centro-Oeste'], ['MG', 'Minas Gerais', 'Sudeste'],
  ['PA', 'Pará', 'Norte'], ['PB', 'Paraíba', 'Nordeste'], ['PR', 'Paraná', 'Sul'], ['PE', 'Pernambuco', 'Nordeste'], ['PI', 'Piauí', 'Nordeste'],
  ['RJ', 'Rio de Janeiro', 'Sudeste'], ['RN', 'Rio Grande do Norte', 'Nordeste'], ['RS', 'Rio Grande do Sul', 'Sul'], ['RO', 'Rondônia', 'Norte'],
  ['RR', 'Roraima', 'Norte'], ['SC', 'Santa Catarina', 'Sul'], ['SP', 'São Paulo', 'Sudeste'], ['SE', 'Sergipe', 'Nordeste'], ['TO', 'Tocantins', 'Norte'],
] as const;
export const REGIONS = ['Norte', 'Nordeste', 'Centro-Oeste', 'Sudeste', 'Sul'] as const;

export const FACT_LABEL: Record<string, string> = {
  confirmed: 'Confirmado',
  unconfirmed: 'Não confirmado',
  not_confirmed: 'Não confirmado',
  not_found: 'Não localizado',
  denied: 'Não possui',
};

export const ORGANIZER_TYPES: Record<string, string> = {
  empresa: 'Empresa',
  prefeitura: 'Prefeitura',
  associacao: 'Associação',
  produtora: 'Produtora',
  sindicato_rural: 'Sindicato rural',
  midia: 'Mídia',
  pessoa: 'Pessoa',
  desconhecido: 'Não identificado',
};

export const CATEGORY_GROUPS: Record<string, string> = {
  beleza: 'Concursos de beleza',
  rodeio: 'Rodeios e agropecuária',
  municipal: 'Festas municipais',
  premiacao: 'Premiações',
  outros: 'Outros',
};

export const EVENT_STATUS: Record<string, string> = {
  scheduled: 'Agendado',
  ongoing: 'Em andamento',
  past: 'Realizado',
  cancelled: 'Cancelado',
  unknown: 'Indefinido',
};

export const JOB_STATUS: Record<string, string> = {
  queued: 'Na fila',
  running: 'Em andamento',
  completed: 'Concluída',
  failed: 'Falhou',
  cancelled: 'Cancelada',
};

export const RESULT_STATUS: Record<string, string> = {
  new: 'Na fila',
  irrelevant: 'Irrelevante',
  awaiting_ai: 'Aguardando IA',
  processing: 'Processando',
  processed: 'Lead criado',
  duplicate: 'Duplicado/agregado',
  discarded: 'Descartado',
  failed: 'Falhou',
  blocked: 'Bloqueado',
  cancelled: 'Cancelado',
};

export const HISTORY_LABEL: Record<string, string> = {
  created: 'Lead descoberto',
  stage_change: 'Mudança de estágio',
  whatsapp_opened: 'WhatsApp aberto',
  instagram_opened: 'Instagram aberto',
  email_opened: 'E-mail aberto',
  website_opened: 'Site aberto',
  contact_made: 'Contato realizado',
  note: 'Observação',
  message_generated: 'Mensagem gerada',
  edited: 'Edição',
  followup_created: 'Follow-up agendado',
  followup_done: 'Follow-up concluído',
  analysis: 'Análise da IA',
  suppressed: 'Supressão',
};
