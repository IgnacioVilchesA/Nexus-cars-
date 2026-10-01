export interface FieldErrors {
  vehicle?: string; description?: string; mileage?: string; fuel?: string; damages?: string;
  estimatedDate?: string; clientConfirmed?: string; detail?: string; amounts?: string; total?: string;
  rejectReason?: string; status?: string; name?: string; firstName?: string; firstLastName?: string; secondLastName?: string; rut?: string; approved?: string; signed?: string;
  date?: string; phone?: string; alternatePhone?: string; email?: string; consent?: string;
  owner?: string; plate?: string; brand?: string; model?: string; year?: string; photo?: string;
  [key: string]: string | undefined;
}

export const cleanText = (value: string, max: number): string => value.trim().replace(/\s+/g, ' ').slice(0, max);
export const cleanEmail = (value: string): string => cleanText(value, 150).toLowerCase();
export const cleanRut = (value: string): string => value.replace(/[^0-9kK]/g, '').toUpperCase();
export const formatRut = (value: string): string => {
  const rut = cleanRut(value); if (rut.length < 2) return rut;
  const body = rut.slice(0, -1);
  const groups: string[] = [];
  for (let index = body.length; index > 0; index -= 3) groups.unshift(body.slice(Math.max(0, index - 3), index));
  return `${groups.join('.')}-${rut.slice(-1)}`;
};
export const validRut = (value: string): boolean => {
  const rut = cleanRut(value); if (!/^\d{7,8}[0-9K]$/.test(rut)) return false;
  let sum = 0; let factor = 2;
  for (let index = rut.length - 2; index >= 0; index--) { sum += Number(rut[index]) * factor; factor = factor === 7 ? 2 : factor + 1; }
  const expected = 11 - (sum % 11); const digit = expected === 11 ? '0' : expected === 10 ? 'K' : String(expected);
  return rut.at(-1) === digit;
};
export const validFullName = (value: string): boolean => {
  const words = cleanText(value, 100).split(' ').filter(Boolean);
  return words.length >= 2 && words.every(word => /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ'’-]{2,}$/.test(word));
};
export const validNamePart = (value: string): boolean => /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ'’-]{2,}$/.test(cleanText(value, 50));
export const validChileanMobile = (value: string): boolean => /^(?:\+?56)?9\d{8}$/.test(value.replace(/[\s-]/g, ''));
export const validEmail = (value: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleanEmail(value));
export const normalizePlate = (value: string): string => value.toUpperCase().replace(/[^A-Z0-9]/g, '');
export const validPlate = (value: string, type: 'Auto' | 'Moto'): boolean => {
  const plate = normalizePlate(value);
  const letters = '[A-HJ-NPR-Z]';
  const auto = new RegExp(`^(?:${letters}{2}\\d{4}|${letters}{4}\\d{2})$`);
  const moto = new RegExp(`^(?:${letters}{2}\\d{4}|${letters}{3}\\d{2}|${letters}{2}\\d{3})$`);
  return (type === 'Auto' ? auto : moto).test(plate);
};
