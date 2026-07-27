/** Popular first, then the rest alphabetically by code. */
export const POPULAR_CURRENCIES = ['RUB', 'USD', 'EUR', 'GBP', 'UAH', 'KZT', 'TRY', 'USDT'];

export const ALL_CURRENCIES = [
  { code: 'USD', name: 'US Dollar' },
  { code: 'EUR', name: 'Euro' },
  { code: 'RUB', name: 'Российский рубль' },
  { code: 'GBP', name: 'British Pound' },
  { code: 'UAH', name: 'Украинская гривна' },
  { code: 'KZT', name: 'Казахстанский тенге' },
  { code: 'TRY', name: 'Turkish Lira' },
  { code: 'USDT', name: 'Tether (USDT)' },
  { code: 'AED', name: 'UAE Dirham' },
  { code: 'AMD', name: 'Armenian Dram' },
  { code: 'AUD', name: 'Australian Dollar' },
  { code: 'AZN', name: 'Azerbaijani Manat' },
  { code: 'BRL', name: 'Brazilian Real' },
  { code: 'BYN', name: 'Belarusian Ruble' },
  { code: 'CAD', name: 'Canadian Dollar' },
  { code: 'CHF', name: 'Swiss Franc' },
  { code: 'CNY', name: 'Chinese Yuan' },
  { code: 'CZK', name: 'Czech Koruna' },
  { code: 'DKK', name: 'Danish Krone' },
  { code: 'GEL', name: 'Georgian Lari' },
  { code: 'HKD', name: 'Hong Kong Dollar' },
  { code: 'HUF', name: 'Hungarian Forint' },
  { code: 'IDR', name: 'Indonesian Rupiah' },
  { code: 'ILS', name: 'Israeli Shekel' },
  { code: 'INR', name: 'Indian Rupee' },
  { code: 'JPY', name: 'Japanese Yen' },
  { code: 'KRW', name: 'South Korean Won' },
  { code: 'MDL', name: 'Moldovan Leu' },
  { code: 'MXN', name: 'Mexican Peso' },
  { code: 'NOK', name: 'Norwegian Krone' },
  { code: 'NZD', name: 'New Zealand Dollar' },
  { code: 'PLN', name: 'Polish Zloty' },
  { code: 'RON', name: 'Romanian Leu' },
  { code: 'SAR', name: 'Saudi Riyal' },
  { code: 'SEK', name: 'Swedish Krona' },
  { code: 'SGD', name: 'Singapore Dollar' },
  { code: 'THB', name: 'Thai Baht' },
  { code: 'TJS', name: 'Tajikistani Somoni' },
  { code: 'TMT', name: 'Turkmenistani Manat' },
  { code: 'UZS', name: 'Uzbekistani Som' },
  { code: 'VND', name: 'Vietnamese Dong' },
  { code: 'ZAR', name: 'South African Rand' },
];

const byCode = new Map(ALL_CURRENCIES.map((c) => [c.code, c]));

export function currencyOptions() {
  const popular = POPULAR_CURRENCIES.map((code) => byCode.get(code)).filter(Boolean);
  const rest = ALL_CURRENCIES.filter((c) => !POPULAR_CURRENCIES.includes(c.code)).sort((a, b) =>
    a.code.localeCompare(b.code)
  );
  return { popular, rest };
}
