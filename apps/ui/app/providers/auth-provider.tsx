import { Link, useNavigate } from 'react-router';
// oxlint-disable-next-line import/no-unassigned-import -- side-effect loads `AuthPluginRegister` module augmentation before `<AuthProvider>`
import '#utils/auth-plugin.js';
import { AuthProvider } from '#components/auth/auth-provider.js';
import { authClient } from '#lib/auth-client.js';
import { ENV } from '#environment.config.js';
import { apiKeyPlugin } from '#utils/api-key-plugin.js';
import { magicLinkPlugin } from '#utils/magic-link-plugin.js';

export function AuthConfigProvider({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
  const navigate = useNavigate();

  return (
    <AuthProvider
      authClient={authClient}
      navigate={({ to, replace }) => void navigate(to, { replace: replace ?? false })}
      Link={(props) => <Link {...props} to={props.href} />}
      plugins={[magicLinkPlugin(), apiKeyPlugin()]}
      socialProviders={['github', 'google']}
      redirectTo='/'
      baseURL={ENV.TAU_FRONTEND_URL}
    >
      {children}
    </AuthProvider>
  );
}
