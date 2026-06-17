function cleanDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function cleanCuit(value) {
  return cleanDigits(value);
}

function isValidCuit(value) {
  const cuit = cleanCuit(value);

  if (!/^\d{11}$/.test(cuit)) {
    return false;
  }

  const multipliers = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const digits = cuit.split('').map(Number);

  const sum = multipliers.reduce((acc, multiplier, index) => {
    return acc + digits[index] * multiplier;
  }, 0);

  const mod = sum % 11;
  const expectedDigit = mod === 0 ? 0 : mod === 1 ? 9 : 11 - mod;

  return expectedDigit === digits[10];
}

function assertValidCuit(value, fieldName = 'CUIT') {
  const cuit = cleanCuit(value);

  if (!isValidCuit(cuit)) {
    throw new Error(`${fieldName} inválido: ${value}`);
  }

  return cuit;
}

function isValidDni(value) {
  const dni = cleanDigits(value);
  return /^\d{7,8}$/.test(dni);
}

function assertValidDni(value, fieldName = 'DNI') {
  const dni = cleanDigits(value);

  if (!isValidDni(dni)) {
    throw new Error(`${fieldName} inválido: ${value}`);
  }

  return dni;
}

function getDniFromCuitOrCuil(value) {
  const cuit = cleanCuit(value);

  if (!/^\d{11}$/.test(cuit)) {
    return null;
  }

  const dni = cuit.slice(2, 10).replace(/^0+/, '');
  return dni || cuit.slice(2, 10);
}

function calculateCuitFromDniAndPrefix(dniInput, prefix) {
  const dni = cleanDigits(dniInput).padStart(8, '0');

  if (!/^\d{8}$/.test(dni)) {
    return null;
  }

  const base = `${prefix}${dni}`;
  const multipliers = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const digits = base.split('').map(Number);

  const sum = multipliers.reduce((acc, multiplier, index) => {
    return acc + digits[index] * multiplier;
  }, 0);

  const mod = sum % 11;
  let verifier = 11 - mod;

  if (verifier === 11) verifier = 0;
  if (verifier === 10) return null;

  return `${base}${verifier}`;
}

function getCuitCandidatesFromDni(dniInput) {
  const dni = assertValidDni(dniInput);
  const prefixes = ['20', '27', '23', '24'];
  const candidates = [];

  for (const prefix of prefixes) {
    const cuit = calculateCuitFromDniAndPrefix(dni, prefix);

    if (cuit && isValidCuit(cuit) && !candidates.includes(cuit)) {
      candidates.push(cuit);
    }
  }

  return candidates;
}

module.exports = {
  cleanDigits,
  cleanCuit,
  isValidCuit,
  assertValidCuit,
  isValidDni,
  assertValidDni,
  getDniFromCuitOrCuil,
  calculateCuitFromDniAndPrefix,
  getCuitCandidatesFromDni
};