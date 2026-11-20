import { z } from 'zod';

const uuid = z.string().regex(/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i, 'Invalid uuid');
export const classSchema = z.object({ name: z.string().trim().min(1).max(60), stream: z.string().trim().max(20).optional() });
export const nameSchema = z.object({ name: z.string().trim().min(1).max(80), display_order: z.coerce.number().int().min(0).default(0) });
export const subjectSchema = z.object({ name: z.string().trim().min(1).max(80), code: z.string().trim().max(20).optional() });
export const classSubjectSchema = z.object({
  class_id: uuid, academic_year_id: uuid, subject_id: uuid, group_id: uuid.optional(),
  coefficient: z.coerce.number().gt(0).max(20), max_mark: z.coerce.number().gt(0).max(100).default(20),
});
export const studentSchema = z.object({
  full_name: z.string().trim().min(2).max(120), admission_no: z.string().trim().max(40).optional(),
  gender: z.enum(['M', 'F']), date_of_birth: z.string().optional(), place_of_birth: z.string().trim().max(80).optional(),
  guardian_name: z.string().trim().max(120).optional(), guardian_phone: z.string().trim().max(30).optional(),
  class_id: uuid, academic_year_id: uuid,
});
export const localStudentSchema = studentSchema.extend({
  class_id: z.string().trim().min(1, 'Select a class'),
  academic_year_id: z.string().trim().min(1, 'Select an academic year'),
});
export const yearSchema = z.object({
  name: z.string().trim().regex(/^\d{4}\/\d{4}$/, 'Use format 2026/2027'),
  starts_on: z.string().optional(), ends_on: z.string().optional(),
});
export const teacherSchema = z.object({
  full_name: z.string().trim().min(2).max(120), email: z.string().email(), password: z.string().min(8).max(72),
});
export const assignSchema = z.object({ class_subject_id: uuid, teacher_id: uuid });
export const classTeacherSchema = z.object({ class_id: uuid, teacher_id: uuid });
export const reviewSchema = z.object({ submission_id: uuid, decision: z.enum(['approved', 'rejected']), reason: z.string().trim().max(500).optional() });
export const schoolSettingsSchema = z.object({
  name: z.string().trim().min(1).max(120),
  location: z.string().trim().max(120).optional(),
  address: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(40).optional(),
  email: z.string().trim().email().max(120).optional(),
  website: z.string().trim().url().max(200).optional(),
  motto: z.string().trim().max(160).optional(),
  passing_average: z.coerce.number().min(0).max(100),
  default_max_mark: z.coerce.number().gt(0).max(100).default(20),
  ranking_policy: z.enum(['competition']).default('competition'),
  report_footer: z.string().trim().max(500).optional(),
});
export const decisionSchema = z.object({
  enrollment_id: uuid,
  decision: z.enum(['passed', 'failed', 'conditional', 'under_review']),
  reason: z.string().trim().max(500).optional(),
});
export const gradingRuleSchema = z.object({
  min_avg: z.coerce.number().min(0).max(100),
  max_avg: z.coerce.number().min(0).max(100),
  grade: z.string().trim().min(1).max(10),
  remark: z.string().trim().max(120).optional(),
  display_order: z.coerce.number().int().min(0).default(0),
}).refine((v) => v.max_avg >= v.min_avg, { message: 'Maximum must be greater than or equal to minimum', path: ['max_avg'] });
export const marksSchema = z.object({
  class_subject_id: uuid, sequence_id: uuid,
  entries: z.array(z.object({ enrollment_id: uuid, state: z.enum(['entered', 'missing', 'not_assessed', 'exempted']), value: z.number().nullable(), remark: z.string().max(120).optional() })).min(1).max(300),
});
