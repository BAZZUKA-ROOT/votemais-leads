export interface SeedCategory {
  slug: string;
  name: string;
  group: 'beleza' | 'rodeio' | 'municipal' | 'premiacao' | 'outros';
  keywords: string[];
  priority: number;
}

const NEG = ['fantasia de', 'vaga de emprego', 'filme', 'novela', 'jogo online', 'loja', 'aluguel', 'curso de'];

export const DEFAULT_NEGATIVE = NEG;

export const DEFAULT_CATEGORIES: SeedCategory[] = [
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
];
