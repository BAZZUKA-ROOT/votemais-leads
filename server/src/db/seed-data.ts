export interface SeedCategory {
  slug: string;
  name: string;
  group: 'beleza' | 'rodeio' | 'municipal' | 'premiacao' | 'outros';
  keywords: string[];
  priority: number;
  seasonMonths?: number[];
}

const NEG = ['fantasia de', 'vaga de emprego', 'filme', 'novela', 'jogo online', 'loja', 'aluguel', 'curso de'];

export const DEFAULT_NEGATIVE = NEG;

const RAW_CATEGORIES: SeedCategory[] = [
  { slug: 'miss-brasil', name: 'Miss Brasil', group: 'beleza', keywords: ['Miss Brasil', 'Miss Brasil seletiva'], priority: 6 },
  { slug: 'miss-estadual', name: 'Miss Estadual', group: 'beleza', keywords: ['Miss estadual', 'concurso Miss estado'], priority: 8 },
  { slug: 'miss-municipal', name: 'Miss Municipal', group: 'beleza', keywords: ['Miss municipal', 'concurso Miss cidade'], priority: 8 },
  { slug: 'miss-teen', name: 'Miss Teen', group: 'beleza', keywords: ['Miss Teen', 'Miss Juvenil'], priority: 7 },
  { slug: 'mister', name: 'Mister', group: 'beleza', keywords: ['concurso Mister', 'Mister municipal'], priority: 6 },
  { slug: 'miss-mister-regional', name: 'Miss e Mister Regional', group: 'beleza', keywords: ['Miss e Mister regional', 'Miss e Mister'], priority: 6 },
  { slug: 'garota-da-cidade', name: 'Garota da Cidade', group: 'beleza', keywords: ['Garota da Cidade', 'concurso Garota'], priority: 6 },
  { slug: 'beleza-regional', name: 'Beleza Regional', group: 'beleza', keywords: ['concurso de beleza regional', 'Rainha da Beleza'], priority: 5 },
  { slug: 'rainha-do-rodeio', name: 'Rainha do Rodeio', group: 'rodeio', keywords: ['Rainha do Rodeio', 'concurso Rainha do Rodeio'], priority: 9 },
  { slug: 'princesa-do-rodeio', name: 'Princesa do Rodeio', group: 'rodeio', keywords: ['Princesa do Rodeio'], priority: 7 },
  { slug: 'musa-do-rodeio', name: 'Musa do Rodeio', group: 'rodeio', keywords: ['Musa do Rodeio'], priority: 7 },
  { slug: 'rainha-da-expo', name: 'Rainha da Expo', group: 'rodeio', keywords: ['Rainha da Expo', 'Rainha da Exposição agropecuária'], priority: 9 },
  { slug: 'rainha-do-agro', name: 'Rainha do Agro', group: 'rodeio', keywords: ['Rainha do Agro', 'Rainha do Agronegócio'], priority: 7 },
  { slug: 'garota-expo', name: 'Garota Expo', group: 'rodeio', keywords: ['Garota Expo', 'Garota da Expo'], priority: 7 },
  { slug: 'festa-agropecuaria', name: 'Concursos de festas agropecuárias', group: 'rodeio', keywords: ['concurso festa agropecuária', 'Rainha da Festa do Peão'], priority: 8 },
  { slug: 'rainha-da-festa', name: 'Rainha da Festa', group: 'municipal', keywords: ['Rainha da Festa', 'escolha da Rainha da Festa'], priority: 8 },
  { slug: 'rei-e-rainha', name: 'Rei e Rainha', group: 'municipal', keywords: ['concurso Rei e Rainha', 'Rei e Rainha do Carnaval'], priority: 7 },
  { slug: 'princesa-da-festa', name: 'Princesa da Festa', group: 'municipal', keywords: ['Princesa da Festa'], priority: 6 },
  { slug: 'concurso-popularidade', name: 'Concurso de popularidade', group: 'municipal', keywords: ['concurso de popularidade', 'Rainha da Popularidade'], priority: 7 },
  { slug: 'representante-municipal', name: 'Escolha da representante municipal', group: 'municipal', keywords: ['escolha da representante do município', 'Rainha do município'], priority: 6 },
  { slug: 'melhores-do-ano', name: 'Melhores do Ano', group: 'premiacao', keywords: ['Melhores do Ano', 'prêmio Melhores do Ano votação'], priority: 9 },
  { slug: 'melhor-comercio', name: 'Melhor Comércio', group: 'premiacao', keywords: ['prêmio Melhor Comércio', 'Top of Mind cidade'], priority: 7 },
  { slug: 'melhor-profissional', name: 'Melhor Profissional', group: 'premiacao', keywords: ['prêmio Melhor Profissional', 'Profissional do Ano votação'], priority: 6 },
  { slug: 'melhor-empresa', name: 'Melhor Empresa', group: 'premiacao', keywords: ['prêmio Melhor Empresa do ano', 'Empresa Destaque votação'], priority: 6 },
  { slug: 'destaques-da-cidade', name: 'Destaques da Cidade', group: 'premiacao', keywords: ['Destaques da Cidade', 'Destaque do Ano votação popular'], priority: 7 },
  { slug: 'premiacao-regional', name: 'Premiações regionais', group: 'premiacao', keywords: ['premiação regional votação popular', 'troféu regional votação'], priority: 6 },
  { slug: 'concurso-fotografico', name: 'Concursos fotográficos', group: 'outros', keywords: ['concurso fotográfico votação popular', 'concurso de fotografia voto popular'], priority: 5 },
  { slug: 'concurso-estudantil', name: 'Concursos estudantis', group: 'outros', keywords: ['concurso estudantil votação', 'Garota Colegial'], priority: 5 },
  { slug: 'evento-automotivo', name: 'Eventos automotivos', group: 'outros', keywords: ['encontro automotivo votação carro mais bonito', 'concurso carro rebaixado'], priority: 4 },
  { slug: 'concurso-musical', name: 'Concursos musicais', group: 'outros', keywords: ['festival de música votação popular', 'concurso de calouros votação'], priority: 5 },
  { slug: 'competicao-votacao-popular', name: 'Competições com votação popular', group: 'outros', keywords: ['votação popular concurso', 'vote no seu favorito concurso'], priority: 6 },
  { slug: 'concurso-influenciadores', name: 'Concursos de influenciadores', group: 'outros', keywords: ['prêmio influenciador digital votação', 'concurso influencer'], priority: 5 },
  { slug: 'miss-plus-size', name: 'Miss Plus Size', group: 'beleza', keywords: ['Miss Plus Size', 'concurso de beleza Plus Size'], priority: 6 },
  { slug: 'miss-melhor-idade', name: 'Miss Melhor Idade', group: 'beleza', keywords: ['Miss Melhor Idade', 'Rainha da Terceira Idade'], priority: 6 },
  { slug: 'mini-miss', name: 'Mini Miss e Miss Infantil', group: 'beleza', keywords: ['Mini Miss', 'Miss Infantil concurso'], priority: 5 },
  { slug: 'miss-gay-trans', name: 'Miss Gay e Miss Trans', group: 'beleza', keywords: ['Miss Gay concurso', 'Miss Trans concurso'], priority: 5 },
  { slug: 'garota-verao', name: 'Garota e Musa do Verão', group: 'beleza', keywords: ['Garota Verão', 'Musa do Verão concurso'], priority: 7 },
  { slug: 'musa-fitness', name: 'Musa Fitness', group: 'beleza', keywords: ['Musa Fitness concurso', 'Garota Fitness votação'], priority: 5 },
  { slug: 'musa-do-time', name: 'Musa de time e torcida', group: 'beleza', keywords: ['Musa do time votação', 'Musa da torcida concurso'], priority: 6 },
  { slug: 'rainha-country', name: 'Rainha e Garota Country', group: 'rodeio', keywords: ['Rainha Country', 'Garota Country concurso'], priority: 7 },
  { slug: 'prenda-ctg', name: 'Prendas e peões (CTG)', group: 'rodeio', keywords: ['concurso de Prendas', 'Prenda Jovem CTG'], priority: 6 },
  { slug: 'corte-carnaval', name: 'Corte do Carnaval', group: 'municipal', keywords: ['Rainha do Carnaval concurso', 'Rei Momo concurso', 'Rainha de Bateria votação'], priority: 8 },
  { slug: 'festa-junina', name: 'Festa junina (rainha e quadrilhas)', group: 'municipal', keywords: ['Rainha do Milho concurso', 'concurso de quadrilha junina votação'], priority: 8 },
  { slug: 'festa-tematica', name: 'Rainhas de festas temáticas', group: 'municipal', keywords: ['Rainha da Festa da Uva', 'Rainha da Oktoberfest', 'Rainha do Café concurso'], priority: 7 },
  { slug: 'decoracao-natal', name: 'Concursos de Natal', group: 'municipal', keywords: ['concurso decoração natalina votação', 'casa mais iluminada concurso'], priority: 5 },
  { slug: 'personalidade-do-ano', name: 'Personalidade do Ano', group: 'premiacao', keywords: ['Personalidade do Ano votação', 'prêmio Personalidades do ano'], priority: 7 },
  { slug: 'premio-gastronomia', name: 'Prêmios gastronômicos', group: 'premiacao', keywords: ['melhor hambúrguer da cidade votação', 'festival gastronômico voto popular'], priority: 6 },
  { slug: 'destaque-esporte', name: 'Destaques do esporte', group: 'premiacao', keywords: ['atleta do ano votação popular', 'prêmio destaque esportivo votação'], priority: 6 },
  { slug: 'premio-comunicacao', name: 'Prêmios de comunicação', group: 'premiacao', keywords: ['comunicador do ano votação', 'Destaque Imprensa votação'], priority: 5 },
  { slug: 'premio-empreendedor', name: 'Empreendedor do Ano', group: 'premiacao', keywords: ['empreendedor do ano votação popular', 'prêmio empreendedorismo votação'], priority: 6 },
  { slug: 'concurso-bebe', name: 'Concursos de bebês', group: 'outros', keywords: ['concurso bebê mais lindo votação', 'concurso foto de bebê'], priority: 5 },
  { slug: 'concurso-pet', name: 'Concursos de pets', group: 'outros', keywords: ['concurso pet mais bonito votação', 'concurso de cães votação'], priority: 5 },
  { slug: 'concurso-danca', name: 'Concursos de dança', group: 'outros', keywords: ['concurso de dança votação popular', 'festival de dança voto popular'], priority: 5 },
  { slug: 'festival-gospel', name: 'Festivais e troféus gospel', group: 'outros', keywords: ['festival gospel votação', 'troféu gospel votação popular'], priority: 5 },
  { slug: 'concurso-cosplay', name: 'Concursos de cosplay', group: 'outros', keywords: ['concurso cosplay votação', 'cosplay votação popular'], priority: 4 },
];

const YEAR_END = [11, 12, 1];
const RODEO = [3, 4, 5, 6, 7, 8, 9, 10];

/** Meses em que os eventos de cada categoria acontecem (vazio = o ano todo). */
export const DEFAULT_SEASONS: Record<string, number[]> = {
  'melhores-do-ano': YEAR_END,
  'melhor-comercio': YEAR_END,
  'melhor-profissional': YEAR_END,
  'melhor-empresa': YEAR_END,
  'destaques-da-cidade': YEAR_END,
  'premiacao-regional': YEAR_END,
  'personalidade-do-ano': YEAR_END,
  'premio-empreendedor': YEAR_END,
  'premio-comunicacao': YEAR_END,
  'destaque-esporte': YEAR_END,
  'rainha-do-rodeio': RODEO,
  'princesa-do-rodeio': RODEO,
  'musa-do-rodeio': RODEO,
  'rainha-da-expo': RODEO,
  'rainha-do-agro': RODEO,
  'garota-expo': RODEO,
  'festa-agropecuaria': RODEO,
  'rainha-country': RODEO,
  'corte-carnaval': [1, 2],
  'festa-junina': [5, 6, 7],
  'garota-verao': [12, 1, 2],
  'decoracao-natal': [12],
  'prenda-ctg': [8, 9],
};

export const DEFAULT_CATEGORIES: SeedCategory[] = RAW_CATEGORIES.map((c) => ({ ...c, seasonMonths: DEFAULT_SEASONS[c.slug] ?? [] }));
