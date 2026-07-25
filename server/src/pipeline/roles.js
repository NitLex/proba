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
      'РСЯ-черновик OFF: ImageAd если креатив с надписями, TextAd если товарное (текст в настройках). Без модерации.',
  },
};

/** Default DAG: analyst first, then parallel research/creative/tracker, then direct. */
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
];
