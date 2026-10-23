/** Fusos do Brasil aceitos nas preferências da empresa: [cidade IANA, rótulo, UTC]. */
const ZONES: [string, string, number][] = [
  ["Noronha", "Noronha", -2],
  ["Belem", "Belém", -3],
  ["Fortaleza", "Fortaleza", -3],
  ["Recife", "Recife", -3],
  ["Araguaina", "Araguaína", -3],
  ["Maceio", "Maceió", -3],
  ["Bahia", "Bahia", -3],
  ["Sao_Paulo", "São Paulo", -3],
  ["Santarem", "Santarém", -3],
  ["Campo_Grande", "Campo Grande", -4],
  ["Cuiaba", "Cuiabá", -4],
  ["Porto_Velho", "Porto Velho", -4],
  ["Boa_Vista", "Boa Vista", -4],
  ["Manaus", "Manaus", -4],
  ["Eirunepe", "Eirunepé", -5],
  ["Rio_Branco", "Rio Branco", -5],
];

export const BR_TIMEZONES: { value: string; label: string }[] = ZONES.map(([city, label, utc]) => ({
  value: `America/${city}`,
  label: `${label} (UTC−${Math.abs(utc)})`,
}));

/** Mantém um fuso legado já gravado selecionável em vez de trocá-lo em silêncio. */
export function timezoneOptions(current?: string): { value: string; label: string }[] {
  return current && !BR_TIMEZONES.some((t) => t.value === current)
    ? [...BR_TIMEZONES, { value: current, label: current }]
    : BR_TIMEZONES;
}
