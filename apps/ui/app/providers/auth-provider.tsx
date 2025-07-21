import { AuthUIProvider } from '@daveyplate/better-auth-ui';
import { Link } from 'react-router';
import { authClient } from '~/lib/auth-client.js';

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
      organization
      authClient={authClient}
      changeEmail={false}
      // Navigate={navigate}
      // replace={replace}
      redirectTo="/"
      social={{
        providers: ['github'],
      }}
      settings={{
        url: '/settings/account',
      }}
      // eslint-disable-next-line react/prop-types -- 3rd-party library
      Link={(props) => <Link {...props} to={props.href} />}
    >
      {children}
    </AuthUIProvider>
  );
}
