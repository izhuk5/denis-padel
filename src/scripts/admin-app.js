// @ts-nocheck — project is plain JS

/* One renderer drives every admin page. It walks the groups in
   src/data/schema.js and builds lists, forms and validation from them, so a
   new field is a schema entry and nothing else.

   Edits save to Supabase automatically, per item, shortly after typing
   stops. "Опубликовать" then rebuilds the public site from the database. */

import { saveItem, removeItem, reorderGroup, uploadImage, publishSite } from "./admin-store.js";

/* ---------- tiny DOM helpers ---------- */

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);

  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined || value === false) continue;

    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key.startsWith("on")) node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === "dataset") Object.assign(node.dataset, value);
    else node.setAttribute(key, value === true ? "" : value);
  }

  for (const child of [].concat(children)) {
    if (child) node.append(child);
  }

  return node;
}

function icon(path) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.6");
  svg.setAttribute("aria-hidden", "true");

  const shape = document.createElementNS("http://www.w3.org/2000/svg", "path");
  shape.setAttribute("d", path);
  svg.append(shape);

  return svg;
}

const ICONS = {
  up: "M8 13V3M3 8l5-5 5 5",
  down: "M8 3v10M13 8l-5 5-5-5",
  trash: "M2 4h12M6 4V2h4v2M4 4l1 10h6l1-10",
  plus: "M8 3v10M3 8h10",
};

const isUuid = (value) => /^[0-9a-f-]{36}$/i.test(String(value));

/* ---------- state ---------- */

const state = {
  section: null,
  data: {},
  open: new Set(),
  pending: new Map(), // item key -> timeout
  inFlight: 0,
  lastError: null,
};

/* ---------- status bar ---------- */

function setStatus(kind, message) {
  const bar = document.querySelector("[data-admin-status]");
  if (!bar) return;

  bar.textContent = message;
  bar.className = `admin-status is-${kind}`;
}

function refreshStatus() {
  if (state.lastError) {
    setStatus("error", `Не сохранено: ${state.lastError}`);
  } else if (state.pending.size || state.inFlight) {
    setStatus("saving", "Сохранение…");
  } else {
    setStatus("ok", "Все изменения сохранены. На сайте они появятся после «Опубликовать».");
  }
}

/* ---------- validation ---------- */

function isEmpty(field, value) {
  if (field.type === "money") return value === "" || value === null || Number.isNaN(Number(value));
  if (field.type === "image") return !value;
  if (field.type === "select") return !value;
  return !String(value ?? "").trim();
}

function missingFields(group, item) {
  return group.fields.filter((field) => field.required && isEmpty(field, item[field.key]));
}

/* ---------- saving ---------- */

function itemKey(group, item) {
  return `${group.key}:${item.id ?? "singleton"}`;
}

function scheduleSave(group, item, { immediate = false } = {}) {
  const key = itemKey(group, item);
  clearTimeout(state.pending.get(key));

  const missing = missingFields(group, item);
  if (missing.length) {
    state.pending.delete(key);
    setStatus("warn", `Заполните: ${missing.map((field) => field.label).join(", ")} — до этого запись не сохранится.`);
    return;
  }

  /* Debounced so typing a sentence is one save, not forty. */
  state.pending.set(
    key,
    setTimeout(() => runSave(group, item, key), immediate ? 0 : 700),
  );
  refreshStatus();
}

async function runSave(group, item, key) {
  state.pending.delete(key);
  state.inFlight += 1;
  refreshStatus();

  const persistedId = group.kind === "object" ? null : isUuid(item.id) ? item.id : null;
  const { id: _ignored, ...payload } = item;

  try {
    const saved = await saveItem(group.key, persistedId, payload);
    state.lastError = null;

    /* A new row just got its real id. Swap it in place so later saves
       update this row instead of inserting another. */
    if (group.kind === "list" && item.id !== saved.id) {
      if (state.open.has(item.id)) {
        state.open.delete(item.id);
        state.open.add(saved.id);
      }
      item.id = saved.id;
    }

    /* Server-side side effects the form cannot know about. */
    if (group.exclusiveFlag && item[group.exclusiveFlag]) {
      for (const other of state.data[group.key]) {
        if (other !== item) other[group.exclusiveFlag] = false;
      }
    }

    if (group.key.endsWith("Categories")) refreshCategoryOptions(group.key);
  } catch (error) {
    state.lastError = error.message;
  } finally {
    state.inFlight -= 1;
    refreshStatus();
  }
}

/* ---------- field inputs ---------- */

function fieldWrapper(field, control, value) {
  const parts = [
    el("span", { class: "af-label", text: field.required ? `${field.label} *` : field.label }),
  ];

  if (field.counter) {
    const used = String(value ?? "").length;
    parts.push(
      el("span", {
        class: `af-counter${used > field.counter ? " is-over" : ""}`,
        text: `${used} / ${field.counter}`,
      }),
    );
  }

  return el("label", { class: `af-field af-${field.width ?? "full"}` }, [
    el("span", { class: "af-label-row" }, parts),
    control,
    field.hint ? el("span", { class: "af-hint", text: field.hint }) : null,
  ]);
}

function renderInput(field, value, onChange) {
  const invalid = field.required && isEmpty(field, value);

  const onInput = (event) => {
    const raw = event.target.value;
    const next = field.type === "money" ? (raw === "" ? "" : Number(raw)) : raw;

    event.target.classList.toggle("is-invalid", Boolean(field.required && isEmpty(field, next)));

    if (field.counter) {
      const counter = event.target.closest(".af-field")?.querySelector(".af-counter");
      if (counter) {
        counter.textContent = `${raw.length} / ${field.counter}`;
        counter.classList.toggle("is-over", raw.length > field.counter);
      }
    }

    onChange(next);
  };

  const shared = {
    class: `af-input${invalid ? " is-invalid" : ""}`,
    placeholder: field.placeholder ?? "",
    oninput: onInput,
  };

  if (field.type === "textarea" || field.type === "multiline") {
    const area = el("textarea", { ...shared, rows: field.rows ?? (field.type === "multiline" ? 2 : 3) });
    area.value = value ?? "";
    return fieldWrapper(field, area, value);
  }

  if (field.type === "toggle") {
    const input = el("input", {
      type: "checkbox",
      class: "af-toggle-input",
      onchange: (event) => onChange(event.target.checked),
    });
    input.checked = Boolean(value);

    return el("label", { class: "af-field af-full af-toggle" }, [
      input,
      el("span", { class: "af-toggle-track" }, el("span", { class: "af-toggle-thumb" })),
      el("span", { class: "af-toggle-label", text: field.label }),
    ]);
  }

  if (field.type === "select") {
    const select = el("select", {
      class: `af-input${invalid ? " is-invalid" : ""}`,
      dataset: { optionsFrom: field.optionsFrom },
      onchange: (event) => {
        event.target.classList.toggle("is-invalid", Boolean(field.required && !event.target.value));
        onChange(event.target.value);
      },
    });
    fillOptions(select, field.optionsFrom, value);
    return fieldWrapper(field, select, value);
  }

  if (field.type === "image") {
    return fieldWrapper(field, renderImageField(field, value, onChange), value);
  }

  const type = { date: "date", money: "number" }[field.type] ?? "text";
  const input = el("input", {
    ...shared,
    type,
    step: field.type === "money" ? "0.01" : null,
    min: field.type === "money" ? "0" : null,
    inputmode: field.type === "money" ? "decimal" : null,
  });
  input.value = value ?? "";
  return fieldWrapper(field, input, value);
}

function categoryName(groupKey, id) {
  return (state.data[groupKey] ?? []).find((option) => option.id === id)?.name ?? "";
}

function fillOptions(select, groupKey, value) {
  const options = (state.data[groupKey] ?? []).filter((option) => isUuid(option.id));
  const current = value ?? select.value;

  select.replaceChildren(
    el("option", { value: "", text: options.length ? "— выберите —" : "Сначала создайте категорию" }),
    ...options.map((option) => el("option", { value: option.id, text: option.name || "Без названия" })),
  );
  select.value = options.some((option) => option.id === current) ? current : "";
}

/* Categories are edited on the same page as the items that use them. When
   one is renamed or added, every open dropdown picks it up without a reload —
   and without re-rendering the forms, which would steal focus mid-typing. */
function refreshCategoryOptions(groupKey) {
  document.querySelectorAll(`select[data-options-from="${groupKey}"]`).forEach((select) => {
    fillOptions(select, groupKey, select.value);
  });
}

function renderImageField(field, value, onChange) {
  const preview = el("div", { class: "af-upload-preview" });
  const note = el("span", { class: "af-hint" });

  const drawPreview = (image) => {
    preview.replaceChildren(
      image?.url
        ? el("img", { src: image.url, alt: "", loading: "lazy" })
        : el("span", { class: "af-upload-empty", text: "Нет изображения" }),
    );
    removeButton.hidden = !image;
  };

  const fileInput = el("input", {
    type: "file",
    accept: "image/jpeg,image/png,image/webp,image/avif",
    class: "af-upload-input",
    onchange: async (event) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;

      pickButton.disabled = true;
      note.textContent = "Загрузка…";

      try {
        const uploaded = await uploadImage(field.folder, file);
        drawPreview(uploaded);
        note.textContent = `${uploaded.width} × ${uploaded.height}`;
        onChange(uploaded);
      } catch (error) {
        note.textContent = error.message;
      } finally {
        pickButton.disabled = false;
      }
    },
  });

  const pickButton = el(
    "button",
    { type: "button", class: "admin-btn admin-btn-ghost", onclick: () => fileInput.click() },
    [el("span", { text: "Загрузить фото" })],
  );

  const removeButton = el("button", {
    type: "button",
    class: "admin-btn admin-btn-ghost af-danger-text",
    text: "Убрать",
    onclick: () => {
      drawPreview(null);
      note.textContent = "";
      onChange(null);
    },
  });

  drawPreview(value);

  /* A div, not the label's own control: clicking anywhere in a <label> would
     otherwise re-open the file picker. */
  return el("div", { class: "af-upload", onclick: (event) => event.preventDefault() }, [
    preview,
    el("div", { class: "af-upload-actions" }, [
      pickButton,
      removeButton,
      fileInput,
      note,
    ]),
  ]);
}

/* Label/value pairs, e.g. the tournament details. */
function renderPairs(field, list, onChange) {
  const body = el("div", { class: "af-pairs" });

  const draw = () => {
    body.replaceChildren();

    list.forEach((pair, i) => {
      body.append(
        el("div", { class: "af-pair" }, [
          renderInput({ key: "label", label: field.pairLabels.key, type: "text", required: true }, pair.label, (next) => {
            pair.label = next;
            onChange(list);
          }),
          renderInput({ key: "value", label: field.pairLabels.value, type: "text", required: true }, pair.value, (next) => {
            pair.value = next;
            onChange(list);
          }),
          el(
            "button",
            {
              type: "button",
              class: "af-icon-btn af-danger",
              title: "Удалить строку",
              onclick: () => {
                list.splice(i, 1);
                onChange(list);
                draw();
              },
            },
            [icon(ICONS.trash)],
          ),
        ]),
      );
    });

    body.append(
      el(
        "button",
        {
          type: "button",
          class: "af-add-row",
          onclick: () => {
            list.push({ label: "", value: "" });
            draw();
          },
        },
        [icon(ICONS.plus), el("span", { text: "Добавить строку" })],
      ),
    );
  };

  draw();

  return el("div", { class: "af-field af-full" }, [el("span", { class: "af-label", text: field.label }), body]);
}

function renderForm(group, item, onFieldChange) {
  const form = el("div", { class: "af-form" });

  for (const field of group.fields) {
    if (field.type === "pairs") {
      item[field.key] ??= [];
      /* A pair row with an empty half is not saved yet — the server rejects
         it — so saves wait until every row is complete. */
      form.append(
        renderPairs(field, item[field.key], (list) => {
          if (list.every((pair) => pair.label.trim() && pair.value.trim())) onFieldChange(field);
        }),
      );
    } else {
      form.append(
        renderInput(field, item[field.key], (next) => {
          item[field.key] = next;
          onFieldChange(field);
        }),
      );
    }
  }

  return form;
}

/* ---------- list rendering ---------- */

function summaryFor(group, item) {
  const title = String(item[group.titleField] ?? "").split("\n").join(" ").trim() || "Без названия";

  let subtitle = "";
  if (group.subtitleOptionField) {
    const option = group.fields.find((field) => field.key === group.subtitleOptionField);
    subtitle = categoryName(option.optionsFrom, item[group.subtitleOptionField]);
  } else if (group.subtitleField) {
    const raw = item[group.subtitleField];
    subtitle = raw === "" || raw == null ? "" : `${group.subtitlePrefix ?? ""}${raw}`;
  }

  return { title, subtitle };
}

function renderList(group) {
  const list = state.data[group.key];
  const wrap = el("div", { class: "af-list" });

  if (group.openAll) list.forEach((item) => state.open.add(item.id));

  const persistOrder = async () => {
    const ids = list.map((item) => item.id).filter(isUuid);

    state.inFlight += 1;
    refreshStatus();

    try {
      await reorderGroup(group.key, ids);
      state.lastError = null;
    } catch (error) {
      state.lastError = error.message;
    } finally {
      state.inFlight -= 1;
      refreshStatus();
    }
  };

  const draw = () => {
    wrap.replaceChildren();

    list.forEach((item, index) => {
      const isOpen = state.open.has(item.id);
      const { title, subtitle } = summaryFor(group, item);
      const controls = [];

      if (group.sortable) {
        const move = (to) => (event) => {
          event.stopPropagation();
          list.splice(to, 0, list.splice(index, 1)[0]);
          draw();
          persistOrder();
        };

        controls.push(
          el("button", { type: "button", class: "af-icon-btn", title: "Выше", disabled: index === 0, onclick: move(index - 1) }, [icon(ICONS.up)]),
          el("button", { type: "button", class: "af-icon-btn", title: "Ниже", disabled: index === list.length - 1, onclick: move(index + 1) }, [icon(ICONS.down)]),
        );
      }

      if (!group.fixed) {
        controls.push(
          el(
            "button",
            {
              type: "button",
              class: "af-icon-btn af-danger",
              title: "Удалить",
              onclick: async (event) => {
                event.stopPropagation();
                if (!confirm(`Удалить «${title}»? Это действие нельзя отменить.`)) return;

                clearTimeout(state.pending.get(itemKey(group, item)));
                state.pending.delete(itemKey(group, item));

                if (isUuid(item.id)) {
                  try {
                    await removeItem(group.key, item.id);
                  } catch (error) {
                    alert(error.message);
                    return;
                  }
                }

                list.splice(list.indexOf(item), 1);
                if (group.key.endsWith("Categories")) refreshCategoryOptions(group.key);
                refreshStatus();
                draw();
              },
            },
            [icon(ICONS.trash)],
          ),
        );
      }

      const thumbUrl = group.thumbField ? item[group.thumbField]?.url : null;

      const header = el(
        "button",
        {
          type: "button",
          class: "af-item-head",
          "aria-expanded": isOpen ? "true" : "false",
          onclick: () => {
            if (state.open.has(item.id)) state.open.delete(item.id);
            else state.open.add(item.id);
            draw();
          },
        },
        [
          thumbUrl ? el("img", { class: "af-thumb", src: thumbUrl, alt: "", loading: "lazy" }) : null,
          el("span", { class: "af-item-titles" }, [
            el("span", { class: "af-item-title", text: title }),
            subtitle ? el("span", { class: "af-item-sub", text: subtitle }) : null,
          ]),
          "published" in item && !item.published ? el("span", { class: "af-badge af-badge-muted", text: "Черновик" }) : null,
          group.exclusiveFlag && item[group.exclusiveFlag] ? el("span", { class: "af-badge", text: "На сайте" }) : null,
          el("span", { class: `af-chevron${isOpen ? " is-open" : ""}` }, [icon(ICONS.down)]),
        ],
      );

      const itemEl = el("div", { class: `af-item${isOpen ? " is-open" : ""}` }, [
        el("div", { class: "af-item-bar" }, [header, el("div", { class: "af-item-controls" }, controls)]),
      ]);

      if (isOpen) {
        itemEl.append(
          renderForm(group, item, (field) => {
            const summary = summaryFor(group, item);
            const titleNode = itemEl.querySelector(".af-item-title");
            if (titleNode) titleNode.textContent = summary.title;

            /* Flags change badges on other rows, so those need a redraw —
               and a toggle is a click, not typing, so nothing loses focus. */
            if (field.type === "toggle") {
              if (field.key === group.exclusiveFlag && item[field.key]) {
                list.forEach((other) => {
                  if (other !== item) other[field.key] = false;
                });
              }
              scheduleSave(group, item, { immediate: true });
              draw();
              return;
            }

            scheduleSave(group, item, { immediate: field.type === "image" || field.type === "select" });
          }),
        );
      }

      wrap.append(itemEl);
    });

    if (!group.fixed) {
      wrap.append(
        el(
          "button",
          {
            type: "button",
            class: "af-add",
            onclick: () => {
              const blank = { id: `new-${Date.now().toString(36)}`, ...structuredClone(group.blank ?? {}) };
              group.fields.forEach((field) => {
                if (!(field.key in blank)) {
                  blank[field.key] = field.type === "toggle" ? false : field.type === "pairs" ? [] : field.type === "image" ? null : "";
                }
              });
              list.push(blank);
              state.open.add(blank.id);
              draw();
            },
          },
          [icon(ICONS.plus), el("span", { text: "Добавить" })],
        ),
      );
    }
  };

  draw();
  return wrap;
}

function renderObject(group) {
  state.data[group.key] ??= {};
  const item = state.data[group.key];

  return renderForm(group, item, (field) => {
    scheduleSave(group, item, { immediate: field.type === "image" });
  });
}

/* ---------- mount ---------- */

export function mountAdmin({ root, section, data }) {
  state.section = section;
  state.data = data;

  const body = el("div", { class: "af-body" });

  for (const group of section.groups) {
    const groupEl = el("section", { class: "af-group" }, [
      group.label ? el("h2", { class: "af-group-title", text: group.label }) : null,
    ]);

    groupEl.append(group.kind === "list" ? renderList(group) : renderObject(group));
    body.append(groupEl);
  }

  root.replaceChildren(body);

  const publishButton = document.querySelector("[data-admin-publish]");

  publishButton?.addEventListener("click", async () => {
    if (state.pending.size || state.inFlight) {
      alert("Подождите, пока сохранятся последние изменения.");
      return;
    }

    publishButton.disabled = true;

    try {
      await publishSite();
      setStatus("ok", "Сайт пересобирается — изменения появятся на нём через 1–2 минуты.");
    } catch (error) {
      setStatus("error", error.message);
    } finally {
      publishButton.disabled = false;
    }
  });

  /* Leaving with an unsent save would silently drop the last edit. */
  window.addEventListener("beforeunload", (event) => {
    if (state.pending.size || state.inFlight) event.preventDefault();
  });

  refreshStatus();
}
