import { editorState } from '../core/state.js';

export function writeText(field, value) {
  try {
    field.setText(value);
  } catch {
    // valor invalido para o formato do campo (ex.: comb field) - ignora silenciosamente
  }
  editorState.markDirty();
}

export function writeCheckbox(field, checked) {
  if (checked) field.check();
  else field.uncheck();
  editorState.markDirty();
}

export function writeRadio(field, value) {
  if (value) field.select(value);
  else field.clear();
  editorState.markDirty();
}

export function writeChoice(field, values) {
  if (!values.length) field.clear();
  else field.select(values, false);
  editorState.markDirty();
}
