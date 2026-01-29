/**
 * Utility to convert nested objects to FormData.
 * Handles files, arrays, and nested objects recursively.
 *
 * @param obj - The object to convert
 * @param formData - Optional existing FormData instance
 * @param parentKey - Optional parent key for recursion
 * @returns Populated FormData instance
 */
export function objectToFormData(
  obj: Record<string, unknown>,
  formData: FormData = new FormData(),
  parentKey?: string
): FormData {
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const value = obj[key];
      const formKey = parentKey ? `${parentKey}[${key}]` : key;

      if (value === undefined || value === null) {
        continue;
      }

      const isFile =
        (typeof File !== 'undefined' && value instanceof File) ||
        (typeof Blob !== 'undefined' && value instanceof Blob);

      if (isFile) {
        formData.append(formKey, value as Blob);
      } else if (Array.isArray(value)) {
        value.forEach((item, index) => {
          const isItemFile =
            (typeof File !== 'undefined' && item instanceof File) ||
            (typeof Blob !== 'undefined' && item instanceof Blob);

          if (isItemFile) {
            // For array of files, we append with the same key
            // Many servers handle 'files' with multiple values
            formData.append(formKey, item as Blob);
          } else if (typeof item === 'object' && item !== null) {
            // For complex objects in array, use index syntax
            objectToFormData(item as Record<string, unknown>, formData, `${formKey}[${index}]`);
          } else {
            // Primitives in array
            formData.append(formKey, String(item));
          }
        });
      } else if (typeof value === 'object' && !(value instanceof Date)) {
        objectToFormData(value as Record<string, unknown>, formData, formKey);
      } else {
        formData.append(formKey, String(value));
      }
    }
  }
  return formData;
}
