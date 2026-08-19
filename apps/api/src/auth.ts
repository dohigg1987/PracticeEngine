import { createRemoteJWKSet, jwtVerify } from 'jose';
import { ApiError } from './core.ts';

export interface VerifiedToken { sub?: string; }
export type AccessTokenVerifier = (token: string) => Promise<VerifiedToken>;

const verifierCache = new Map<string, AccessTokenVerifier>();

function authConfiguration(neonAuthUrl: string): { authUrl: string; issuer: string; jwksUrl: URL } {
  if (!neonAuthUrl.trim()) throw new ApiError(500, 'AUTH_CONFIGURATION_ERROR', 'Authentication is unavailable');
  let authUrl: URL;
  try { authUrl = new URL(neonAuthUrl); }
  catch { throw new ApiError(500, 'AUTH_CONFIGURATION_ERROR', 'Authentication is unavailable'); }
  if (authUrl.protocol !== 'https:' || authUrl.username || authUrl.password || authUrl.search || authUrl.hash) {
    throw new ApiError(500, 'AUTH_CONFIGURATION_ERROR', 'Authentication is unavailable');
  }
  authUrl.pathname = `${authUrl.pathname.replace(/\/+$/, '')}/`;
  return {
    authUrl: authUrl.href,
    issuer: authUrl.origin,
    jwksUrl: new URL('.well-known/jwks.json', authUrl),
  };
}

export function neonAccessTokenVerifier(neonAuthUrl: string): AccessTokenVerifier {
  const configuration = authConfiguration(neonAuthUrl);
  const cached = verifierCache.get(configuration.authUrl);
  if (cached) return cached;
  const jwks = createRemoteJWKSet(configuration.jwksUrl);
  const verifier: AccessTokenVerifier = async (token) => {
    const { payload } = await jwtVerify(token, jwks, {
      algorithms: ['EdDSA'],
      issuer: configuration.issuer,
      audience: configuration.issuer,
      requiredClaims: ['sub', 'exp'],
    });
    return { sub: payload.sub };
  };
  verifierCache.set(configuration.authUrl, verifier);
  return verifier;
}

export async function authenticateRequest(request: Request, verify: AccessTokenVerifier): Promise<string> {
  const authorization = request.headers.get('authorization');
  const match = /^Bearer\s+([^\s]+)$/i.exec(authorization ?? '');
  if (!match) throw new ApiError(401, 'AUTHORIZATION_REQUIRED', 'A Bearer access token is required');
  let verified: VerifiedToken;
  try { verified = await verify(match[1]!); }
  catch { throw new ApiError(401, 'INVALID_TOKEN', 'Bearer token is invalid or expired'); }
  if (typeof verified.sub !== 'string' || verified.sub.trim() === '') throw new ApiError(401, 'INVALID_TOKEN', 'Bearer token has no subject');
  return verified.sub;
}
