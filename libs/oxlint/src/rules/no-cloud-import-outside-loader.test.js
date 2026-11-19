import { describe, it } from 'vitest';
import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import { noCloudImportOutsideLoaderRule } from './no-cloud-import-outside-loader.js';

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
  },
});

const loader = 'apps/ui/app/cloud/cloud-entries.ts';
const facade = 'apps/ui/app/cloud/settings-billing.adaptive.tsx';
const route = 'apps/ui/app/routes/usage/route.tsx';

describe('no-cloud-import-outside-loader', () => {
  it('allows a Cloud import() only in the loader, and no lazy() of Cloud code', () => {
    ruleTester.run('no-cloud-import-outside-loader', noCloudImportOutsideLoaderRule, {
      valid: [
        {
          name: 'the loader names the Cloud chunk',
          filename: loader,
          code: "const load = () => import('#cloud/cloud-surfaces.lazy.js');",
        },
        {
          name: 'a static import of a facade is not a dynamic one',
          filename: route,
          code: "import { CloudBillingSettings } from '#cloud/settings-billing.js';",
        },
        {
          name: 'a non-Cloud dynamic import elsewhere',
          filename: route,
          code: "const load = () => import('#runtime/project-runtime.session.js');",
        },
        {
          name: 'lazy() outside the Cloud folder of non-Cloud code',
          filename: route,
          code: "const View = lazy(() => import('./view.js'));",
        },
        {
          name: 'tests may import Cloud code dynamically',
          filename: 'apps/ui/app/cloud/cloud-loader.test.ts',
          code: "const load = () => import('#cloud/cloud-surfaces.lazy.js');",
        },
        {
          name: 'files outside the app',
          filename: 'apps/libs/billing-ui/src/index.ts',
          code: "const load = () => import('#cloud/x.cloud.js');",
        },
      ],
      invalid: [
        {
          name: 'a facade importing the Cloud chunk itself',
          filename: facade,
          code: "const load = () => import('#cloud/cloud-surfaces.lazy.js');",
          errors: [{ messageId: 'cloudImport' }],
        },
        {
          name: 'a route importing a .cloud file by path',
          filename: route,
          code: "const load = () => import('../../cloud/settings-billing.cloud.js');",
          errors: [{ messageId: 'cloudImport' }],
        },
        {
          name: 'lazy() in the Cloud folder',
          filename: facade,
          code: 'const Settings = lazy(() => load());',
          errors: [{ messageId: 'cloudLazy' }],
        },
        {
          name: 'React.lazy() in the Cloud folder',
          filename: facade,
          code: 'const Settings = React.lazy(() => load());',
          errors: [{ messageId: 'cloudLazy' }],
        },
      ],
    });
  });
});
