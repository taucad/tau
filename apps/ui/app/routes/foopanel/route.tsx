import { useState } from 'react';
import * as React from 'react';
import { CodeEditor } from '#components/code/code-editor.js';
import { sampleBuilds } from '#constants/build-examples.js';
import { decodeTextFile } from '#utils/filesystem.utils.js';
import type { Handle } from '#types/matches.types.js';

export const handle: Handle = {
  // EnableOverflowY: true,
  // noPageWrapper: true,
  enableOverflowY: false,
  enableFloatingSidebar: false,
  noPageWrapper: true,
};

export default function TestRoute(): React.JSX.Element {
  // Find the birdhouse build
  const birdhouseBuild = sampleBuilds.find((build) => build.id === 'bld_birdhouse');

  // Extract the code from the build
  const initialCode = birdhouseBuild
    ? decodeTextFile(birdhouseBuild.assets.mechanical!.files[birdhouseBuild.assets.mechanical!.main]!.content)
    : '// No birdhouse example found';

  const [code, setCode] = useState<string>(Array.from({ length: 3 }, () => initialCode).join('\n'));

  return (
    <div className="flex h-screen w-full flex-col">
      <div className="flex h-8 items-center p-2">Breadcrumbs</div>
      <CodeEditor
        className="h-full"
        value={code}
        language="typescript"
        path="main.ts"
        onChange={(value) => {
          setCode(value ?? '');
        }}
      />
    </div>
  );
}
