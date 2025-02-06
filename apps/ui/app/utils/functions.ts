export function debounce<T extends (...arguments_: any[]) => any>(
  function_: T,
  wait: number,
): (...arguments_: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>;
  return function (this: any, ...arguments_: Parameters<T>) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      console.log('calling function');
      function_.apply(this, arguments_);
    }, wait);
  };
}
