import {
  PDFTextField,
  PDFCheckBox,
  PDFRadioGroup,
  PDFDropdown,
  PDFOptionList
} from '../../vendor/pdf-lib/pdf-lib.esm.min.js';

function classify(field) {
  if (field instanceof PDFTextField) return 'text';
  if (field instanceof PDFCheckBox) return 'checkbox';
  if (field instanceof PDFRadioGroup) return 'radio';
  if (field instanceof PDFDropdown) return 'dropdown';
  if (field instanceof PDFOptionList) return 'optionlist';
  return 'unknown';
}

export function getFormFields(pdfLibDoc) {
  const form = pdfLibDoc.getForm();
  return form.getFields().map((field) => ({
    name: field.getName(),
    type: classify(field),
    field
  }));
}
