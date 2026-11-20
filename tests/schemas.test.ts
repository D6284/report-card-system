import test from 'node:test';
import assert from 'node:assert/strict';
import { localStudentSchema, studentSchema } from '../lib/validations/schemas.ts';

test('student registration accepts built-in preview class and year IDs', () => {
  const result = studentSchema.safeParse({
    full_name: 'Sample Student',
    gender: 'M',
    class_id: '00000000-0000-0000-0000-0000000000b1',
    academic_year_id: '00000000-0000-0000-0000-0000000000c1',
  });

  assert.equal(result.success, true);
});

test('student registration still rejects malformed class and year IDs', () => {
  const result = studentSchema.safeParse({
    full_name: 'Sample Student',
    gender: 'M',
    class_id: 'not-a-uuid',
    academic_year_id: 'also-not-a-uuid',
  });

  assert.equal(result.success, false);
});

test('local student registration accepts local class and year identifiers', () => {
  const result = localStudentSchema.safeParse({
    full_name: 'Sample Student',
    gender: 'M',
    class_id: 'local-class-1',
    academic_year_id: 'local-year-1',
  });

  assert.equal(result.success, true);
});
