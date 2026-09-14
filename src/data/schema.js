/* The admin panel is driven entirely by this schema: it decides which
   sections exist, how each one is edited and which fields a form shows.
   Adding a field to content.json means adding it here — the forms, the list
   rows and the validation all follow automatically, with no per-section UI
   code to keep in sync. */

export const sections = [
  {
    key: "events",
    label: "Мероприятия",
    hint: "Ближайшие игры и события. Одно отмечено как главное — оно и показано на сайте.",
    kind: "list",
    /* Which field is used for the row title and subtitle in the list view. */
    titleField: "title",
    subtitleField: "city",
    /* Only one item may be featured at a time. */
    exclusiveFlag: "featured",
    fields: [
      { key: "title", label: "Название", type: "text", required: true },
      { key: "day", label: "День", type: "text", width: "third", required: true, placeholder: "28" },
      { key: "month", label: "Месяц", type: "text", width: "third", required: true, placeholder: "Sep" },
      { key: "city", label: "Город", type: "text", width: "third", required: true },
      { key: "description", label: "Описание", type: "textarea", required: true },
      { key: "image", label: "Фото", type: "image", required: true },
      { key: "imageAlt", label: "Описание фото (alt)", type: "text", required: true, hint: "Для незрячих и поисковиков." },
      { key: "buttonLabel", label: "Текст кнопки", type: "text", width: "half", required: true },
      { key: "buttonUrl", label: "Ссылка кнопки", type: "url", width: "half", required: true },
      { key: "featured", label: "Показывать на сайте как главное событие", type: "toggle" },
    ],
  },

  {
    key: "tournaments",
    label: "Турниры",
    hint: "Еженедельные турниры. Один можно подсветить — он выделяется цветом на сайте.",
    kind: "list",
    titleField: "title",
    subtitleField: "subtitle",
    exclusiveFlag: "active",
    fields: [
      { key: "number", label: "Номер", type: "text", width: "third", required: true, placeholder: "01" },
      { key: "title", label: "Название", type: "text", width: "twothirds", required: true },
      { key: "subtitle", label: "Подзаголовок", type: "text", required: true },
      { key: "description", label: "Описание", type: "textarea", required: true },
      { key: "meta", label: "Детали", type: "pairs", pairLabels: { key: "Название", value: "Значение" } },
      { key: "joinUrl", label: "Ссылка кнопки «Join now»", type: "url", required: true },
      { key: "active", label: "Подсветить этот турнир", type: "toggle" },
    ],
  },

  {
    key: "training",
    label: "Цены тренировок",
    hint: "Две карточки тренировок и таблица пакетов.",
    kind: "group",
    groups: [
      {
        key: "cards",
        label: "Карточки тренировок",
        kind: "list",
        fixed: true,
        titleField: "title",
        subtitleField: "price",
        fields: [
          { key: "price", label: "Цена", type: "text", width: "half", required: true, placeholder: "€30" },
          { key: "unit", label: "За что", type: "text", width: "half", required: true, placeholder: "/ 1 hour" },
          { key: "title", label: "Заголовок", type: "multiline", required: true, hint: "Enter — перенос строки на сайте." },
          { key: "description", label: "Описание", type: "textarea", required: true },
          { key: "caption", label: "Подпись внизу", type: "multiline", required: true },
          { key: "buttonLabel", label: "Текст кнопки", type: "text", width: "half", required: true },
          { key: "buttonUrl", label: "Ссылка кнопки", type: "url", width: "half", required: true },
        ],
      },
      {
        key: "packages",
        label: "Пакеты",
        kind: "object",
        fields: [
          { key: "heading", label: "Заголовок", type: "multiline", required: true },
          { key: "rows", label: "Пакеты", type: "rows", rowFields: [
            { key: "label", label: "Пакет", type: "text", required: true },
            { key: "price", label: "Цена", type: "text", required: true },
            { key: "oldPrice", label: "Старая цена", type: "text" },
            { key: "save", label: "Бейдж выгоды", type: "text" },
          ] },
          { key: "note", label: "Примечание", type: "text", required: true },
          { key: "buttonLabel", label: "Текст кнопки", type: "text", width: "half", required: true },
          { key: "buttonUrl", label: "Ссылка кнопки", type: "url", width: "half", required: true },
        ],
      },
    ],
  },

  {
    key: "gallery",
    label: "Галерея",
    hint: "Фотографии в карусели. Порядок можно менять стрелками.",
    kind: "list",
    titleField: "alt",
    subtitleField: "image",
    sortable: true,
    thumbField: "image",
    fields: [
      { key: "image", label: "Фото", type: "image", required: true },
      { key: "alt", label: "Описание фото (alt)", type: "textarea", required: true },
    ],
  },

  {
    key: "journal",
    label: "Padel Journal",
    hint: "Статьи в блоке журнала.",
    kind: "list",
    titleField: "title",
    subtitleField: "index",
    sortable: true,
    thumbField: "image",
    fields: [
      { key: "index", label: "Номер", type: "text", width: "third", required: true, placeholder: "01" },
      { key: "title", label: "Заголовок", type: "text", required: true },
      { key: "excerpt", label: "Краткое описание", type: "textarea", required: true },
      { key: "image", label: "Фото", type: "image", required: true },
      { key: "alt", label: "Описание фото (alt)", type: "text", required: true },
      { key: "url", label: "Ссылка на статью", type: "url", required: true },
    ],
  },

  {
    key: "seo",
    label: "SEO",
    hint: "Заголовок и описание страницы в Google и при отправке ссылки в мессенджер.",
    kind: "group",
    groups: [
      {
        key: "home",
        label: "Главная страница",
        kind: "object",
        fields: [
          { key: "title", label: "SEO Title", type: "text", required: true, counter: 60,
            hint: "До 60 символов — иначе Google обрежет." },
          { key: "description", label: "Meta Description", type: "textarea", required: true, counter: 160,
            hint: "До 160 символов." },
          { key: "ogImage", label: "Картинка для соцсетей", type: "image" },
        ],
      },
    ],
  },
];

export function sectionByKey(key) {
  return sections.find((section) => section.key === key);
}
