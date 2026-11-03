export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (what = 'Recurso') => new AppError(404, 'not_found', `${what} não encontrado`);
export const badRequest = (msg: string, details?: unknown) => new AppError(400, 'bad_request', msg, details);
export const conflict = (msg: string) => new AppError(409, 'conflict', msg);
export const unauthorized = (msg = 'Não autenticado') => new AppError(401, 'unauthorized', msg);
export const forbidden = (msg = 'Acesso negado') => new AppError(403, 'forbidden', msg);

/** Integração externa ausente ou com falha — nunca simular. */
export class IntegrationUnavailableError extends AppError {
  constructor(provider: string, message?: string) {
    super(503, 'integration_unavailable', message ?? `Integração "${provider}" não configurada ou indisponível`);
  }
}
