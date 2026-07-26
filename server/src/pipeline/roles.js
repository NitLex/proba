/**
 * Agent roles for the offer launch orchestration service.
 * Orchestrator assigns steps; each agent produces structured output + a Cursor brief.
 */

export const AGENT_ROLES = {
  analyst: {
    id: 'analyst',
    name: 'Аналитик рынка',
    description:
      'Глобальный разбор: метрики сети, Wordstat, типичные связки арбитража по вертикали/источникам. Наша БД — только вторичный сигнал.',
  },
  wordstat: {
    id: 'wordstat',
    name: 'Wordstat / семантика',
    description:
      'Собирает семантику и минус-слова для РСЯ/поиска на основе углов аналитика (Wordstat API или эвристика).',
  },
  creative: {
    id: 'creative',
    name: 'Креатив-агент',
    description:
      'Брифы и картинки: графическое (текст на баннере) или товарное (чистая картинка + текст в полях).',
  },
  tracker: {
    id: 'tracker',
    name: 'Трекер-агент',
    description:
      'Создаёт в ArbTrack источник, оффер, кампанию, click-URL и черновик постбека.',
  },
  direct: {
    id: 'direct',
    name: 'Директ-агент',
    description:
      'РСЯ-черновик OFF по handbook справки Директа (support/direct): стратегия, модерация, ImageAd/TextAd. Без авто-модерации.',
  },
  qa: {
    id: 'qa',
    name: 'QA / smoke',
    description:
      'После сборки: click 302, YandexBot/YaDirectFetcher не 403, редирект на оффер, postback-шаблон, кампания Директа.',
  },
  traffic_analyst: {
    id: 'traffic_analyst',
    name: 'Аналитик трафика',
    description:
      'После модерации: смотрит статистику трекера и отчёт «Площадки», режет мусор, советует ставки/паузы. Цель — улучшить качество трафика.',
  },
};

/** Default DAG: analyst → parallel → direct → qa smoke. */
export const DEFAULT_PIPELINE = [
  { agent: 'analyst', title: 'Глобальный анализ рынка', dependsOn: [] },
  { agent: 'wordstat', title: 'Семантика и Wordstat', dependsOn: ['analyst'] },
  { agent: 'creative', title: 'Креативы и тексты', dependsOn: ['analyst'] },
  { agent: 'tracker', title: 'Настройка трекера', dependsOn: ['analyst'] },
  {
    agent: 'direct',
    title: 'Параметры Яндекс.Директ',
    dependsOn: ['analyst', 'wordstat', 'creative', 'tracker'],
  },
  {
    agent: 'qa',
    title: 'Проверка ссылок и кликов',
    dependsOn: ['tracker', 'direct'],
  },
];

/** Post-launch optimization (not part of offer launch). */
export const OPTIMIZATION_PIPELINE = [
  {
    agent: 'traffic_analyst',
    title: 'Анализ трафика и чистка площадок',
    dependsOn: [],
  },
];
