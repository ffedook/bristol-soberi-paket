const plural = new Intl.PluralRules('ru');
export function noun(count: number, one: string, few: string, many: string) {
  const form = plural.select(count);
  return form === 'one' ? one : form === 'few' ? few : many;
}
export const tapsText = (n: number) =>
  `${n} ${noun(n, 'нажатие', 'нажатия', 'нажатий')}`;
export const coinsText = (n: number, accusative = false) =>
  `${n.toLocaleString('ru-RU')} ${noun(n, accusative ? 'монету' : 'монета', 'монеты', 'монет')}`;
