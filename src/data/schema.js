/* The admin panel is driven entirely by this schema: which pages exist, which
   groups each page shows, and which fields a form has. Every group's `key`
   names an entry in src/lib/repositories/admin.js, which owns the matching
   table and validation — the two files are the whole contract between the
   UI and the database. */

export const sections = [
  {
    key: "events",
    label: "Мероприятия",
    hint: "Ближайшие игры и события. Одно отмечено как главное — оно и показано на сайте.",
    groups: [
      {
        key: "events",
        kind: "list",
        titleField: "title",
        subtitleField: "eventDate",
        exclusiveFlag: "featured",
        blank: { featured: false, published: true, buttonLabel: "View event", buttonUrl: "#contact" },
        fields: [
          { key: "title", label: "Название", type: "text", required: true },
          { key: "eventDate", label: "Дата", type: "date", width: "half", required: true },
          { key: "city", label: "Город", type: "text", width: "half", required: true },
          { key: "description", label: "Описание", type: "textarea", required: true },
          { key: "image", label: "Фото", type: "image", folder: "events" },
          { key: "imageAlt", label: "Описание фото (alt)", type: "text", hint: "Для незрячих и поисковиков." },
          { key: "buttonLabel", label: "Текст кнопки", type: "text", width: "half", required: true },
          { key: "buttonUrl", label: "Ссылка кнопки", type: "url", width: "half", required: true },
          { key: "featured", label: "Показывать на сайте как главное событие", type: "toggle" },
          { key: "published", label: "Опубликовано", type: "toggle" },
        ],
      },
    ],
  },

  {
    key: "tournaments",
    label: "Турниры",
    hint: "Еженедельные турниры. Один можно подсветить — он выделяется цветом на сайте.",
    groups: [
      {
        key: "tournaments",
        kind: "list",
        titleField: "title",
        subtitleField: "subtitle",
        exclusiveFlag: "active",
        sortable: true,
        blank: { active: false, published: true, meta: [], joinUrl: "#contact" },
        fields: [
          { key: "number", label: "Номер", type: "text", width: "third", required: true, placeholder: "01" },
          { key: "title", label: "Название", type: "text", width: "twothirds", required: true },
          { key: "subtitle", label: "Подзаголовок", type: "text" },
          { key: "description", label: "Описание", type: "textarea", required: true },
          { key: "meta", label: "Детали", type: "pairs", pairLabels: { key: "Название", value: "Значение" } },
          { key: "joinUrl", label: "Ссылка кнопки «Join now»", type: "url", required: true },
          { key: "active", label: "Подсветить этот турнир", type: "toggle" },
          { key: "published", label: "Опубликовано", type: "toggle" },
        ],
      },
    ],
  },

  {
    key: "training",
    label: "Цены тренировок",
    hint: "Две карточки тренировок и таблица пакетов.",
    groups: [
      {
        key: "trainingCards",
        label: "Карточки тренировок",
        kind: "list",
        fixed: true,
        openAll: true,
        titleField: "title",
        subtitleField: "price",
        subtitlePrefix: "€",
        fields: [
          { key: "price", label: "Цена, €", type: "money", width: "half", required: true, placeholder: "30" },
          { key: "unit", label: "За что", type: "text", width: "half", required: true, placeholder: "/ 1 hour" },
          { key: "title", label: "Заголовок", type: "multiline", required: true, hint: "Enter — перенос строки на сайте." },
          { key: "description", label: "Описание", type: "textarea", required: true },
          { key: "caption", label: "Подпись внизу", type: "multiline" },
          { key: "buttonLabel", label: "Текст кнопки", type: "text", width: "half", required: true },
          { key: "buttonUrl", label: "Ссылка кнопки", type: "url", width: "half", required: true },
        ],
      },
      {
        key: "trainingPackages",
        label: "Пакеты",
        kind: "list",
        sortable: true,
        titleField: "label",
        subtitleField: "price",
        subtitlePrefix: "€",
        blank: { published: true, oldPrice: "" },
        fields: [
          { key: "label", label: "Пакет", type: "text", required: true, placeholder: "4 Personal" },
          { key: "price", label: "Цена, €", type: "money", width: "half", required: true },
          { key: "oldPrice", label: "Старая цена, €", type: "money", width: "half",
            hint: "Бейдж «SAVE» посчитается сам из разницы." },
          { key: "published", label: "Опубликовано", type: "toggle" },
        ],
      },
      {
        key: "trainingPackagesCopy",
        label: "Тексты блока пакетов",
        kind: "object",
        fields: [
          { key: "heading", label: "Заголовок", type: "multiline", required: true },
          { key: "note", label: "Примечание", type: "text" },
          { key: "buttonLabel", label: "Текст кнопки", type: "text", width: "half", required: true },
          { key: "buttonUrl", label: "Ссылка кнопки", type: "url", width: "half", required: true },
        ],
      },
    ],
  },

  {
    key: "gallery",
    label: "Галерея",
    hint: "Фотографии в карусели и их категории. Порядок можно менять стрелками.",
    groups: [
      {
        key: "galleryPhotos",
        label: "Фотографии",
        kind: "list",
        sortable: true,
        titleField: "alt",
        subtitleOptionField: "categoryId",
        thumbField: "image",
        blank: { published: true },
        fields: [
          { key: "image", label: "Фото", type: "image", folder: "gallery", required: true },
          { key: "categoryId", label: "Категория", type: "select", optionsFrom: "galleryCategories", required: true },
          { key: "alt", label: "Описание фото (alt)", type: "textarea", required: true },
          { key: "published", label: "Опубликовано", type: "toggle" },
        ],
      },
      {
        key: "galleryCategories",
        label: "Категории",
        kind: "list",
        sortable: true,
        titleField: "name",
        fields: [{ key: "name", label: "Название", type: "text", required: true }],
      },
    ],
  },

  {
    key: "journal",
    label: "Padel Journal",
    hint: "Публикации журнала и их категории.",
    groups: [
      {
        key: "journalPosts",
        label: "Публикации",
        kind: "list",
        sortable: true,
        titleField: "title",
        subtitleOptionField: "categoryId",
        thumbField: "image",
        blank: { published: false, body: "", slug: "" },
        fields: [
          { key: "title", label: "Заголовок", type: "text", required: true },
          { key: "categoryId", label: "Категория", type: "select", optionsFrom: "journalCategories", required: true },
          { key: "excerpt", label: "Краткое описание", type: "textarea", required: true },
          { key: "body", label: "Текст статьи", type: "textarea", rows: 10,
            hint: "Пока не показывается на сайте — страницы статей появятся отдельным шагом." },
          { key: "image", label: "Обложка", type: "image", folder: "journal" },
          { key: "alt", label: "Описание обложки (alt)", type: "text" },
          { key: "slug", label: "Адрес статьи", type: "text", placeholder: "создастся из заголовка",
            hint: "Латиница и дефисы. Можно оставить пустым." },
          { key: "published", label: "Опубликовано", type: "toggle" },
        ],
      },
      {
        key: "journalCategories",
        label: "Категории",
        kind: "list",
        sortable: true,
        titleField: "name",
        fields: [{ key: "name", label: "Название", type: "text", required: true }],
      },
    ],
  },

  {
    key: "seo",
    label: "SEO",
    hint: "Заголовок и описание страницы в Google и при отправке ссылки в мессенджер.",
    groups: [
      {
        key: "seoHome",
        label: "Главная страница",
        kind: "object",
        fields: [
          { key: "title", label: "SEO Title", type: "text", required: true, counter: 60,
            hint: "До 60 символов — иначе Google обрежет." },
          { key: "description", label: "Meta Description", type: "textarea", required: true, counter: 160,
            hint: "До 160 символов." },
          { key: "image", label: "Картинка для соцсетей", type: "image", folder: "seo" },
        ],
      },
    ],
  },
];

export function sectionByKey(key) {
  return sections.find((section) => section.key === key);
}
