import {
  MIN_MASTER_PASSWORD_LENGTH,
  scorePassword,
  validateConfirmPassword,
  validateEmail,
  validateMasterPassword,
} from '../src/popup/validation';

describe('validateEmail', () => {
  it('accepts a normal address', () => {
    expect(validateEmail('alice@example.com')).toBeNull();
  });

  it.each(['', 'no-at-sign', 'foo@bar', 'spaces in@example.com', 'a@b.'])(
    'rejects %p',
    (value) => {
      expect(validateEmail(value)).not.toBeNull();
    },
  );
});

describe('validateMasterPassword', () => {
  it('rejects empty input', () => {
    expect(validateMasterPassword('')).toMatch(/required/i);
  });

  it(`rejects values shorter than ${MIN_MASTER_PASSWORD_LENGTH} chars`, () => {
    expect(validateMasterPassword('a'.repeat(MIN_MASTER_PASSWORD_LENGTH - 1))).toMatch(
      /at least/i,
    );
  });

  it('accepts a sufficiently long passphrase', () => {
    expect(validateMasterPassword('a'.repeat(MIN_MASTER_PASSWORD_LENGTH))).toBeNull();
  });
});

describe('validateConfirmPassword', () => {
  it('rejects empty confirm', () => {
    expect(validateConfirmPassword('whatever1234', '')).toMatch(/confirm/i);
  });

  it('rejects mismatched values', () => {
    expect(validateConfirmPassword('whatever1234', 'whatever1235')).toMatch(
      /do not match/i,
    );
  });

  it('accepts identical values', () => {
    expect(validateConfirmPassword('whatever1234', 'whatever1234')).toBeNull();
  });
});

describe('scorePassword', () => {
  it('scores short input as weak', () => {
    expect(scorePassword('short')).toBe('weak');
  });

  it('scores a long, mixed passphrase as strong', () => {
    expect(scorePassword('Tr0ub4dor&3xample-passphrase')).toBe('strong');
  });

  it('scores a long but single-class string as fair or weak', () => {
    expect(['weak', 'fair']).toContain(scorePassword('aaaaaaaaaaaaaaaa'));
  });
});
