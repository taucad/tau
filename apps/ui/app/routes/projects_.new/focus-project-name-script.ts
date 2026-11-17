/*
 * `autoFocus` is applied by the browser at its next rendering update, about 90 ms after navigation on an
 * M2 Pro; a key typed before then lands on the body and is lost (20 of 40 loads lost the first key). This
 * runs as soon as the parser reaches the field, before first paint, and leaves focus alone if the person
 * already put it somewhere. Its CSP hash is listed in `#lib/inline-script-hashes`.
 */
export const focusProjectNameScript = `(()=>{const input=document.getElementById('project-name');if(input&&(document.activeElement===null||document.activeElement===document.body))input.focus()})()`;
