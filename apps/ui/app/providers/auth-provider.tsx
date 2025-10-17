import { AuthUIProvider } from '@daveyplate/better-auth-ui';
import { Link } from 'react-router';
import { authClient } from '#lib/auth-client.js';
import { ENV } from '#config.js';

export function AuthConfigProvider({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
  // Const rrNavigate = useNavigate();

  // Using these results in an inifinite redirect loop.
  // @see https://github.com/daveyplate/better-auth-ui/issues/84#issuecomment-2915639544
  // const replace = useCallback((href: string) => {
  //   void rrNavigate(href, {
  //     replace: true,
  //   });
  // }, []);
  // const navigate = useCallback((href: string) => {
  //   void rrNavigate(href);
  // }, []);

  return (
    <AuthUIProvider
      magicLink
      authClient={authClient}
      changeEmail={false}
      // Navigate={navigate}
      // replace={replace}
      redirectTo="/"
      baseURL={ENV.TAU_FRONTEND_URL}
      social={{
        providers: ['github', 'google'],
      }}
      account={{
        basePath: '/settings',
        viewPaths: {
          // eslint-disable-next-line @typescript-eslint/naming-convention -- Better Auth UI uses SCREAMING_SNAKE_CASE for view paths
          SETTINGS: 'account',
          // eslint-disable-next-line @typescript-eslint/naming-convention -- Better Auth UI uses SCREAMING_SNAKE_CASE for view paths
          SECURITY: 'security',
          // eslint-disable-next-line @typescript-eslint/naming-convention -- Better Auth UI uses SCREAMING_SNAKE_CASE for view paths
          API_KEYS: 'api-keys',
        },
      }}
      // eslint-disable-next-line react/prop-types -- 3rd-party library
      Link={(props) => <Link {...props} to={props.href} />}
    >
      {children}
    </AuthUIProvider>
  );
}
