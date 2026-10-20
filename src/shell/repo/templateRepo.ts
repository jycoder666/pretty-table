import type { TemplateInstance } from '@/core'

export interface TemplateRepo {
  list(): Promise<TemplateInstance[]>
  get(templateId: string): Promise<TemplateInstance | null>
  save(inst: TemplateInstance): Promise<void>
  remove(templateId: string): Promise<void>
}
