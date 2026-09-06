import { getFormFields } from './form-detect.js';
import { writeText, writeCheckbox, writeRadio, writeChoice } from './form-writeback.js';

const TYPE_LABELS = {
  text: 'texto',
  checkbox: 'caixa de seleção',
  radio: 'opções',
  dropdown: 'lista suspensa',
  optionlist: 'lista de opções',
  unknown: 'desconhecido'
};

export function renderFormsPanel(container, pdfLibDoc) {
  container.innerHTML = '';

  if (!pdfLibDoc) {
    return;
  }

  const fields = getFormFields(pdfLibDoc);

  if (!fields.length) {
    const empty = document.createElement('p');
    empty.className = 'forms-empty';
    empty.textContent = 'Este PDF não possui campos de formulário preenchíveis.';
    container.appendChild(empty);
    return;
  }

  const list = document.createElement('div');
  list.id = 'forms-panel-list';
  fields.forEach(({ name, type, field }) => {
    list.appendChild(buildFieldGroup(name, type, field));
  });
  container.appendChild(list);
}

function buildFieldGroup(name, type, field) {
  const group = document.createElement('div');
  group.className = 'form-field-group';

  const label = document.createElement('label');
  const nameSpan = document.createElement('span');
  nameSpan.textContent = name;
  const typeSpan = document.createElement('span');
  typeSpan.className = 'field-type';
  typeSpan.textContent = ` (${TYPE_LABELS[type] || type})`;
  label.appendChild(nameSpan);
  label.appendChild(typeSpan);
  group.appendChild(label);

  if (type === 'text') {
    const isMultiline = field.isMultiline();
    const input = document.createElement(isMultiline ? 'textarea' : 'input');
    if (!isMultiline) input.type = 'text';
    else input.rows = 3;
    input.className = 'text-input';
    input.value = field.getText() || '';
    input.addEventListener('input', () => writeText(field, input.value));
    group.appendChild(input);
  } else if (type === 'checkbox') {
    const row = document.createElement('div');
    row.className = 'checkbox-option';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = field.isChecked();
    input.addEventListener('change', () => writeCheckbox(field, input.checked));
    const span = document.createElement('span');
    span.textContent = 'Marcado';
    row.appendChild(input);
    row.appendChild(span);
    group.appendChild(row);
  } else if (type === 'radio') {
    const options = field.getOptions();
    const selected = field.getSelected();
    options.forEach((opt) => {
      const row = document.createElement('div');
      row.className = 'radio-option';
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = `radio-${name}`;
      input.checked = opt === selected;
      input.addEventListener('change', () => writeRadio(field, opt));
      const span = document.createElement('span');
      span.textContent = opt;
      row.appendChild(input);
      row.appendChild(span);
      group.appendChild(row);
    });
  } else if (type === 'dropdown' || type === 'optionlist') {
    const options = field.getOptions();
    const selected = field.getSelected();
    const isMulti = field.isMultiselect();
    const select = document.createElement('select');
    select.className = 'select-input';
    select.multiple = isMulti;
    options.forEach((opt) => {
      const optionEl = document.createElement('option');
      optionEl.value = opt;
      optionEl.textContent = opt;
      optionEl.selected = selected.includes(opt);
      select.appendChild(optionEl);
    });
    select.addEventListener('change', () => {
      const values = Array.from(select.selectedOptions).map((o) => o.value);
      writeChoice(field, values);
    });
    group.appendChild(select);
  }

  return group;
}
