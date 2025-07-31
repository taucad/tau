/* eslint-disable new-cap, @typescript-eslint/naming-convention -- decorators are not constructors */
import { SetMetadata } from '@nestjs/common';
import { isPublicAuth, isOptionalAuth } from '#constants/auth.constant.js';

/**
 * Decorator to mark a route as publicly accessible (no authentication required)
 */
export const PublicAuth = (): ReturnType<typeof SetMetadata> => SetMetadata(isPublicAuth, true);

/**
 * Decorator to mark a route as having optional authentication
 * Route will still execute even if user is not authenticated
 */
export const OptionalAuth = (): ReturnType<typeof SetMetadata> => SetMetadata(isOptionalAuth, true);
