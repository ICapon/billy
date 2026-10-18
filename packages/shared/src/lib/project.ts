import { z } from 'zod';

export const projectSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(60),
  createdAt: z.string(),
});

export const createProjectSchema = projectSchema.pick({ name: true });

export type Project = z.infer<typeof projectSchema>;
export type CreateProject = z.infer<typeof createProjectSchema>;
