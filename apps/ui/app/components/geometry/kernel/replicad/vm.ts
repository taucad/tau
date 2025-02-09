function buildFunctionWithContext(eval_string: string, context: Record<string, any>): string {
  return `
    return function (context) {
      "use strict";
      ${
        Object.keys(context).length > 0
          ? `let ${Object.keys(context).map((key) => ` ${key} = context['${key}']`)};`
          : ``
      }
      ${eval_string};
    }
    `;
}

function buildEvaluator(eval_string: string, context: Record<string, any>): Function {
  const template = buildFunctionWithContext(eval_string, context);
  const functor = new Function(template);
  return functor();
}

export async function buildModuleEvaluator(moduleString: string): Promise<any> {
  const url = URL.createObjectURL(new Blob([moduleString], { type: 'text/javascript' }));
  return await import(/* @vite-ignore */ `${url}`);
}

export function runInContext(text: string, context: Record<string, any> = {}): any {
  const evaluator = buildEvaluator(text, context);
  return evaluator(context);
}
