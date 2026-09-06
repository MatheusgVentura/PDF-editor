import { getFormFields } from './form-detect.js';
import { writeText, writeCheckbox, writeRadio, writeChoice } from './form-writeback.js';
import { icons } from '../ui/icons.js';

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
    const empty = document.createElement('div');
    empty.className = 'forms-empty';
    empty.innerHTML = `${icons.filePlus}<h3>Nenhum campo encontrado</h3><p>Este PDF não tem campos preenchíveis. Para escrever sobre a página, use a aba <strong>Adicionar conteúdo</strong>.</p>`;
    container.appendChild(empty);
    return;
  }

  const list = document.createElement('div');
  list.id = 'forms-panel-list';
  fields.forEach(({ name, type, field }, index) => {
    list.appendChild(buildFieldGroup(name, type, field, index));
  });
  container.appendChild(list);
}

function buildFieldGroup(name, type, field, index) {
  const group = document.createElement('div');
  group.className = 'form-field-group';

  const label = document.createElement('label');
  label.id = `form-label-${index}`;
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
      const row = document.createElement('label');
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

  const controls = group.querySelectorAll('input, textarea, select');
  controls.forEach((control, controlIndex) => {
    control.id = `form-input-${index}-${controlIndex}`;
    if (control.type !== 'radio') control.setAttribute('aria-labelledby', label.id);
  });
  if (controls.length === 1) label.htmlFor = controls[0].id;
  return group;
}
