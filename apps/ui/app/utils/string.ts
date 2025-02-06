export const pascalCaseToWords = (string_: string) => {
  return string_.replaceAll(/([A-Z])/g, ' $1').replace(/^./, function (string_) {
    return string_.toUpperCase();
  });
};
