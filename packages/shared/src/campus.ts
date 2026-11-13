import { z } from "zod";

export const campusSchema = z.object({
  id: z.string(),
  name: z.string(),
  nameEl: z.string(),
  city: z.string(),
  cityEl: z.string(),
});

export type Campus = z.infer<typeof campusSchema>;

export const campusesResponseSchema = z.object({
  campuses: z.array(campusSchema),
});

export type CampusesResponse = z.infer<typeof campusesResponseSchema>;
