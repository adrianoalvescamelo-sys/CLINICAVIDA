import { SetMetadata } from '@nestjs/common';

export const SKIP_RESPONSE_INTERCEPTOR_KEY = 'skipResponseInterceptor';

/**
 * Apply to a controller or handler to bypass the global ResponseInterceptor
 * envelope ({ success, data, error }). Use on health probe routes so that
 * k8s / load-balancer probes receive the raw payload directly.
 */
export const SkipResponseInterceptor = () =>
  SetMetadata(SKIP_RESPONSE_INTERCEPTOR_KEY, true);
