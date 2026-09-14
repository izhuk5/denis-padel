// @ts-nocheck — project is plain JS

/* One renderer drives every admin section. It walks the schema in
   src/data/schema.js and builds the list, the forms and the validation from
   it, so a new field is a schema entry and nothing else. */

import {
  initStore,
  load,
  save,
  discardDraft,
  hasUnpublishedChanges,
  changedSections,
  publish,
  makeId,
} from "./admin-store.js";

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

/* ---------- state ---------- */

let state = {
  data: null,
  section: null,
  imageChoices: [],
  root: null,
  open: new Set(),
};

let saveTimer = null;

function commit() {
  clearTimeout(saveTimer);
  /* Debounced so typing does not hit localStorage on every keystroke. */
  saveTimer = setTimeout(() => save(state.data), 250);
  renderStatus();
}

/* ---------- field inputs ---------- */

function fieldWrapper(field, control, value) {
  const parts = [el("span", { class: "af-label", text: field.label })];

  if (field.counter) {
    const used = String(value ?? "").length;
    parts.push(
      el("span", {
        class: `af-counter${used > field.counter ? " is-over" : ""}`,
        text: `${used} / ${field.counter}`,
        dataset: { counterFor: field.key },
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
  const invalid = field.required && !String(value ?? "").trim();
  const shared = {
    class: `af-input${invalid ? " is-invalid" : ""}`,
    placeholder: field.placeholder ?? "",
    oninput: (event) => {
      const next = event.target.value;
      event.target.classList.toggle("is-invalid", field.required && !next.trim());

      if (field.counter) {
        const counter = event.target
          .closest(".af-field")
          ?.querySelector(`[data-counter-for="${field.key}"]`);
        if (counter) {
          counter.textContent = `${next.length} / ${field.counter}`;
          counter.classList.toggle("is-over", next.length > field.counter);
        }
      }

      onChange(next);
    },
  };

  if (field.type === "textarea" || field.type === "multiline") {
    const area = el("textarea", { ...shared, rows: field.type === "multiline" ? 2 : 3 });
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

  if (field.type === "image") {
    return fieldWrapper(field, renderImagePicker(value, onChange), value);
  }

  const input = el("input", { ...shared, type: field.type === "url" ? "text" : "text" });
  input.value = value ?? "";
  return fieldWrapper(field, input, value);
}

function renderImagePicker(value, onChange) {
  const grid = el("div", { class: "af-images" });

  for (const choice of state.imageChoices) {
    const button = el(
      "button",
      {
        type: "button",
        class: `af-image${choice.name === value ? " is-selected" : ""}`,
        title: choice.name,
        onclick: () => {
          grid.querySelectorAll(".af-image").forEach((node) => node.classList.remove("is-selected"));
          button.classList.add("is-selected");
          onChange(choice.name);
        },
      },
      [el("img", { src: choice.src, alt: "", loading: "lazy" })],
    );

    grid.append(button);
  }

  return el("div", { class: "af-image-picker" }, [
    grid,
    el("p", {
      class: "af-hint",
      text: "Загрузка новых файлов появится вместе с базой данных. Пока — выбор из уже загруженных.",
    }),
  ]);
}

/* Label/value pairs, e.g. the tournament meta table. */
function renderPairs(field, list, onChange) {
  const body = el("div", { class: "af-pairs" });

  const draw = () => {
    body.replaceChildren();

    list.forEach((pair, i) => {
      body.append(
        el("div", { class: "af-pair" }, [
          renderInput(
            { key: `${field.key}-label-${i}`, label: field.pairLabels.key, type: "text", required: true },
            pair.label,
            (next) => {
              pair.label = next;
              onChange(list);
            },
          ),
          renderInput(
            { key: `${field.key}-value-${i}`, label: field.pairLabels.value, type: "text", required: true },
            pair.value,
            (next) => {
              pair.value = next;
              onChange(list);
            },
          ),
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
            onChange(list);
            draw();
          },
        },
        [icon(ICONS.plus), el("span", { text: "Добавить строку" })],
      ),
    );
  };

  draw();

  return el("div", { class: "af-field af-full" }, [
    el("span", { class: "af-label", text: field.label }),
    body,
  ]);
}

/* A fixed-shape table, e.g. the pricing packages. */
function renderRows(field, list, onChange) {
  const body = el("div", { class: "af-rows" });

  const draw = () => {
    body.replaceChildren();

    list.forEach((row, i) => {
      const cells = field.rowFields.map((rowField) =>
        renderInput({ ...rowField, key: `${field.key}-${rowField.key}-${i}` }, row[rowField.key], (next) => {
          row[rowField.key] = next;
          onChange(list);
        }),
      );

      cells.push(
        el(
          "button",
          {
            type: "button",
            class: "af-icon-btn af-danger",
            title: "Удалить пакет",
            onclick: () => {
              list.splice(i, 1);
              onChange(list);
              draw();
            },
          },
          [icon(ICONS.trash)],
        ),
      );

      body.append(el("div", { class: "af-row" }, cells));
    });

    body.append(
      el(
        "button",
        {
          type: "button",
          class: "af-add-row",
          onclick: () => {
            const blank = { id: makeId("pkg") };
            field.rowFields.forEach((rowField) => (blank[rowField.key] = ""));
            list.push(blank);
            onChange(list);
            draw();
          },
        },
        [icon(ICONS.plus), el("span", { text: "Добавить пакет" })],
      ),
    );
  };

  draw();

  return el("div", { class: "af-field af-full" }, [
    el("span", { class: "af-label", text: field.label }),
    body,
  ]);
}

function renderForm(fields, item, onChange) {
  const form = el("div", { class: "af-form" });

  for (const field of fields) {
    if (field.type === "pairs") {
      form.append(renderPairs(field, item[field.key] ?? [], () => onChange()));
    } else if (field.type === "rows") {
      form.append(renderRows(field, item[field.key] ?? [], () => onChange()));
    } else {
      form.append(
        renderInput(field, item[field.key], (next) => {
          item[field.key] = next;
          onChange(field);
        }),
      );
    }
  }

  return form;
}

/* ---------- list rendering ---------- */

function thumbFor(section, item) {
  if (!section.thumbField) return null;

  const choice = state.imageChoices.find((image) => image.name === item[section.thumbField]);
  return choice ? el("img", { class: "af-thumb", src: choice.src, alt: "", loading: "lazy" }) : null;
}

function renderList(section, list, { fixed = false } = {}) {
  const wrap = el("div", { class: "af-list" });

  const draw = () => {
    wrap.replaceChildren();

    list.forEach((item, index) => {
      const itemId = item.id ?? `${section.key}-${index}`;
      const isOpen = state.open.has(itemId);

      const summaryText = String(item[section.titleField] ?? "").split("\n").join(" ") || "Без названия";
      const subtitle = section.subtitleField ? String(item[section.subtitleField] ?? "") : "";

      const controls = [];

      if (section.sortable) {
        controls.push(
          el(
            "button",
            {
              type: "button",
              class: "af-icon-btn",
              title: "Выше",
              disabled: index === 0,
              onclick: (event) => {
                event.stopPropagation();
                list.splice(index - 1, 0, list.splice(index, 1)[0]);
                commit();
                draw();
              },
            },
            [icon(ICONS.up)],
          ),
          el(
            "button",
            {
              type: "button",
              class: "af-icon-btn",
              title: "Ниже",
              disabled: index === list.length - 1,
              onclick: (event) => {
                event.stopPropagation();
                list.splice(index + 1, 0, list.splice(index, 1)[0]);
                commit();
                draw();
              },
            },
            [icon(ICONS.down)],
          ),
        );
      }

      if (!fixed) {
        controls.push(
          el(
            "button",
            {
              type: "button",
              class: "af-icon-btn af-danger",
              title: "Удалить",
              onclick: (event) => {
                event.stopPropagation();
                if (!confirm(`Удалить «${summaryText}»? Это действие нельзя отменить.`)) return;
                list.splice(index, 1);
                commit();
                draw();
              },
            },
            [icon(ICONS.trash)],
          ),
        );
      }

      const header = el(
        "button",
        {
          type: "button",
          class: "af-item-head",
          "aria-expanded": isOpen ? "true" : "false",
          onclick: () => {
            if (state.open.has(itemId)) state.open.delete(itemId);
            else state.open.add(itemId);
            draw();
          },
        },
        [
          thumbFor(section, item),
          el("span", { class: "af-item-titles" }, [
            el("span", { class: "af-item-title", text: summaryText }),
            subtitle ? el("span", { class: "af-item-sub", text: subtitle }) : null,
          ]),
          section.exclusiveFlag && item[section.exclusiveFlag]
            ? el("span", { class: "af-badge", text: "На сайте" })
            : null,
          el("span", { class: `af-chevron${isOpen ? " is-open" : ""}` }, [icon(ICONS.down)]),
        ],
      );

      const body = isOpen
        ? renderForm(section.fields, item, (field) => {
            /* Only one item can carry the exclusive flag, so turning it on
               anywhere turns it off everywhere else. */
            if (field && field.key === section.exclusiveFlag && item[section.exclusiveFlag]) {
              list.forEach((other) => {
                if (other !== item) other[section.exclusiveFlag] = false;
              });
              commit();
              draw();
              return;
            }

            const title = wrap.querySelectorAll(".af-item-title")[index];
            if (title) title.textContent = String(item[section.titleField] ?? "") || "Без названия";
            commit();
          })
        : null;

      wrap.append(
        el("div", { class: `af-item${isOpen ? " is-open" : ""}` }, [
          el("div", { class: "af-item-bar" }, [header, el("div", { class: "af-item-controls" }, controls)]),
          body,
        ]),
      );
    });

    if (!fixed) {
      wrap.append(
        el(
          "button",
          {
            type: "button",
            class: "af-add",
            onclick: () => {
              const blank = { id: makeId(section.key.slice(0, 3)) };
              section.fields.forEach((field) => {
                blank[field.key] =
                  field.type === "toggle" ? false : field.type === "pairs" ? [] : "";
              });
              list.push(blank);
              state.open.add(blank.id);
              commit();
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

/* ---------- status bar ---------- */

function renderStatus() {
  const bar = document.querySelector("[data-admin-status]");
  if (!bar) return;

  const dirty = hasUnpublishedChanges(state.data);
  bar.textContent = dirty
    ? "Есть несохранённые на сайте изменения — нажмите «Выгрузить content.json»."
    : "Всё совпадает с тем, что опубликовано на сайте.";
  bar.classList.toggle("is-dirty", dirty);

  document.querySelectorAll("[data-nav-section]").forEach((link) => {
    link.classList.toggle(
      "is-changed",
      changedSections(state.data).includes(link.dataset.navSection),
    );
  });
}

/* ---------- mount ---------- */

export function mountAdmin({ root, sectionKey, schema, baseline, imageChoices }) {
  initStore(baseline);

  state = {
    data: load(),
    section: schema.find((section) => section.key === sectionKey),
    imageChoices,
    root,
    open: new Set(),
  };

  const section = state.section;
  const body = el("div", { class: "af-body" });

  if (section.kind === "list") {
    const list = state.data[section.key];
    /* Nothing is expanded by default except a lone item, which would
       otherwise need a pointless extra click. */
    if (list.length === 1) state.open.add(list[0].id ?? `${section.key}-0`);
    body.append(renderList(section, list));
  } else {
    for (const group of section.groups) {
      const value = state.data[section.key][group.key];

      const groupEl = el("section", { class: "af-group" }, [
        el("h2", { class: "af-group-title", text: group.label }),
      ]);

      if (group.kind === "list") {
        value.forEach((item) => state.open.add(item.id));
        groupEl.append(renderList({ ...group, key: `${section.key}-${group.key}` }, value, { fixed: group.fixed }));
      } else {
        groupEl.append(renderForm(group.fields, value, () => commit()));
      }

      body.append(groupEl);
    }
  }

  root.replaceChildren(body);

  document.querySelector("[data-admin-publish]")?.addEventListener("click", () => {
    publish(state.data);
  });

  document.querySelector("[data-admin-reset]")?.addEventListener("click", () => {
    if (!confirm("Отменить все несохранённые изменения и вернуть то, что сейчас на сайте?")) return;
    discardDraft();
    location.reload();
  });

  renderStatus();
}
